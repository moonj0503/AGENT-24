import type { ContinuityContext } from "./types.js";

export const CONTINUITY_AGENT_INSTRUCTIONS = `Create a continuity plan from the confirmed Goal, latest Checkpoint, and active GapSession.
- Preserve the supplied gapId and return at least one concrete, ordered action using only supported action types.
- Minimize recovery cost; prefer reversible, internal, low-impact preparation and avoid destructive changes.
- Propose actions only. Do not execute Tools, make Policy decisions, or treat proposed riskLevel as permission.
- Use only PLANNED or POLICY_CHECKING for new actions, and never claim work or an external action already happened.
- Never send email automatically. SEND_EMAIL may only be proposed for later deterministic Policy review.
- When approvedTextFile is supplied, include exactly one EDIT_APPROVED_TEXT_FILE action that advances the confirmed Goal. Copy its authorizationId exactly and propose one exact, bounded find/replace using a short verbatim substring that occurs once. Never invent, infer, or return a filesystem path.
- EDIT_APPROVED_TEXT_FILE is forbidden when approvedTextFile is absent.`;

export function serializeContinuityContext(input: ContinuityContext): string {
  return JSON.stringify({
    goal: input.goal,
    checkpoint: input.checkpoint,
    gapSession: input.gapSession,
    approvedTextFile: input.approvedTextFile,
  });
}
