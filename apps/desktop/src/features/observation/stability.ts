import type { Goal, GoalCandidate } from "@continuity/contracts";
import type { StabilityDecision } from "./types";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function candidateSignature(candidate: GoalCandidate): string {
  return JSON.stringify([
    normalized(candidate.title),
    candidate.suggestedGoalPath.map(normalized),
  ]);
}

export function confirmedGoalSignature(goal: Goal): string {
  return JSON.stringify([normalized(goal.title), goal.path.map(normalized)]);
}

export function evaluateStability(input: {
  readonly candidate: GoalCandidate;
  readonly signature: string;
  readonly consecutiveCount: number;
  readonly confidenceThreshold: number;
  readonly stableInferenceCount: number;
  readonly averageConfidence?: number;
  readonly corroboratedConfidenceThreshold?: number;
  readonly corroboratedInferenceCount?: number;
  readonly confirmedGoal?: Goal;
  readonly snoozed: boolean;
  readonly canRequestConfirmation: boolean;
  readonly now: number;
  readonly lastPopupAt?: number;
  readonly popupCooldownMs: number;
}): StabilityDecision {
  const immediateSignal = input.candidate.confidence >= input.confidenceThreshold
    && input.consecutiveCount >= input.stableInferenceCount;
  const corroboratedSignal = input.averageConfidence !== undefined
    && input.corroboratedConfidenceThreshold !== undefined
    && input.corroboratedInferenceCount !== undefined
    && input.averageConfidence >= input.corroboratedConfidenceThreshold
    && input.consecutiveCount >= input.corroboratedInferenceCount;
  if (!immediateSignal && !corroboratedSignal) return "KEEP_OBSERVING";
  if (input.snoozed || !input.canRequestConfirmation) return "KEEP_OBSERVING";
  if (input.confirmedGoal && confirmedGoalSignature(input.confirmedGoal) === input.signature) {
    return "KEEP_OBSERVING";
  }
  if (
    input.lastPopupAt !== undefined
    && input.now - input.lastPopupAt < input.popupCooldownMs
  ) {
    return "KEEP_OBSERVING";
  }
  return "SHOW_CONFIRMATION";
}
