import { useSyncExternalStore } from "react";
import type { Goal, GoalInferenceResult } from "@continuity/contracts";

export type GoalConfirmationReason = "NEW_GOAL" | "GOAL_CHANGE" | "GAP_START";

export interface PendingGoalConfirmation {
  readonly inference: GoalInferenceResult;
  readonly candidateSignature: string;
  readonly requestedAt: number;
  readonly previousGoal?: Goal;
  readonly reason: GoalConfirmationReason;
}

export interface PendingGoalConfirmationSnapshot {
  readonly pending?: PendingGoalConfirmation;
}

let snapshot: PendingGoalConfirmationSnapshot = {};
const listeners = new Set<() => void>();

function emit(next: PendingGoalConfirmationSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getPendingGoalConfirmationSnapshot(): PendingGoalConfirmationSnapshot {
  return snapshot;
}

export function subscribePendingGoalConfirmation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingGoalConfirmationSnapshot(): PendingGoalConfirmationSnapshot {
  return useSyncExternalStore(
    subscribePendingGoalConfirmation,
    getPendingGoalConfirmationSnapshot,
    getPendingGoalConfirmationSnapshot,
  );
}

export function setPendingGoalConfirmation(pending: PendingGoalConfirmation): void {
  emit({ pending });
}

export function clearPendingGoalConfirmation(): void {
  emit({});
}
