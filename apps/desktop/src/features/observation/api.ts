import {
  GoalInferenceResultSchema,
  ObservationIngestionResultSchema,
  type ActivityEvent,
  type GoalInferenceResult,
  type ObservationIngestionResult,
} from "@continuity/contracts";
import { apiRequest } from "../../lib/api";

export async function uploadObservations(
  workSessionId: string,
  events: readonly ActivityEvent[],
): Promise<ObservationIngestionResult> {
  return ObservationIngestionResultSchema.parse(await apiRequest("/observations", {
    method: "POST",
    body: JSON.stringify({ workSessionId, events }),
  }));
}

export async function requestGoalInference(
  workSessionId: string,
  observationEventIds: readonly string[],
  previousGoalId?: string,
): Promise<GoalInferenceResult> {
  return GoalInferenceResultSchema.parse(await apiRequest("/goal-inferences", {
    method: "POST",
    body: JSON.stringify({ workSessionId, observationEventIds, previousGoalId }),
  }));
}
