import {
  ConfirmGoalRequestSchema,
  GoalSchema,
  type Goal,
  type GoalCandidate,
  type GoalInferenceResult,
} from "@continuity/contracts";
import { apiRequest } from "../../lib/api";

export function selectGoal(result: GoalInferenceResult, candidateId: string): GoalCandidate {
  const candidate = result.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("That goal candidate is no longer available.");
  return candidate;
}

export async function confirmGoal(
  inference: GoalInferenceResult,
  candidateId: string,
): Promise<Goal> {
  const request = ConfirmGoalRequestSchema.parse({
    inferenceId: inference.inferenceId,
    selection: { type: "CANDIDATE", candidateId },
  });
  return GoalSchema.parse(await apiRequest("/goals/confirm", {
    method: "POST",
    body: JSON.stringify(request),
  }));
}
