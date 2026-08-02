import { describe, expect, it, vi } from "vitest";
import { ActionPlanSchema, CheckpointSchema, GapSessionSchema, GoalSchema, RecoveryBriefSchema } from "@continuity/contracts";
import { DesktopWorkflowController, type DesktopWorkflowControllerDependencies } from "./controller";
import { getDesktopWorkflowState } from "./store";

const goal = GoalSchema.parse({ goalId: "goal-real-id", title: "Ship integration", path: ["Project", "Integration"], status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.9 });
const checkpoint = CheckpointSchema.parse({ checkpointId: "checkpoint-real-id", goalId: goal.goalId, createdAt: "2026-08-02T00:00:00.000Z", currentState: "Ready", completedSincePrevious: [], openQuestions: [], likelyNextActions: [], relatedResources: [], confidence: 0.9 });
const session = GapSessionSchema.parse({ gapId: "gap-real-id", workSessionId: "session-real-id", goalId: goal.goalId, checkpointId: checkpoint.checkpointId, status: "EXECUTING", startedAt: "2026-08-02T00:01:00.000Z" });
const completedSession = GapSessionSchema.parse({ ...session, status: "COMPLETED", endedAt: "2026-08-02T00:03:00.000Z" });
const plan = ActionPlanSchema.parse({ planId: "plan-real-id", gapId: session.gapId, continuityObjective: "Preserve work", actions: [{ actionId: "action-real-id", type: "CREATE_TODO_DRAFT", title: "Preserve next step", reason: "Keep continuity", riskLevel: "LOW", reversible: true, status: "COMPLETED" }] });
const brief = RecoveryBriefSchema.parse({ briefId: "brief-real-id", gapId: session.gapId, goalBeforeGap: "Project / Integration", completedActions: [], pendingActions: [], externalEffects: [], recommendedNextAction: { title: "Resume", estimatedMinutes: 5 }, createdAt: "2026-08-02T00:02:00.000Z" });

function dependencies(): DesktopWorkflowControllerDependencies {
  return {
    createCheckpoint: vi.fn(async () => checkpoint),
    createGapSession: vi.fn(async () => session),
    runGap: vi.fn(async () => ({ actionPlan: plan, actionResults: [], recoveryBrief: brief, artifacts: [] })),
    decideGapAction: vi.fn(), fetchGapActions: vi.fn(),
    endGapSession: vi.fn(async () => completedSession),
    fetchRecoveryBrief: vi.fn(async () => brief),
  };
}

describe("DesktopWorkflowController", () => {
  it("prepares the real-ID lifecycle once without running tools before the user is idle", async () => {
    const deps = dependencies();
    const controller = new DesktopWorkflowController("session-real-id", goal, deps);
    await Promise.all([controller.startGap(), controller.startGap()]);
    expect(deps.createCheckpoint).toHaveBeenCalledTimes(1);
    expect(deps.createGapSession).toHaveBeenCalledWith("session-real-id", "goal-real-id", "checkpoint-real-id");
    expect(deps.runGap).not.toHaveBeenCalled();
    expect(getDesktopWorkflowState()).toMatchObject({ phase: "GAP_ACTIVE", checkpoint: { checkpointId: "checkpoint-real-id" }, gapSession: { gapId: "gap-real-id" } });
  });

  it("records a local Gap intent without creating backend state", () => {
    const deps = dependencies();
    const controller = new DesktopWorkflowController("session-real-id", goal, deps);
    controller.beginGapIntent();
    expect(getDesktopWorkflowState()).toEqual({
      workSessionId: "session-real-id",
      actionResults: [],
      artifacts: [],
      phase: "IDENTIFYING_GOAL",
      pending: false,
    });
    expect(deps.createCheckpoint).not.toHaveBeenCalled();
    expect(deps.createGapSession).not.toHaveBeenCalled();
    expect(deps.runGap).not.toHaveBeenCalled();
  });

  it("preserves completed setup when runtime execution fails at Gap completion", async () => {
    const deps = { ...dependencies(), runGap: vi.fn(async () => { throw new Error("runtime unavailable"); }) };
    const controller = new DesktopWorkflowController("session-real-id", goal, deps);
    await controller.startGap();
    await expect(controller.endGap()).rejects.toThrow("The Gap could not be completed");
    expect(getDesktopWorkflowState()).toMatchObject({ phase: "FAILED", checkpoint: { checkpointId: "checkpoint-real-id" }, gapSession: { gapId: "gap-real-id" }, pending: false });
  });

  it("ends the persisted Gap and reveals its runtime recovery brief", async () => {
    const deps = dependencies();
    const controller = new DesktopWorkflowController("session-real-id", goal, deps);
    await controller.startGap();
    await expect(controller.endGap()).resolves.toEqual(brief);
    expect(deps.runGap).toHaveBeenCalledWith(session);
    expect(deps.endGapSession).toHaveBeenCalledWith("gap-real-id");
    expect(deps.fetchRecoveryBrief).not.toHaveBeenCalled();
    expect(getDesktopWorkflowState().phase).toBe("RECOVERY_READY");
  });

  it("explicitly clears lifecycle state while retaining the work session identity", () => {
    const controller = new DesktopWorkflowController("session-real-id", goal, dependencies());
    controller.clear();
    expect(getDesktopWorkflowState()).toEqual({ workSessionId: "session-real-id", actionResults: [], artifacts: [], phase: "OBSERVING", pending: false });
  });
});
