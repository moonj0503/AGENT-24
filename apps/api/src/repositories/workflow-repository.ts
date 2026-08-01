import type {
  ActivityEvent,
  Goal,
  GoalInferenceResult,
  ObservationIngestionResult,
  ObservationRequest,
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
}
