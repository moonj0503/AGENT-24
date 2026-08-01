import { randomUUID } from "node:crypto";
import { createDatabase } from "@continuity/db";
import {
  type ActionPlan,
  type Checkpoint,
  type GapSession,
  GoalInferenceResultSchema,
  type RecoveryBrief,
  type ActivityEvent,
  type Goal,
} from "@continuity/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleWorkflowRepository } from "../src/repositories/drizzle-workflow-repository.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("PostgreSQL WorkflowRepository", () => {
  const ids = {
    workSessionId: `integration-ws-${randomUUID()}`,
    eventId: `integration-event-${randomUUID()}`,
    inferenceId: `integration-inference-${randomUUID()}`,
    candidateId: `integration-goal-${randomUUID()}`,
    checkpointId: `integration-checkpoint-${randomUUID()}`,
    gapId: `integration-gap-${randomUUID()}`,
    planId: `integration-plan-${randomUUID()}`,
    actionId: `integration-action-${randomUUID()}`,
    briefId: `integration-brief-${randomUUID()}`,
  };
  let sql: ReturnType<typeof createDatabase>["sql"];
  let repository: DrizzleWorkflowRepository;

  beforeAll(() => {
    const database = createDatabase(databaseUrl);
    sql = database.sql;
    repository = new DrizzleWorkflowRepository(database.db);
  });

  afterAll(async () => {
    await sql.unsafe("DELETE FROM recovery_briefs WHERE brief_id = $1", [ids.briefId]);
    await sql.unsafe("DELETE FROM gap_actions WHERE gap_id = $1", [ids.gapId]);
    await sql.unsafe("DELETE FROM action_plans WHERE plan_id = $1", [ids.planId]);
    await sql.unsafe("DELETE FROM gap_sessions WHERE gap_id = $1", [ids.gapId]);
    await sql.unsafe("DELETE FROM checkpoints WHERE checkpoint_id = $1", [ids.checkpointId]);
    await sql.unsafe("DELETE FROM goals WHERE goal_id = $1", [ids.candidateId]);
    await sql.unsafe("DELETE FROM goal_inferences WHERE inference_id = $1", [ids.inferenceId]);
    await sql.unsafe("DELETE FROM activity_events WHERE event_id = $1", [ids.eventId]);
    await sql.end();
  });

  it("persists observations, inferences, and goals through PostgreSQL", async () => {
    const event: ActivityEvent = {
      eventId: ids.eventId,
      type: "ACTIVE_WINDOW_CHANGED",
      occurredAt: "2026-08-01T09:00:00.000Z",
      application: { name: "Microsoft Word", category: "DOCUMENT" },
      resource: { title: "Integration Test.docx", kind: "DOCUMENT" },
      metadata: { idleSeconds: 0 },
    };

    const observationResult = await repository.ingestObservations({
      workSessionId: ids.workSessionId,
      events: [event],
    });
    expect(observationResult.acceptedEventIds).toEqual([ids.eventId]);

    const events = await repository.getActivityEvents(ids.workSessionId, [ids.eventId]);
    expect(events.get(ids.eventId)).toEqual(event);

    const inference = GoalInferenceResultSchema.parse({
      inferenceId: ids.inferenceId,
      requiresConfirmation: true,
      inferenceSummary: "Integration test goal.",
      candidates: [{
        candidateId: ids.candidateId,
        title: "Complete the integration test",
        description: "Verify PostgreSQL persistence.",
        confidence: 0.99,
        evidence: [{ type: "RESOURCE", description: "Integration Test.docx" }],
        suggestedGoalPath: ["Testing", "PostgreSQL"],
      }],
    });

    await repository.saveInference(ids.workSessionId, inference);
    expect(await repository.getInference(ids.inferenceId)).toEqual({
      workSessionId: ids.workSessionId,
      result: inference,
    });

    const goal: Goal = {
      goalId: ids.candidateId,
      title: "Complete the integration test",
      path: ["Testing", "PostgreSQL"],
      status: "IN_PROGRESS",
      source: "USER_CONFIRMED",
      confidence: 0.99,
    };
    await repository.saveGoal(ids.inferenceId, goal);

    const checkpoint: Checkpoint = {
      checkpointId: ids.checkpointId,
      goalId: goal.goalId,
      currentState: "Verifying the PostgreSQL lifecycle.",
      completedSincePrevious: ["Saved the confirmed goal"],
      openQuestions: [],
      likelyNextActions: [{ title: "Verify the Gap", estimatedMinutes: 5 }],
      relatedResources: [{ title: "Integration Test.docx", kind: "DOCUMENT" }],
      confidence: 0.99,
      createdAt: "2026-08-01T09:10:00.000Z",
    };
    await repository.saveCheckpoint(checkpoint);
    expect(await repository.getCheckpoint(ids.checkpointId)).toEqual(checkpoint);

    const gap: GapSession = {
      gapId: ids.gapId,
      workSessionId: ids.workSessionId,
      goalId: goal.goalId,
      checkpointId: checkpoint.checkpointId,
      status: "PLANNING",
      startedAt: "2026-08-01T09:15:00.000Z",
    };
    await repository.saveGapSession(gap);
    expect(await repository.getGapSession(ids.gapId)).toEqual(gap);

    const actionPlan: ActionPlan = {
      planId: ids.planId,
      gapId: gap.gapId,
      continuityObjective: "Verify action persistence.",
      actions: [{
        actionId: ids.actionId,
        type: "SEND_EMAIL",
        title: "Ask for approval",
        reason: "Verify decision persistence.",
        riskLevel: "HIGH",
        reversible: false,
        status: "POLICY_CHECKING",
      }],
    };
    await repository.saveActionPlan(actionPlan);
    const action = await repository.getAction(gap.gapId, ids.actionId);
    expect(action).toMatchObject({ actionId: ids.actionId, status: "POLICY_CHECKING" });
    if (!action) throw new Error("Expected persisted action.");
    await repository.updateAction(gap.gapId, { ...action, status: "EXECUTING" }, "APPROVE");
    expect(await repository.getAction(gap.gapId, ids.actionId)).toMatchObject({ status: "EXECUTING" });

    const recoveryBrief: RecoveryBrief = {
      briefId: ids.briefId,
      gapId: gap.gapId,
      goalBeforeGap: goal.title,
      completedActions: [],
      pendingActions: ["Ask for approval"],
      externalEffects: [],
      recommendedNextAction: { title: "Resume the workflow", estimatedMinutes: 5 },
      createdAt: "2026-08-01T09:20:00.000Z",
    };
    await repository.saveRecoveryBrief(recoveryBrief);
    const rows = await sql.unsafe("SELECT brief_id FROM recovery_briefs WHERE brief_id = $1", [ids.briefId]);
    expect(rows).toHaveLength(1);
  });
});
