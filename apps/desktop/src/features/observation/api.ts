import {
  GoalInferenceResultSchema,
  ObservationIngestionResultSchema,
  type ActivityEvent,
  type GoalInferenceResult,
  type ObservationIngestionResult,
} from "@continuity/contracts";
import { apiRequest } from "../../lib/api";
import { observationBatchKey } from "./queue";

export async function uploadObservations(
  workSessionId: string,
  events: readonly ActivityEvent[],
): Promise<ObservationIngestionResult> {
  const idempotencyKey = await observationBatchKey(workSessionId, events.map(({ eventId }) => eventId));
  return ObservationIngestionResultSchema.parse(await apiRequest("/observations", {
    method: "POST",
    body: JSON.stringify({ workSessionId, events }),
  }, idempotencyKey));
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
