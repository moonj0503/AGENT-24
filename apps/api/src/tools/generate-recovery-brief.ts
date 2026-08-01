import { completedResult } from "./result.js";
import type { AgentTool } from "./types.js";

export const generateRecoveryBriefTool: AgentTool = {
  type: "GENERATE_RECOVERY_BRIEF",
  async execute(action, context) {
    return completedResult(action, context, `Recovery-brief generation prepared for "${action.title}": ${action.reason}`);
  },
};
