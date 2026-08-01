import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalInferenceResultSchema, GoalSchema } from "@continuity/contracts";
import { clearConfirmedGoal, getConfirmedGoalSnapshot, setConfirmedGoal } from "../goals/confirmed-goal-store";
import { clearPendingGoalConfirmation, getPendingGoalConfirmationSnapshot } from "../goals/pending-confirmation-store";
import { dismissOverlay, getOverlaySnapshot, openOverlay } from "../../overlay/overlay-store";
import { candidateSignature } from "./stability";
import { GoalConfirmationBridge } from "./confirmation-bridge";
import type { ObservationSessionController } from "./observation-session-controller";
import { GOAL_CONFIRMATION_REQUESTED_EVENT, type GoalConfirmationRequested } from "./types";

const inference = GoalInferenceResultSchema.parse({
  inferenceId: "inference-bridge",
  candidates: [{ candidateId: "candidate-bridge", title: "Write report", description: "Report work", confidence: 0.91, evidence: [{ type: "RESOURCE", description: "Report" }], suggestedGoalPath: ["Project", "Report"] }],
  requiresConfirmation: true,
  inferenceSummary: "Report work may be active.",
});
const candidate = inference.candidates[0]!;
const request: GoalConfirmationRequested = {
  type: "GoalConfirmationRequested",
  inference,
  candidate,
  candidateSignature: candidateSignature(candidate),
  requestedAt: 100,
};
const goal = GoalSchema.parse({
  goalId: candidate.candidateId, title: candidate.title, path: candidate.suggestedGoalPath,
  status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: candidate.confidence,
});

function setup(options: {
  latestInference?: typeof inference;
  confirm?: () => Promise<typeof goal>;
} = {}) {
  const controller = {
    snooze: vi.fn(),
    clearSnooze: vi.fn(),
    getSnapshot: vi.fn(() => ({ latestInference: options.latestInference })),
  } as unknown as ObservationSessionController;
  const confirm = vi.fn(options.confirm ?? (async () => goal));
  const errors: string[] = [];
  const cancelled = vi.fn();
  const bridge = new GoalConfirmationBridge({
    controller,
    confirmGoal: confirm,
    now: () => Date.now(),
    snoozeDurationMs: 1_000,
    onError: (message) => errors.push(message),
    onDeferredGapStartCancelled: cancelled,
  });
  return { bridge, controller, confirm, errors, cancelled };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const eventTarget = new EventTarget() as Window;
  (globalThis as unknown as { window: Window }).window = eventTarget;
});

