import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoalInferenceResultSchema,
  GoalSchema,
  type ActivityEvent,
  type GoalInferenceResult,
} from "@continuity/contracts";
import { DEFAULT_OBSERVATION_SESSION_CONFIG, ObservationSessionController } from "./observation-session-controller";
import { candidateSignature, evaluateStability } from "./stability";
import { createDefaultObservationState, type PersistedObservationState } from "./persistence";
import type { QueueLimits } from "./queue";
import type {
  GoalConfirmationRequested,
  ObservationSessionConfig,
  ObservationSessionDependencies,
} from "./types";

const config: ObservationSessionConfig = {
  observationIntervalMs: 10,
  screenshotIntervalMs: 20,
  uploadIntervalMs: 30,
  inferenceIntervalMs: 50,
  confidenceThreshold: 0.8,
  stableInferenceCount: 2,
  inferenceContextEventLimit: 12,
  corroboratedConfidenceThreshold: 0.72,
  corroboratedInferenceCount: 2,
  popupCooldownMs: 100,
};

function event(eventId: string, title: string, type: ActivityEvent["type"] = "ACTIVE_WINDOW_CHANGED"): ActivityEvent {
  return {
    eventId,
    type,
    occurredAt: "2026-08-01T09:00:00.000Z",
    application: { name: "Writer", category: "DOCUMENT" },
    resource: { title, kind: "DOCUMENT" },
    metadata: { idleSeconds: 0 },
  };
}

function inference(candidateId = "candidate-1", confidence = 0.9): GoalInferenceResult {
  return GoalInferenceResultSchema.parse({
    inferenceId: `inference-${candidateId}`,
    candidates: [{
      candidateId,
      title: "Write the final report",
      description: "Report writing may be active.",
      confidence,
      evidence: [{ type: "RESOURCE", description: "Final report" }],
      suggestedGoalPath: ["Project", "Report"],
    }],
    requiresConfirmation: true,
    inferenceSummary: "Report work may be active.",
  });
}

