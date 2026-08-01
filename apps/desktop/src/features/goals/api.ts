import type { Goal, GoalCandidate, GoalInferenceResult, ObservationIngestionResult } from "@continuity/contracts";
import { apiRequest } from "../../lib/api";
import { readRecentActivityEvents } from "../activity/api";

export async function fetchGoalInference(workSessionId: string): Promise<GoalInferenceResult> {
  const events = await readRecentActivityEvents();
  const observation = await apiRequest<ObservationIngestionResult>("/observations", { method: "POST", body: JSON.stringify({ workSessionId, events }) });
  return apiRequest<GoalInferenceResult>("/goal-inferences", { method: "POST", body: JSON.stringify({ workSessionId, observationEventIds: observation.acceptedEventIds }) });
}

export function confirmGoal(inferenceId: string, candidateId: string): Promise<Goal> {
  return apiRequest<Goal>("/goals/confirm", { method: "POST", body: JSON.stringify({ inferenceId, selection: { type: "CANDIDATE", candidateId } }) });
}

export function selectGoal(result: GoalInferenceResult, candidateId: string): GoalCandidate {
  const candidate = result.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("That goal candidate is no longer available.");
  return candidate;
}
