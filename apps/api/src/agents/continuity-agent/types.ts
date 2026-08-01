import type { ActionPlan, Checkpoint, GapSession, Goal } from "@continuity/contracts";

/** Sanitized context for an already-confirmed goal at the start of a gap. */
export interface ContinuityContext {
  readonly goal: Goal;
  readonly checkpoint: Checkpoint;
  readonly gapSession: GapSession;
}

export interface ContinuityAgent {
  run(input: ContinuityContext): Promise<ActionPlan>;
}
