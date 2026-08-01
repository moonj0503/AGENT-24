import { completedResult } from "./result.js";
import type { AgentTool } from "./types.js";

export const organizeReferencesTool: AgentTool = {
  type: "ORGANIZE_REFERENCES",
  async execute(action, context) {
    return completedResult(action, context, `References virtually organized for "${action.title}" without moving originals: ${action.reason}`);
  },
};
