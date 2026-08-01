import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";
import fixture from "../../mocks/goal-candidates.json";

const demoGoals: GoalInferenceResult = {
  inferenceId: "inf-001",
  requiresConfirmation: true,
  inferenceSummary: "Recent Word and Chrome activity suggests report writing.",
  candidates: [
    {
      candidateId: "goal-001",
      title: "Write the final project report",
      description: "Draft the QR factorization numerical stability section.",
      confidence: 0.84,
      evidence: [{ type: "RESOURCE", description: "Final Project Report.docx" }],
      suggestedGoalPath: ["Final Project", "Report Writing", "QR Factorization"],
    },
    {
      candidateId: "goal-002",
      title: "Study QR factorization",
      description: "Review numerical stability references.",
      confidence: 0.12,
      evidence: [{ type: "ACTIVITY_SEQUENCE", description: "Searched QR factorization stability in Chrome" }],
      suggestedGoalPath: ["Study", "Linear Algebra"],
    },
  ],
};

export async function fetchGoalInference(): Promise<GoalInferenceResult> {
  if (!fixture.candidates?.length) {
    throw new Error("The goal demo fixture is unavailable.");
  }
  return structuredClone(demoGoals);
}

export function selectGoal(result: GoalInferenceResult, candidateId: string): GoalCandidate {
  const candidate = result.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("That goal candidate is no longer available.");
  return candidate;
}
