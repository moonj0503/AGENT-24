import type { SanitizedGoalContext } from "./types.js";

export const GOAL_INTERPRETER_INSTRUCTIONS = `Infer possible user goals from sanitized activity events only.
- Describe possibilities, never confirmed intent, and require user confirmation.
- Return 1-3 candidates ranked most to least likely, each with evidence and a non-empty hierarchical path.
- Keep confidence between 0 and 1 and set requiresConfirmation to true.
- Do not infer sensitive personal information or invent applications, resources, messages, or actions absent from the input.
- Do not propose autonomous execution or mark any goal as USER_CONFIRMED.`;

export function serializeSanitizedGoalContext(input: SanitizedGoalContext): string {
  return JSON.stringify({
    workSessionId: input.workSessionId,
    events: input.events,
  });
}
