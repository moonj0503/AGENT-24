import { completedResult } from "./result.js";
import type { AgentTool } from "./types.js";

export const createMessageDraftTool: AgentTool = {
  type: "CREATE_MESSAGE_DRAFT",
  async execute(action, context) {
    return completedResult(action, context, `Message draft prepared for "${action.title}": ${action.reason}`);
  },
};
