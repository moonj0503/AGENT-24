import type { AgentTool, ToolRegistry } from "./types.js";
import { createCheckpointTool } from "./create-checkpoint.js";
import { createTodoDraftTool } from "./create-todo-draft.js";
import { createMessageDraftTool } from "./create-message-draft.js";
import { organizeReferencesTool } from "./organize-references.js";
import { generateRecoveryBriefTool } from "./generate-recovery-brief.js";
import { sendEmailTool } from "./send-email.js";

export class DuplicateToolRegistrationError extends Error {
  constructor(type: AgentTool["type"]) {
    super(`Tool type ${type} is already registered.`);
    this.name = "DuplicateToolRegistrationError";
  }
}

export class ToolNotFoundError extends Error {
  constructor(type: unknown) {
    super(`No Tool is registered for action type ${String(type)}.`);
    this.name = "ToolNotFoundError";
  }
}

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<AgentTool["type"], AgentTool>();

  constructor(tools: readonly AgentTool[] = defaultTools) {
    for (const tool of tools) {
      if (this.tools.has(tool.type)) throw new DuplicateToolRegistrationError(tool.type);
      this.tools.set(tool.type, tool);
    }
  }

  get(type: unknown): AgentTool {
    if (typeof type !== "string") throw new ToolNotFoundError(type);
    const tool = this.tools.get(type as AgentTool["type"]);
    if (!tool) throw new ToolNotFoundError(type);
    return tool;
  }
}

export const defaultTools = [
  createCheckpointTool,
  createTodoDraftTool,
  createMessageDraftTool,
  organizeReferencesTool,
  generateRecoveryBriefTool,
  sendEmailTool,
] as const satisfies readonly AgentTool[];
