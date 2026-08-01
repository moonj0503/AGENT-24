import { rejectedResult } from "./result.js";
import type { AgentTool } from "./types.js";

export const sendEmailTool: AgentTool = {
  type: "SEND_EMAIL",
  async execute(action, context) {
    return rejectedResult(action, context, "Email sending is disabled; no external effect occurred.");
  },
};
