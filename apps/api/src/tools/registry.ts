import type { PlannedAction } from "@continuity/contracts";
import { evaluatePolicy, type PolicyEvaluation } from "../policy/policy-engine.js";
import { createCheckpointTool } from "./create-checkpoint.tool.js";
import { createTodoDraftTool } from "./create-todo-draft.tool.js";
import { createMessageDraftTool } from "./create-message-draft.tool.js";
import { organizeReferencesTool } from "./organize-references.tool.js";
import { generateRecoveryBriefTool } from "./generate-recovery-brief.tool.js";
import type { ContinuityTool, ToolContext, ToolResult } from "./tool-result.js";

const tools: ReadonlyMap<string, ContinuityTool> = new Map([createCheckpointTool, createTodoDraftTool, createMessageDraftTool, organizeReferencesTool, generateRecoveryBriefTool].map((tool) => [tool.name, tool]));

export interface ToolExecution { readonly policy: PolicyEvaluation; readonly result?: ToolResult; }

export async function executePlannedAction(action: PlannedAction, input: Readonly<Record<string, unknown>>, context?: ToolContext): Promise<ToolExecution> {
  const policy = evaluatePolicy(action);
  if (policy.decision === "DENY" || policy.decision === "REQUIRE_APPROVAL") return { policy };
  const allowedAction = policy.allowedAction;
  if (!allowedAction) return { policy, result: { status: "FAILED", reversible: true, error: { code: "MISSING_ALLOWED_ACTION", message: "Policy did not provide an executable action." } } };
  const tool = tools.get(allowedAction.type);
  if (!tool) return { policy, result: { status: "FAILED", reversible: true, error: { code: "TOOL_NOT_FOUND", message: `No tool is registered for ${allowedAction.type}.` } } };
  return { policy, result: await tool.execute({ ...input, actionId: action.actionId, title: allowedAction.title, reason: allowedAction.reason }, context) };
}

export function listRegisteredTools(): readonly string[] { return [...tools.keys()]; }
