import { expect, it } from "vitest";
import type {
  ActionPlan,
  ActionResult,
  Checkpoint,
  GapSession,
  Goal,
  RecoveryBrief,
} from "@continuity/contracts";
import { buildApp } from "../src/app.js";
import { InMemoryWorkflowRepository } from "../src/repositories/in-memory-workflow-repository.js";
import { createGapHistoryService } from "../src/services/gap-history-service.js";

const goal: Goal = {
  goalId: "goal-history-001",
  title: "Verify the History screen",
  path: ["Demo", "History"],
  status: "IN_PROGRESS",
  source: "USER_CONFIRMED",
  confidence: 0.91,
};

const checkpoint: Checkpoint = {
  checkpointId: "checkpoint-history-001",
  goalId: goal.goalId,
  currentState: "The recovery plan has been generated.",
  completedSincePrevious: ["Saved the action result"],
  openQuestions: [],
  likelyNextActions: [{ title: "Show the recovery brief", estimatedMinutes: 2 }],
  relatedResources: [{ title: "History", kind: "DOCUMENT" }],
  confidence: 0.91,
  createdAt: "2026-08-02T12:00:00.000Z",
};

const gap: GapSession = {
  gapId: "gap-history-001",
  workSessionId: "ws-history-001",
  goalId: goal.goalId,
  checkpointId: checkpoint.checkpointId,
  status: "COMPLETED",
  startedAt: "2026-08-02T12:01:00.000Z",
  endedAt: "2026-08-02T12:05:00.000Z",
};

const actionPlan: ActionPlan = {
  planId: "plan-history-001",
  gapId: gap.gapId,
  continuityObjective: "Prepare the user to resume safely.",
  actions: [{
    actionId: "action-history-001",
    type: "CREATE_TODO_DRAFT",
    title: "Draft the next task",
    reason: "The user can review it after returning.",
    riskLevel: "LOW",
    reversible: true,
    status: "COMPLETED",
  }],
};

const actionResult: ActionResult = {
  actionId: "action-history-001",
  status: "COMPLETED",
  summary: "Created a draft of the next task.",
  externalEffect: "NONE",
  occurredAt: "2026-08-02T12:03:00.000Z",
};

const recoveryBrief: RecoveryBrief = {
  briefId: "brief-history-001",
  gapId: gap.gapId,
  goalBeforeGap: goal.title,
  completedActions: [actionPlan.actions[0].title],
  pendingActions: [],
  externalEffects: [],
  recommendedNextAction: { title: "Review the drafted task", estimatedMinutes: 2 },
  createdAt: "2026-08-02T12:04:00.000Z",
};

it("returns persisted Gap history, action decisions/results, and the recovery brief", async () => {
  const repository = new InMemoryWorkflowRepository({
    goals: [goal],
    checkpoints: [checkpoint],
    gapSessions: [gap],
  });
  await repository.saveActionPlan(actionPlan);
  await repository.updateAction(gap.gapId, actionPlan.actions[0], "APPROVE");
  await repository.saveActionResult(gap.gapId, actionResult);
  await repository.saveRecoveryBrief(recoveryBrief);
  const app = buildApp({ gapHistoryService: createGapHistoryService(repository) });

  const list = await app.inject({ method: "GET", url: "/api/v1/gaps?status=COMPLETED" });
  expect(list.statusCode).toBe(200);
  expect(list.json()).toMatchObject({
    items: [{ gapSession: { gapId: gap.gapId, status: "COMPLETED" }, recoveryBrief: { briefId: recoveryBrief.briefId } }],
  });

  const detail = await app.inject({ method: "GET", url: `/api/v1/gaps/${gap.gapId}` });
  expect(detail.statusCode).toBe(200);
  expect(detail.json()).toMatchObject({
    gapSession: { gapId: gap.gapId },
    goal: { goalId: goal.goalId },
    checkpoint: { checkpointId: checkpoint.checkpointId },
    actions: [{
      action: { actionId: actionResult.actionId, status: "COMPLETED" },
      decision: "APPROVE",
      result: actionResult,
    }],
  });

  const actions = await app.inject({ method: "GET", url: `/api/v1/gaps/${gap.gapId}/actions` });
  expect(actions.statusCode).toBe(200);
  expect(actions.json()).toMatchObject({ actions: [{ result: actionResult }] });

  const brief = await app.inject({ method: "GET", url: `/api/v1/gaps/${gap.gapId}/recovery-brief` });
  expect(brief.statusCode).toBe(200);
  expect(brief.json()).toEqual(recoveryBrief);

  const missing = await app.inject({ method: "GET", url: "/api/v1/gaps/does-not-exist" });
  expect(missing.statusCode).toBe(404);
  await app.close();
});