function setup(options: {
  observations?: Array<ActivityEvent | null | Error>;
  inferences?: Array<GoalInferenceResult | Error>;
  confirmedGoal?: ReturnType<typeof GoalSchema.parse>;
  now?: () => number;
  initial?: PersistedObservationState;
  queueLimits?: QueueLimits;
} = {}) {
  const observations = [...(options.observations ?? [])];
  const inferences = [...(options.inferences ?? [inference()])];
  const upload = vi.fn(async (_session: string, events: readonly ActivityEvent[]) => ({
    workSessionId: "work-session",
    acceptedEventIds: events.map(({ eventId }) => eventId),
  }));
  const infer = vi.fn(async (
    _workSessionId: string,
    _eventIds: readonly string[],
    _previousGoalId?: string,
  ) => {
    const next = inferences.shift() ?? inference();
    if (next instanceof Error) throw next;
    return next;
  });
  const collectActivity = vi.fn(async () => {
    const next = observations.shift() ?? null;
    if (next instanceof Error) throw next;
    return next;
  });
  const confirmations: GoalConfirmationRequested[] = [];
  const interruptions: Array<{ durationMs: number }> = [];
  const warnings: string[] = [];
  const captureScreenshot = vi.fn(async () => undefined);
  const dependencies: ObservationSessionDependencies = {
    collectActivity,
    captureScreenshot,
    upload,
    infer,
    getConfirmedGoal: () => options.confirmedGoal,
    canRequestConfirmation: () => true,
    onConfirmationRequested: (requested) => confirmations.push(requested),
    onInterruptionResumed: (event) => interruptions.push(event),
    onWarning: (message) => warnings.push(message),
    now: options.now ?? (() => Date.now()),
  };
  return {
    controller: new ObservationSessionController("work-session", dependencies, config, options.initial, options.queueLimits),
    collectActivity,
    captureScreenshot,
    upload,
    infer,
    confirmations,
    interruptions,
    warnings,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ObservationSessionController lifecycle and scheduling", () => {
  it("checks every twenty seconds and accepts one high-confidence result by default", () => {
    expect(DEFAULT_OBSERVATION_SESSION_CONFIG.inferenceIntervalMs).toBe(20_000);
    expect(DEFAULT_OBSERVATION_SESSION_CONFIG.screenshotIntervalMs).toBe(20_000);
    expect(DEFAULT_OBSERVATION_SESSION_CONFIG.stableInferenceCount).toBe(1);
    expect(DEFAULT_OBSERVATION_SESSION_CONFIG.inferenceContextEventLimit).toBe(12);
  });

  it("captures at Gap observation start and then every configured screenshot interval", async () => {
    const session = setup();
    session.controller.beginGapObservation();
    await Promise.resolve();
    expect(session.captureScreenshot).toHaveBeenCalledOnce();
    session.controller.start();
    await vi.advanceTimersByTimeAsync(19);
    expect(session.captureScreenshot).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(session.captureScreenshot).toHaveBeenCalledTimes(2);
  });

  it("starts, stops, and does not duplicate timers on repeated start", async () => {
    const session = setup({ observations: [event("event-1", "Report")] });
    expect(session.controller.getSnapshot().status).toBe("STOPPED");
    session.controller.start();
    session.controller.start();
    expect(session.controller.getSnapshot().status).toBe("RUNNING");
    await vi.advanceTimersByTimeAsync(10);
    expect(session.collectActivity).toHaveBeenCalledOnce();
    session.controller.stop();
    expect(session.controller.getSnapshot()).toMatchObject({
      status: "STOPPED",
      pendingObservationCount: 0,
      pendingInferenceCount: 0,
      consecutiveCandidateCount: 0,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(session.collectActivity).toHaveBeenCalledOnce();
  });

  it("pauses every cycle and resumes scheduling", async () => {
    const session = setup({ observations: [event("event-1", "Report"), event("event-2", "Notes")] });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(10);
    session.controller.pause();
    expect(session.controller.getSnapshot().status).toBe("PAUSED");
    await vi.advanceTimersByTimeAsync(100);
    expect(session.collectActivity).toHaveBeenCalledOnce();
    expect(session.upload).not.toHaveBeenCalled();
    expect(session.infer).not.toHaveBeenCalled();
    session.controller.resume();
    await vi.advanceTimersByTimeAsync(10);
    expect(session.controller.getSnapshot().status).toBe("RUNNING");
    expect(session.collectActivity).toHaveBeenCalledTimes(2);
    session.controller.stop();
  });

  it("observes, uploads changed activity, and infers only from uploaded events", async () => {
    const first = event("event-1", "Report");
    const session = setup({ observations: [first, first, null, null, null] });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(session.controller.getSnapshot().pendingObservationCount).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(session.upload).toHaveBeenCalledWith("work-session", [first]);
    expect(session.controller.getSnapshot()).toMatchObject({
      pendingObservationCount: 0,
      pendingInferenceCount: 1,
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(session.infer).toHaveBeenCalledWith("work-session", [first.eventId], undefined);
    expect(session.controller.getSnapshot()).toMatchObject({
      pendingInferenceCount: 0,
      consecutiveCandidateCount: 1,
    });
    session.controller.stop();
  });

  it("does not upload unchanged activity or infer without new uploaded observations", async () => {
    const unchanged = event("same-event", "Report");
    const session = setup({ observations: [unchanged, unchanged, unchanged] });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(session.upload).toHaveBeenCalledOnce();
    expect(session.infer).toHaveBeenCalledOnce();
    session.controller.stop();
  });

  it("includes a bounded history of already-sanitized observations in later inference", async () => {
    const first = event("event-1", "Report");
    const second = event("event-2", "References");
    const session = setup({ observations: [first, null, null, second, null, null] });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.infer.mock.calls[1]?.[1]).toEqual([first.eventId, second.eventId]);
    session.controller.stop();
  });

  it("reports a return after a previously observed idle transition without collecting extra data", async () => {
    let now = 0;
    const session = setup({
      now: () => now,
      observations: [event("idle", "Report", "USER_IDLE"), event("active", "Report", "USER_ACTIVITY")],
    });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(10);
    now = 45_000;
    await vi.advanceTimersByTimeAsync(10);
    expect(session.interruptions).toMatchObject([{ observedIdleAt: 0, resumedAt: 45_000, durationMs: 45_000 }]);
    session.controller.stop();
  });

  it("bounds retained uploaded IDs in memory and clears them for a new Gap", () => {
    const initial = {
      ...createDefaultObservationState(0, "00000000-0000-4000-8000-000000000001"),
      uploadedObservationEventIds: ["first", "second", "third"],
    };
    const session = setup({
      initial,
      queueLimits: { maximumEvents: 2, maximumAgeMs: 60_000 },
    });
    expect(session.controller.getPersistentFields().uploadedObservationEventIds).toEqual(["second", "third"]);
    session.controller.beginGapObservation();
    expect(session.controller.getPersistentFields().uploadedObservationEventIds).toEqual([]);
  });

  it("retries observation and upload failures without losing pending activity", async () => {
    const changed = event("event-1", "Report");
    const session = setup({ observations: [new Error("observer unavailable"), changed] });
    session.upload.mockRejectedValueOnce(new Error("API unavailable"));
    session.controller.start();
    await vi.advanceTimersByTimeAsync(20);
    expect(session.collectActivity).toHaveBeenCalledTimes(2);
    expect(session.controller.getSnapshot().pendingObservationCount).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(session.controller.getSnapshot().pendingObservationCount).toBe(1);
    await vi.advanceTimersByTimeAsync(2_030);
    expect(session.upload).toHaveBeenCalledTimes(2);
    expect(session.controller.getSnapshot().pendingObservationCount).toBe(0);
    session.controller.stop();
  });

  it("keeps the prior inference and retries the same event IDs after inference failure", async () => {
    const session = setup({
      observations: [event("event-1", "Report")],
      inferences: [new Error("model unavailable"), inference()],
    });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(session.infer).toHaveBeenCalledOnce();
    expect(session.controller.getSnapshot()).toMatchObject({
      latestInference: undefined,
      pendingInferenceCount: 1,
    });
    expect(session.warnings).toContain("Goal identification is temporarily unavailable.");
    await vi.advanceTimersByTimeAsync(50);
    expect(session.infer).toHaveBeenCalledTimes(2);
    expect(session.infer.mock.calls[1]?.[1]).toEqual(["event-1"]);
    expect(session.controller.getSnapshot().latestInference).toBeDefined();
    session.controller.stop();
  });
});

describe("candidate stability and confirmation requests", () => {
  it("generates deterministic signatures independent of candidate identity and whitespace", () => {
    const first = inference("first").candidates[0]!;
    const second = {
      ...inference("second").candidates[0]!,
      title: "  WRITE the   final report ",
      suggestedGoalPath: [" project ", "REPORT"],
    };
    expect(candidateSignature(first)).toBe(candidateSignature(second));
  });

  it("resets the consecutive counter when the top candidate changes", () => {
    const stable = inference("stable");
    const changed = GoalInferenceResultSchema.parse({
      ...inference("changed"),
      candidates: [{
        ...inference("changed").candidates[0],
        title: "Review project references",
        suggestedGoalPath: ["Project", "References"],
      }],
    });
    const session = setup({
      observations: [event("event-1", "Report"), null, null, null, null, event("event-2", "References")],
      inferences: [stable, changed],
    });
    session.controller.start();
    return vi.advanceTimersByTimeAsync(100).then(() => {
      expect(session.controller.getSnapshot()).toMatchObject({
        consecutiveCandidateCount: 1,
        candidateSignature: candidateSignature(changed.candidates[0]!),
      });
      session.controller.stop();
    });
  });

  it("emits one internal confirmation request after repeated stable inference", async () => {
    const session = setup({
      observations: [event("event-1", "Report"), null, null, null, null, event("event-2", "Notes")],
      inferences: [inference("first"), inference("second")],
    });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.confirmations).toHaveLength(1);
    expect(session.confirmations[0]).toMatchObject({
      type: "GoalConfirmationRequested",
      candidateSignature: candidateSignature(inference().candidates[0]!),
    });
    expect(session.controller.getSnapshot()).toMatchObject({
      consecutiveCandidateCount: 2,
      lastPopupAt: 100,
    });
    session.controller.stop();
  });

  it("offers a repeated moderately-confident candidate after corroboration", async () => {
    const lowButRepeated = inference("first", 0.75);
    const session = setup({
      observations: [event("event-1", "Report"), null, null, null, null, event("event-2", "Notes")],
      inferences: [lowButRepeated, inference("second", 0.75)],
    });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.confirmations).toHaveLength(1);
    session.controller.stop();
  });

  it("persists confidence samples used for corroborated confirmation", async () => {
    const session = setup({
      observations: [event("event-1", "Report")],
      inferences: [inference("first", 0.75)],
    });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(session.controller.getPersistentFields().candidateConfidenceSamples).toEqual([0.75]);
    session.controller.stop();
  });

  it("supplies the confirmed Goal ID and keeps a matching inference silent", async () => {
    const confirmedGoal = GoalSchema.parse({
      goalId: "confirmed-goal",
      title: "Write the final report",
      path: ["Project", "Report"],
      status: "IN_PROGRESS",
      source: "USER_CONFIRMED",
      confidence: 1,
    });
    const session = setup({
      confirmedGoal,
      observations: [event("event-1", "Report"), null, null, null, null, event("event-2", "Notes")],
      inferences: [inference("first"), inference("second")],
    });
    session.controller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.infer.mock.calls.map((call) => call[2])).toEqual([
      confirmedGoal.goalId,
      confirmedGoal.goalId,
    ]);
    expect(session.confirmations).toEqual([]);
    session.controller.stop();
  });

  it("keeps observing for low confidence, snooze, cooldown, overlay blocking, or the confirmed Goal", () => {
    const candidate = inference().candidates[0]!;
    const signature = candidateSignature(candidate);
    const base = {
      candidate,
      signature,
      consecutiveCount: 2,
      confidenceThreshold: 0.8,
      stableInferenceCount: 2,
      snoozed: false,
      canRequestConfirmation: true,
      now: 200,
      popupCooldownMs: 100,
    };
    expect(evaluateStability(base)).toBe("SHOW_CONFIRMATION");
    expect(evaluateStability({ ...base, candidate: { ...candidate, confidence: 0.79 } })).toBe("KEEP_OBSERVING");
    expect(evaluateStability({ ...base, snoozed: true })).toBe("KEEP_OBSERVING");
    expect(evaluateStability({ ...base, canRequestConfirmation: false })).toBe("KEEP_OBSERVING");
    expect(evaluateStability({ ...base, lastPopupAt: 150 })).toBe("KEEP_OBSERVING");
    expect(evaluateStability({
      ...base,
      confirmedGoal: GoalSchema.parse({
        goalId: "goal-confirmed",
        title: candidate.title,
        path: candidate.suggestedGoalPath,
        status: "IN_PROGRESS",
        source: "USER_CONFIRMED",
        confidence: 1,
      }),
    })).toBe("KEEP_OBSERVING");
  });

  it("supports controller-level snooze without changing lifecycle state", () => {
    const session = setup();
    session.controller.start();
    session.controller.snooze();
    expect(session.controller.getSnapshot()).toMatchObject({ status: "RUNNING", snoozed: true });
    session.controller.clearSnooze();
    expect(session.controller.getSnapshot().snoozed).toBe(false);
    session.controller.stop();
  });
});
