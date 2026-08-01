import type {
  ActionPlan,
  ActionResult,
  GapSession,
  Goal,
  RecoveryBrief,
} from "@continuity/contracts";

/** Sanitized context needed to summarize recovery after a gap. */
export interface RecoveryContext {
  readonly goal: Goal;
  readonly gapSession: GapSession;
  readonly actionPlan: ActionPlan;
  readonly actionResults: readonly ActionResult[];
}

export interface RecoveryGenerator {
  run(input: RecoveryContext): Promise<RecoveryBrief>;
}
