import type { ArtifactGenerationContext } from "./types.js";

export const ARTIFACT_GENERATOR_INSTRUCTIONS = `Draft useful, editable artifact content for completed internal actions.
- Return exactly one item for every supplied action and preserve each actionId exactly.
- Use the confirmed goal, checkpoint, action reason, and actual result summary as grounding.
- Produce practical content the user can continue editing, with concrete known details and clearly marked open questions.
- Never claim that an email or message was sent, delivered, approved, or otherwise caused an external effect.
- Do not invent people, addresses, deadlines, links, completed work, or facts absent from the supplied context.
- Do not choose artifact type, title, identifiers, status, or timestamps; the application controls those fields.`;

export function serializeArtifactContext(input: ArtifactGenerationContext, actionIds: ReadonlySet<string>): string {
  return JSON.stringify({
    goal: input.goal,
    checkpoint: input.checkpoint,
    gapSession: input.gapSession,
    actions: input.actionPlan.actions
      .filter(({ actionId }) => actionIds.has(actionId))
      .map((action) => ({
        actionId: action.actionId,
        type: action.type,
        title: action.title,
        reason: action.reason,
        result: input.actionResults.find(({ actionId }) => actionId === action.actionId),
      })),
  });
}
