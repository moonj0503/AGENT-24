import {
  type ActionPlan,
  ObservationIngestionResultSchema,
  type ActivityEvent,
  type Checkpoint,
  type GapSession,
  type Goal,
  type GoalInferenceResult,
  type ObservationRequest,
  type PlannedAction,
  type RecoveryBrief,
} from "@continuity/contracts";
import type { StoredGoalInference, WorkflowRepository } from "./workflow-repository.js";

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly eventsByWorkSession = new Map<string, Map<string, ActivityEvent>>();
  private readonly inferences = new Map<string, StoredGoalInference>();
  private readonly goals = new Map<string, Goal>();
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly gapSessions = new Map<string, GapSession>();
  private readonly actionsByGap = new Map<string, Map<string, PlannedAction>>();
  private readonly recoveryBriefs = new Map<string, RecoveryBrief>();

  constructor(initial: {
    readonly goals?: readonly Goal[];
    readonly checkpoints?: readonly Checkpoint[];
    readonly gapSessions?: readonly GapSession[];
  } = {}) {
    for (const goal of initial.goals ?? []) this.goals.set(goal.goalId, goal);
    for (const checkpoint of initial.checkpoints ?? []) {
      this.checkpoints.set(checkpoint.checkpointId, checkpoint);
    }
    for (const gapSession of initial.gapSessions ?? []) {
      this.gapSessions.set(gapSession.gapId, gapSession);
    }
  }

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

  async getGoal(goalId: string): Promise<Goal | null> {
    return this.goals.get(goalId) ?? null;
  }

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.checkpointId, checkpoint);
  }

  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(checkpointId) ?? null;
  }

  async saveGapSession(gapSession: GapSession): Promise<void> {
    this.gapSessions.set(gapSession.gapId, gapSession);
  }

  async getGapSession(gapId: string): Promise<GapSession | null> {
    return this.gapSessions.get(gapId) ?? null;
  }

  async saveActionPlan(actionPlan: ActionPlan): Promise<void> {
    const actions = new Map(actionPlan.actions.map((action) => [action.actionId, action]));
    this.actionsByGap.set(actionPlan.gapId, actions);
  }

  async getAction(gapId: string, actionId: string): Promise<PlannedAction | null> {
    return this.actionsByGap.get(gapId)?.get(actionId) ?? null;
  }

  async updateAction(
    gapId: string,
    action: PlannedAction,
    _decision?: "APPROVE" | "REJECT",
    _reason?: string,
  ): Promise<void> {
    const actions = this.actionsByGap.get(gapId) ?? new Map<string, PlannedAction>();
    actions.set(action.actionId, action);
    this.actionsByGap.set(gapId, actions);
  }

  async saveRecoveryBrief(recoveryBrief: RecoveryBrief): Promise<void> {
    this.recoveryBriefs.set(recoveryBrief.briefId, recoveryBrief);
  }
}
