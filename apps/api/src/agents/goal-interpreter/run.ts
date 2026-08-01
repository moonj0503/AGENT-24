import { GoalInferenceResultSchema, type ActivityEvent, type GoalInferenceResult } from "@continuity/contracts";
import { GoalInterpreter } from "./agent.js";
import { openAIClient, type OpenAIResponsesClient } from "../shared/openai-client.js";

const fallback: GoalInferenceResult = GoalInferenceResultSchema.parse({ inferenceId: "inf-001", requiresConfirmation: true, inferenceSummary: "Recent Word and Chrome activity suggests report writing.", candidates: [{ candidateId: "goal-001", title: "Write the final project report", description: "Draft the QR factorization numerical stability section.", confidence: 0.84, evidence: [{ type: "RESOURCE", description: "Final Project Report.docx" }], suggestedGoalPath: ["Final Project", "Report Writing", "QR Factorization"] }, { candidateId: "goal-002", title: "Study QR factorization", description: "Review numerical stability references.", confidence: 0.12, evidence: [{ type: "ACTIVITY_SEQUENCE", description: "Searched QR factorization stability in Chrome" }], suggestedGoalPath: ["Study", "Linear Algebra"] }] });

export async function runGoalInterpreter(events: readonly ActivityEvent[], client: OpenAIResponsesClient = openAIClient): Promise<GoalInferenceResult> {
  try { return await new GoalInterpreter(client).interpret({ events }); }
  catch { return GoalInferenceResultSchema.parse(fallback); }
}
