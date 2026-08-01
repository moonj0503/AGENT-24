import { and, eq, inArray } from "drizzle-orm";
import {
  activityEvents,
  goalInferences,
  goals,
  type Database,
} from "@continuity/db";
import {
  GoalInferenceResultSchema,
  ObservationIngestionResultSchema,
  type ActivityEvent,
  type Goal,
  type GoalInferenceResult,
  type ObservationRequest,
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
}
