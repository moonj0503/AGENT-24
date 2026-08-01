import { completedResult } from "./result.js";
import type { AgentTool } from "./types.js";

export const createTodoDraftTool: AgentTool = {
  type: "CREATE_TODO_DRAFT",
  async execute(action, context) {
    return completedResult(action, context, `TODO draft created for "${action.title}": ${action.reason}`);
  },
};
