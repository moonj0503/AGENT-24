import type {
  ActivityEvent,
  ActionPlan,
  Checkpoint,
  GapSession,
  Goal,
  GoalInferenceResult,
  ObservationIngestionResult,
  ObservationRequest,
  PlannedAction,
  RecoveryBrief,
} from "@continuity/contracts";

export interface StoredGoalInference {
  readonly workSessionId: string;
  readonly result: GoalInferenceResult;
}

export interface WorkflowRepository {
  ingestObservations(request: ObservationRequest): Promise<ObservationIngestionResult>;
  getActivityEvents(workSessionId: string, eventIds: readonly string[]): Promise<ReadonlyMap<string, ActivityEvent>>;
  saveInference(workSessionId: string, result: GoalInferenceResult): Promise<void>;
  getInference(inferenceId: string): Promise<StoredGoalInference | null>;
  saveGoal(inferenceId: string, goal: Goal): Promise<void>;
  getGoal(goalId: string): Promise<Goal | null>;
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  getCheckpoint(checkpointId: string): Promise<Checkpoint | null>;
  saveGapSession(gapSession: GapSession): Promise<void>;
  getGapSession(gapId: string): Promise<GapSession | null>;
  saveActionPlan(actionPlan: ActionPlan): Promise<void>;
  getAction(gapId: string, actionId: string): Promise<PlannedAction | null>;
  updateAction(gapId: string, action: PlannedAction, decision?: "APPROVE" | "REJECT", reason?: string): Promise<void>;
  saveRecoveryBrief(recoveryBrief: RecoveryBrief): Promise<void>;
}
