import type { ActivityEvent, GoalInferenceResult } from "@continuity/contracts";

/** Context that has already crossed the desktop privacy boundary. */
export interface SanitizedGoalContext {
  readonly workSessionId: string;
  readonly events: readonly ActivityEvent[];
}

export interface GoalInterpreter {
  run(input: SanitizedGoalContext): Promise<GoalInferenceResult>;
}
