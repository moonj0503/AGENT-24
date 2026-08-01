import { afterEach, describe, expect, it } from "vitest";
import { GoalSchema } from "@continuity/contracts";
import { createDesktopObservationWorkflow } from "./desktop-session";
import { MemoryObservationPersistence, createDefaultObservationState } from "./persistence";
import { getConfirmedGoalSnapshot } from "../goals/confirmed-goal-store";

const sessionId = "00000000-0000-4000-8000-000000000001";
let workflow: Awaited<ReturnType<typeof createDesktopObservationWorkflow>> | undefined;
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
});
