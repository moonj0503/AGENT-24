import { useSyncExternalStore } from "react";
import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import type { GapData } from "../features/gap/api";
import { chooseOverlayState, type OverlaySnapshot, type OverlayState } from "./types";

let snapshot: OverlaySnapshot = { state: null };
const listeners = new Set<() => void>();

function emit(next: OverlaySnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getOverlaySnapshot(): OverlaySnapshot { return snapshot; }
export function subscribeOverlay(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function useOverlaySnapshot(): OverlaySnapshot {
  return useSyncExternalStore(subscribeOverlay, getOverlaySnapshot, getOverlaySnapshot);
}

export function openOverlay(next: Omit<OverlaySnapshot, "state"> & { state: OverlayState }) {
  emit(next);
}

export function updateOverlay(next: Partial<OverlaySnapshot>) {
  emit({ ...snapshot, ...next });
}

export function dismissOverlay() { emit({ state: null }); }

export function requestOverlayState(states: Array<{ state: OverlayState; payload?: Omit<OverlaySnapshot, "state"> }>) {
  const state = chooseOverlayState(states.map((item) => item.state));
  if (!state) return null;
  const selected = states.find((item) => item.state === state);
  openOverlay({ state, ...(selected?.payload ?? {}) });
  return state;
}

export function setGoalConfirmation(inference: GoalInferenceResult) {
  openOverlay({ state: "GOAL_CONFIRMATION", inference });
}

export function setGapStartConfirmation(selectedGoal?: GoalCandidate, gap?: GapData) {
  openOverlay({ state: "GAP_START_CONFIRMATION", selectedGoal, gap });
}

export function setApprovalRequired(gap: GapData, actionId: string) {
  openOverlay({ state: "APPROVAL_REQUIRED", gap, actionId });
}

export function setRecoveryReady(brief: RecoveryBrief) {
  openOverlay({ state: "RECOVERY_READY", brief });
}
