import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalSchema } from "@continuity/contracts";
import { createDesktopObservationWorkflow } from "./desktop-session";
import { MemoryObservationPersistence, createDefaultObservationState } from "./persistence";
import { getConfirmedGoalSnapshot } from "../goals/confirmed-goal-store";
import { getDesktopWorkflowState } from "../workflow/store";

const sessionId = "00000000-0000-4000-8000-000000000001";
let workflow: Awaited<ReturnType<typeof createDesktopObservationWorkflow>> | undefined;
beforeEach(() => {
  (globalThis as unknown as { window: Window }).window = new EventTarget() as Window;
});
afterEach(async () => { await workflow?.shutdown(); workflow = undefined; });

describe("desktop observation workflow initialization", () => {
  it("is single-flight and restores the confirmed Goal before starting", async () => {
    const goal = GoalSchema.parse({ goalId: "goal-1", title: "Report", path: ["Project", "Report"], status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 1 });
    const persistence = new MemoryObservationPersistence({ ...createDefaultObservationState(0, sessionId), confirmedGoal: goal });
    const first = createDesktopObservationWorkflow({ persistence, now: () => 1 });
    const second = createDesktopObservationWorkflow({ persistence, now: () => 1 });
    expect(first).toBe(second);
    workflow = await first;
    expect(workflow.workSessionId).toBe(sessionId);
    expect(getConfirmedGoalSnapshot().confirmedGoal).toEqual(goal);
  });

  it("preserves a paused preference and pending queue across initialization", async () => {
    const event = { eventId: "event-1", type: "ACTIVE_WINDOW_CHANGED" as const, occurredAt: "2026-08-01T00:00:00.000Z", application: { name: "Writer", category: "DOCUMENT" as const }, metadata: { idleSeconds: 0 } };
    const persistence = new MemoryObservationPersistence({ ...createDefaultObservationState(0, sessionId), observationStatus: "PAUSED", pendingObservations: [event] });
    workflow = await createDesktopObservationWorkflow({ persistence, now: () => 1 });
    expect(workflow.session.getSnapshot()).toMatchObject({ status: "PAUSED", pendingObservationCount: 1 });
    await workflow.shutdown(); workflow = undefined;
    const saved = await persistence.load();
    expect(saved).toMatchObject({ observationStatus: "PAUSED", pendingObservations: [event] });
  });

  it("starts observation only after the user begins Gap Mode", async () => {
    const persistence = new MemoryObservationPersistence(createDefaultObservationState(0, sessionId));
    workflow = await createDesktopObservationWorkflow({ persistence, now: () => 1 });
    workflow.start();
    await Promise.resolve();
    expect(workflow.session.getSnapshot().status).toBe("STOPPED");
    await workflow.beginGapMode();
    expect(workflow.session.getSnapshot().status).toBe("RUNNING");
    await workflow.endGapMode();
    expect(workflow.session.getSnapshot().status).toBe("STOPPED");
  });

  it("persists and restores a pending Gap-first intent without creating a backend Gap", async () => {
    const persistence = new MemoryObservationPersistence(createDefaultObservationState(0, sessionId));
    workflow = await createDesktopObservationWorkflow({ persistence, now: () => 1 });
    await workflow.beginGapMode();
    expect(workflow.getState()).toMatchObject({ gapIntentPending: true, confirmedGoal: undefined });
    expect(getDesktopWorkflowState().phase).toBe("IDENTIFYING_GOAL");
    await workflow.shutdown();
    workflow = undefined;

    workflow = await createDesktopObservationWorkflow({ persistence, now: () => 2 });
    workflow.start();
    expect(workflow.getState().gapIntentPending).toBe(true);
    await vi.waitFor(() => expect(getDesktopWorkflowState().phase).toBe("IDENTIFYING_GOAL"));
    expect(workflow.session.getSnapshot().status).toBe("RUNNING");
  });
});
