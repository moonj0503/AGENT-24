import type { ActionResult, PlannedAction } from "@continuity/contracts";

export interface ToolExecutionContext {
  readonly occurredAt: string;
}

export interface AgentTool {
  readonly type: PlannedAction["type"];
  execute(action: PlannedAction, context: ToolExecutionContext): Promise<ActionResult>;
}

export interface ToolRegistry {
  get(type: unknown): AgentTool;
}
