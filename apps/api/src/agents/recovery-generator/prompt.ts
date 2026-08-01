import type { RecoveryContext } from "./types.js";

export const RECOVERY_GENERATOR_INSTRUCTIONS = `Create a recovery summary from the confirmed Goal, active GapSession, ActionPlan, and actual ActionResults.
- Preserve gapId, ground goalBeforeGap in the Goal hierarchy, and recommend exactly one realistic next action with a short positive integer duration.
- Distinguish planned actions from results: only COMPLETED results support completed claims; failed or rejected results do not.
- Report external effects only when an ActionResult explicitly reports a non-NONE effect; otherwise return no external effects.
- Never infer that SEND_EMAIL sent anything when its result describes a downgraded internal draft.
- Summarize only. Do not execute Tools, evaluate Policy, change action state, or invent work or communication.`;

export function serializeRecoveryContext(input: RecoveryContext): string {
  return JSON.stringify({
    goal: input.goal,
    gapSession: input.gapSession,
    actionPlan: input.actionPlan,
    actionResults: input.actionResults,
  });
}