afterEach(() => {
  clearConfirmedGoal();
  clearPendingGoalConfirmation();
  dismissOverlay();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GoalConfirmationBridge", () => {
  it("listens once, validates the event, opens the existing overlay, and unsubscribes", async () => {
    const { bridge } = setup();
    const stop = await bridge.start();
    await bridge.start();
    const event = new Event(GOAL_CONFIRMATION_REQUESTED_EVENT) as Event & { detail?: unknown };
    event.detail = request;
    window.dispatchEvent(event);
    await Promise.resolve();
    expect(getOverlaySnapshot()).toMatchObject({ state: "GOAL_CONFIRMATION", inference });
    expect(getPendingGoalConfirmationSnapshot().pending?.reason).toBe("NEW_GOAL");
    stop();
    dismissOverlay();
    window.dispatchEvent(event);
    expect(getOverlaySnapshot().state).toBe("HIDDEN");
  });

  it("rejects malformed events and does not replace a higher-priority overlay", async () => {
    const { bridge } = setup();
    await bridge.start();
    const malformed = new Event(GOAL_CONFIRMATION_REQUESTED_EVENT) as Event & { detail?: unknown };
    malformed.detail = { type: "GoalConfirmationRequested" };
    window.dispatchEvent(malformed);
    expect(getPendingGoalConfirmationSnapshot().pending).toBeUndefined();
    openOverlay({ state: "APPROVAL_REQUIRED" });
    await expect(bridge.requestConfirmation(request)).resolves.toBe(false);
    expect(getOverlaySnapshot().state).toBe("APPROVAL_REQUIRED");
    bridge.stop();
  });

  it("classifies Goal changes and keeps the existing Goal on request", async () => {
    const current = GoalSchema.parse({ ...goal, goalId: "current", title: "Current Goal", path: ["Current"] });
    setConfirmedGoal(current);
    const { bridge } = setup();
    await bridge.requestConfirmation(request);
    expect(getPendingGoalConfirmationSnapshot().pending).toMatchObject({
      reason: "GOAL_CHANGE",
      previousGoal: current,
    });
    bridge.keepCurrent();
    expect(getConfirmedGoalSnapshot().confirmedGoal).toEqual(current);
    expect(bridge.isIgnored(request.candidateSignature)).toBe(true);
    expect(getPendingGoalConfirmationSnapshot().pending).toBeUndefined();
  });

  it("ignores only the current signature and suppresses it for the session", async () => {
    const { bridge } = setup();
    await bridge.requestConfirmation(request);
    bridge.ignoreCurrent();
    await expect(bridge.requestConfirmation(request)).resolves.toBe(false);
    expect(bridge.isIgnored(request.candidateSignature)).toBe(true);
    expect(bridge.isIgnored("other-signature")).toBe(false);
  });

  it("Later snoozes, dismisses, and allows requests after the configured duration", async () => {
    const { bridge, controller, cancelled } = setup();
    await bridge.requestConfirmation(request);
    bridge.later();
    expect(cancelled).not.toHaveBeenCalled();
    expect(controller.snooze).toHaveBeenCalledOnce();
    expect(getPendingGoalConfirmationSnapshot().pending).toBeUndefined();
    await expect(bridge.requestConfirmation(request)).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.clearSnooze).toHaveBeenCalledOnce();
    await expect(bridge.requestConfirmation(request)).resolves.toBe(true);
  });

  it("stores only the backend Goal after success and preserves pending state on failure", async () => {
    const successful = setup();
    await successful.bridge.requestConfirmation(request);
    await expect(successful.bridge.confirmCandidate(candidate.candidateId)).resolves.toEqual(goal);
    expect(successful.confirm).toHaveBeenCalledWith(inference, candidate.candidateId);
    expect(getConfirmedGoalSnapshot().confirmedGoal).toEqual(goal);
    expect(getPendingGoalConfirmationSnapshot().pending).toBeUndefined();

    clearConfirmedGoal();
    dismissOverlay();
    const failed = setup({ confirm: async () => { throw new Error("Confirmation unavailable"); } });
    await failed.bridge.requestConfirmation(request);
    await expect(failed.bridge.confirmCandidate(candidate.candidateId)).rejects.toThrow("Confirmation unavailable");
    expect(getConfirmedGoalSnapshot().confirmedGoal).toBeUndefined();
    expect(getPendingGoalConfirmationSnapshot().pending).toBeDefined();
    expect(getOverlaySnapshot().state).toBe("GOAL_CONFIRMATION");
  });

  it("prevents duplicate confirmation submission", async () => {
    let resolve!: (value: typeof goal) => void;
    const pendingResult = new Promise<typeof goal>((complete) => { resolve = complete; });
    const { bridge, confirm } = setup({ confirm: () => pendingResult });
    await bridge.requestConfirmation(request);
    const first = bridge.confirmCandidate(candidate.candidateId);
    const second = bridge.confirmCandidate(candidate.candidateId);
    expect(confirm).toHaveBeenCalledOnce();
    resolve(goal);
    await expect(Promise.all([first, second])).resolves.toEqual([goal, goal]);
  });

  it("enforces a confirmed Goal before Gap start and resumes once after confirmation", async () => {
    const start = vi.fn(async () => undefined);
    const { bridge } = setup({ latestInference: inference });
    await expect(bridge.requestGapStart(start)).resolves.toBe(false);
    await expect(bridge.requestGapStart(start)).resolves.toBe(false);
    expect(getPendingGoalConfirmationSnapshot().pending?.reason).toBe("GAP_START");
    expect(start).not.toHaveBeenCalled();
    await bridge.confirmCandidate(candidate.candidateId);
    expect(start).toHaveBeenCalledOnce();
  });

  it("requires fresh confirmation even when a previous Goal exists and does not start after failed confirmation", async () => {
    const previous = setup({ latestInference: inference });
    const start = vi.fn(async () => undefined);
    setConfirmedGoal(goal);
    await expect(previous.bridge.requestGapStart(start)).resolves.toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(getPendingGoalConfirmationSnapshot().pending?.reason).toBe("GAP_START");

    clearConfirmedGoal();
    dismissOverlay();
    const failedStart = vi.fn(async () => undefined);
    const failed = setup({ latestInference: inference, confirm: async () => { throw new Error("No confirmation"); } });
    await failed.bridge.requestGapStart(failedStart);
    await expect(failed.bridge.confirmCandidate(candidate.candidateId)).rejects.toThrow();
    expect(failedStart).not.toHaveBeenCalled();
  });

  it("waits for a future inference instead of rejecting Gap start", async () => {
    const { bridge, errors } = setup();
    const start = vi.fn(async () => undefined);
    await expect(bridge.requestGapStart(start)).resolves.toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    await bridge.requestConfirmation(request);
    await bridge.confirmCandidate(candidate.candidateId);
    expect(start).toHaveBeenCalledOnce();
  });

  it("cancels the pending Gap intent when Goal confirmation is deferred", async () => {
    const { bridge, cancelled } = setup({ latestInference: inference });
    await bridge.requestGapStart(vi.fn(async () => undefined));
    bridge.later();
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
