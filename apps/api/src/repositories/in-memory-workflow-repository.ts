import {
  ObservationIngestionResultSchema,
  type ActivityEvent,
  type Goal,
  type GoalInferenceResult,
  type ObservationRequest,
} from "@continuity/contracts";
import type { StoredGoalInference, WorkflowRepository } from "./workflow-repository.js";

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly eventsByWorkSession = new Map<string, Map<string, ActivityEvent>>();
  private readonly inferences = new Map<string, StoredGoalInference>();
  private readonly goals = new Map<string, Goal>();

  async ingestObservations(request: ObservationRequest) {
    const events = this.eventsByWorkSession.get(request.workSessionId) ?? new Map<string, ActivityEvent>();
    for (const event of request.events) {
      events.set(event.eventId, event);
    }
    this.eventsByWorkSession.set(request.workSessionId, events);

    return ObservationIngestionResultSchema.parse({
      workSessionId: request.workSessionId,
      acceptedEventIds: request.events.map((event) => event.eventId),
    });
  }

  async getActivityEvents(workSessionId: string, eventIds: readonly string[]) {
    const events = this.eventsByWorkSession.get(workSessionId);
    return new Map(eventIds.flatMap((eventId) => {
      const event = events?.get(eventId);
      return event ? [[eventId, event] as const] : [];
    }));
  }

  async saveInference(workSessionId: string, result: GoalInferenceResult): Promise<void> {
    this.inferences.set(result.inferenceId, { workSessionId, result });
  }

  async getInference(inferenceId: string): Promise<StoredGoalInference | null> {
    return this.inferences.get(inferenceId) ?? null;
  }

  async saveGoal(_inferenceId: string, goal: Goal): Promise<void> {
    this.goals.set(goal.goalId, goal);
  }
}
