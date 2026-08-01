import type { AgentTool } from "./types.js";
import { failedResult } from "./result.js";

export const editApprovedTextFileTool: AgentTool = {
  type: "EDIT_APPROVED_TEXT_FILE",
  async execute(action, context) {
    return failedResult(action, context, "Approved file edits must execute through the native desktop capability.");
  },
};
