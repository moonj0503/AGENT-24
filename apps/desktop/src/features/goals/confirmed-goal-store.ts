import { useSyncExternalStore } from "react";
import type { Goal } from "@continuity/contracts";

export interface ConfirmedGoalSnapshot {
  readonly confirmedGoal?: Goal;
}

let snapshot: ConfirmedGoalSnapshot = {};
const listeners = new Set<() => void>();

function emit(next: ConfirmedGoalSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getConfirmedGoalSnapshot(): ConfirmedGoalSnapshot {
  return snapshot;
}

export function subscribeConfirmedGoal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConfirmedGoalSnapshot(): ConfirmedGoalSnapshot {
  return useSyncExternalStore(
    subscribeConfirmedGoal,
    getConfirmedGoalSnapshot,
    getConfirmedGoalSnapshot,
  );
}

export function setConfirmedGoal(goal: Goal): void {
  emit({ confirmedGoal: goal });
}

export function clearConfirmedGoal(): void {
  emit({});
}
