import { ActionPlanSchema, type ActionPlan, type Checkpoint, type GapSession, type Goal } from "@continuity/contracts";
import { executePlannedAction, type ToolExecution } from "../../tools/registry.js";
import { ContinuityAgent } from "./agent.js";
import { openAIClient, type OpenAIResponsesClient } from "../shared/openai-client.js";

const fallback: ActionPlan = ActionPlanSchema.parse({ planId: "plan-001", gapId: "gap-001", continuityObjective: "Preserve the report-writing workflow and minimize recovery cost.", actions: [{ actionId: "act-001", type: "CREATE_CHECKPOINT", title: "Save current report state", reason: "Preserve unfinished thoughts and the next writing action.", riskLevel: "LOW", reversible: true, status: "PLANNED" }, { actionId: "act-002", type: "CREATE_TODO_DRAFT", title: "Draft next-paragraph outline", reason: "Preserve the next writing step.", riskLevel: "LOW", reversible: true, status: "PLANNED" }, { actionId: "act-003", type: "ORGANIZE_REFERENCES", title: "Group QR stability references", reason: "Make supporting references easy to resume without moving originals.", riskLevel: "LOW", reversible: true, status: "PLANNED" }, { actionId: "act-004", type: "SEND_EMAIL", title: "Send team update", reason: "Keep teammates informed.", riskLevel: "HIGH", reversible: false, status: "POLICY_CHECKING" }] });

export interface ContinuityRunInput { readonly goal: Goal; readonly checkpoint: Checkpoint; readonly gap: GapSession; }
export interface ContinuityRunResult { readonly plan: ActionPlan; readonly executions: readonly ToolExecution[]; }

function toolInput(input: ContinuityRunInput): Readonly<Record<string, unknown>> {
  return { goalId: input.goal.goalId, currentState: input.checkpoint.currentState, nextAction: input.checkpoint.likelyNextActions[0]?.title ?? "Review the preserved checkpoint", references: input.checkpoint.relatedResources.map((resource) => resource.title) };
}

export async function runContinuityAgent(input: ContinuityRunInput, client: OpenAIResponsesClient = openAIClient): Promise<ContinuityRunResult> {
  let plan: ActionPlan;
  try { plan = await new ContinuityAgent(client).plan(input); }
  catch { plan = ActionPlanSchema.parse({ ...fallback, gapId: input.gap.gapId }); }
  const executions: ToolExecution[] = [];
  for (const action of plan.actions) executions.push(await executePlannedAction(action, toolInput(input)));
  return { plan, executions };
}
