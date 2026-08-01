import { and, eq, inArray } from "drizzle-orm";
import {
  activityEvents,
  actionPlans,
  checkpoints,
  gapActions,
  gapSessions,
  goalInferences,
  goals,
  recoveryBriefs,
  type Database,
} from "@continuity/db";
import {
  ActionPlanSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalInferenceResultSchema,
  GoalSchema,
  ObservationIngestionResultSchema,
  PlannedActionSchema,
  RecoveryBriefSchema,
  type ActivityEvent,
  type ActionPlan,
  type Checkpoint,
  type GapSession,
  type Goal,
  type GoalInferenceResult,
  type ObservationRequest,
  type PlannedAction,
  type RecoveryBrief,
} from "@continuity/contracts";
import type { StoredGoalInference, WorkflowRepository } from "./workflow-repository.js";

export class DrizzleWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: Database) {}

  async ingestObservations(request: ObservationRequest) {
    await this.db.insert(activityEvents).values(request.events.map((event) => ({
      eventId: event.eventId,
      workSessionId: request.workSessionId,
      eventData: event,
      occurredAt: new Date(event.occurredAt),
    }))).onConflictDoNothing();

    return ObservationIngestionResultSchema.parse({
      workSessionId: request.workSessionId,
      acceptedEventIds: request.events.map((event) => event.eventId),
    });
  }

  async getActivityEvents(workSessionId: string, eventIds: readonly string[]) {
    if (eventIds.length === 0) return new Map<string, ActivityEvent>();

    const rows = await this.db.select({ eventId: activityEvents.eventId, eventData: activityEvents.eventData })
      .from(activityEvents)
      .where(and(
        eq(activityEvents.workSessionId, workSessionId),
        inArray(activityEvents.eventId, [...eventIds]),
      ));

    return new Map<string, ActivityEvent>(rows.map((row) => [row.eventId, row.eventData as ActivityEvent]));
  }

  async saveInference(workSessionId: string, result: GoalInferenceResult): Promise<void> {
    await this.db.insert(goalInferences).values({
      inferenceId: result.inferenceId,
      workSessionId,
      result,
    }).onConflictDoUpdate({
      target: goalInferences.inferenceId,
      set: { workSessionId, result },
    });
  }

  async getInference(inferenceId: string): Promise<StoredGoalInference | null> {
    const [row] = await this.db.select({
      workSessionId: goalInferences.workSessionId,
      result: goalInferences.result,
    }).from(goalInferences).where(eq(goalInferences.inferenceId, inferenceId)).limit(1);

    if (!row) return null;
    return {
      workSessionId: row.workSessionId,
      result: GoalInferenceResultSchema.parse(row.result),
    };
  }

  async saveGoal(inferenceId: string, goal: Goal): Promise<void> {
    await this.db.insert(goals).values({
      goalId: goal.goalId,
      inferenceId,
      title: goal.title,
      path: goal.path,
      status: goal.status,
      source: goal.source,
      confidence: goal.confidence,
    }).onConflictDoUpdate({
      target: goals.goalId,
      set: {
        inferenceId,
        title: goal.title,
        path: goal.path,
        status: goal.status,
        source: goal.source,
        confidence: goal.confidence,
      },
    });
  }

  async getGoal(goalId: string): Promise<Goal | null> {
    const [row] = await this.db.select({
      goalId: goals.goalId,
      title: goals.title,
      path: goals.path,
      status: goals.status,
      source: goals.source,
      confidence: goals.confidence,
    }).from(goals).where(eq(goals.goalId, goalId)).limit(1);
    return row ? GoalSchema.parse(row) : null;
  }

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.db.insert(checkpoints).values({
      checkpointId: checkpoint.checkpointId,
      goalId: checkpoint.goalId,
      checkpointData: checkpoint,
    }).onConflictDoUpdate({
      target: checkpoints.checkpointId,
      set: { goalId: checkpoint.goalId, checkpointData: checkpoint },
    });
  }

  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    const [row] = await this.db.select({ checkpointData: checkpoints.checkpointData })
      .from(checkpoints).where(eq(checkpoints.checkpointId, checkpointId)).limit(1);
    return row ? CheckpointSchema.parse(row.checkpointData) : null;
  }

  async saveGapSession(gapSession: GapSession): Promise<void> {
    await this.db.insert(gapSessions).values({
      gapId: gapSession.gapId,
      workSessionId: gapSession.workSessionId,
      goalId: gapSession.goalId,
      checkpointId: gapSession.checkpointId,
      status: gapSession.status,
      startedAt: new Date(gapSession.startedAt),
      endedAt: gapSession.endedAt ? new Date(gapSession.endedAt) : null,
    }).onConflictDoUpdate({
      target: gapSessions.gapId,
      set: {
        workSessionId: gapSession.workSessionId,
        goalId: gapSession.goalId,
        checkpointId: gapSession.checkpointId,
        status: gapSession.status,
        startedAt: new Date(gapSession.startedAt),
        endedAt: gapSession.endedAt ? new Date(gapSession.endedAt) : null,
      },
    });
  }

  async getGapSession(gapId: string): Promise<GapSession | null> {
    const [row] = await this.db.select().from(gapSessions).where(eq(gapSessions.gapId, gapId)).limit(1);
    if (!row) return null;
    return GapSessionSchema.parse({
      gapId: row.gapId,
      workSessionId: row.workSessionId,
      goalId: row.goalId,
      checkpointId: row.checkpointId,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      ...(row.endedAt ? { endedAt: row.endedAt.toISOString() } : {}),
    });
  }

  async saveActionPlan(actionPlan: ActionPlan): Promise<void> {
    await this.db.insert(actionPlans).values({
      planId: actionPlan.planId,
      gapId: actionPlan.gapId,
      planData: actionPlan,
    }).onConflictDoUpdate({
      target: actionPlans.planId,
      set: { gapId: actionPlan.gapId, planData: actionPlan },
    });

    await Promise.all(actionPlan.actions.map((action) => this.db.insert(gapActions).values({
      gapId: actionPlan.gapId,
      actionId: action.actionId,
      actionData: action,
      status: action.status,
    }).onConflictDoUpdate({
      target: [gapActions.gapId, gapActions.actionId],
      set: { actionData: action, status: action.status, updatedAt: new Date() },
    })));
  }

  async getAction(gapId: string, actionId: string): Promise<PlannedAction | null> {
    const [row] = await this.db.select({ actionData: gapActions.actionData })
      .from(gapActions).where(and(eq(gapActions.gapId, gapId), eq(gapActions.actionId, actionId))).limit(1);
    return row ? PlannedActionSchema.parse(row.actionData) : null;
  }

  async updateAction(
    gapId: string,
    action: PlannedAction,
    decision?: "APPROVE" | "REJECT",
    reason?: string,
  ): Promise<void> {
    await this.db.update(gapActions).set({
      actionData: action,
      status: action.status,
      decision,
      decisionReason: reason,
      updatedAt: new Date(),
    }).where(and(eq(gapActions.gapId, gapId), eq(gapActions.actionId, action.actionId)));
  }

  async saveRecoveryBrief(recoveryBrief: RecoveryBrief): Promise<void> {
    await this.db.insert(recoveryBriefs).values({
      briefId: recoveryBrief.briefId,
      gapId: recoveryBrief.gapId,
      briefData: recoveryBrief,
    }).onConflictDoUpdate({
      target: recoveryBriefs.briefId,
      set: { gapId: recoveryBrief.gapId, briefData: recoveryBrief },
    });
  }
}
