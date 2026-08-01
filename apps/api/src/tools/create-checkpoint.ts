import { completedResult } from "./result.js";
import type { AgentTool } from "./types.js";

export const createCheckpointTool: AgentTool = {
  type: "CREATE_CHECKPOINT",
  async execute(action, context) {
    return completedResult(action, context, `Checkpoint preparation completed for "${action.title}": ${action.reason}`);
  },
};
