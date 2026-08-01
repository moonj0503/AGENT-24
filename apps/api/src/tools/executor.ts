import { ActionResultSchema, type ActionResult, type PlannedAction } from "@continuity/contracts";
import type { PolicyEvaluation } from "../policy/index.js";
import { failedResult, rejectedResult } from "./result.js";
import { DefaultToolRegistry } from "./registry.js";
import type { AgentTool, ToolExecutionContext, ToolRegistry } from "./types.js";

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry = new DefaultToolRegistry()) {}

  async execute(
    action: PlannedAction,
    evaluation: PolicyEvaluation,
    context: ToolExecutionContext,
  ): Promise<ActionResult> {
    switch (evaluation.decision) {
      case "AUTO_EXECUTE":
        return this.executeTool(action.type, action, context);
      case "DOWNGRADE":
        if (!evaluation.replacementActionType) {
          return failedResult(action, context, "Policy downgrade did not provide a replacement Tool type.");
        }
        return this.executeTool(evaluation.replacementActionType, action, context);
      case "REQUIRE_APPROVAL":
        return rejectedResult(action, context, `Tool execution requires approval: ${evaluation.reason}`);
      case "DENY":
        return rejectedResult(action, context, `Tool execution denied: ${evaluation.reason}`);
    }
  }

  async executeApproved(action: PlannedAction, evaluation: PolicyEvaluation, context: ToolExecutionContext): Promise<ActionResult> {
    if (evaluation.decision === "DENY") return rejectedResult(action, context, `Tool execution denied: ${evaluation.reason}`);
    if (evaluation.decision === "DOWNGRADE") {
      return evaluation.replacementActionType
        ? this.executeTool(evaluation.replacementActionType, action, context)
        : failedResult(action, context, "Policy downgrade did not provide a replacement Tool type.");
    }
    return this.executeTool(action.type, action, context);
  }

  private async executeTool(
    type: PlannedAction["type"],
    action: PlannedAction,
    context: ToolExecutionContext,
  ): Promise<ActionResult> {
    let tool: AgentTool;
    try {
      tool = this.registry.get(type);
    } catch (error) {
      return failedResult(action, context, error instanceof Error ? error.message : "Tool resolution failed.");
    }

    try {
      const result = await tool.execute(action, context);
      const validation = ActionResultSchema.safeParse(result);
      if (!validation.success) {
        return failedResult(action, context, `Tool returned invalid output: ${validation.error.message}`);
      }
      if (validation.data.actionId !== action.actionId) {
        return failedResult(action, context, "Tool output did not preserve the original actionId.");
      }
      return validation.data;
    } catch (error) {
      return failedResult(action, context, `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }
}
