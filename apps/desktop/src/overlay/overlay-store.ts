import { useSyncExternalStore } from "react";
import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import type { GapData } from "../features/gap/api";
import { chooseOverlayState, type OverlaySnapshot, type OverlayState } from "./types";
import { emitTauriEvent, hideOverlay, TAURI_EVENTS } from "../lib/tauri";

let snapshot: OverlaySnapshot = { state: null };
const listeners = new Set<() => void>();
let dismissTimer: ReturnType<typeof setTimeout> | undefined;
export const OVERLAY_EXIT_DURATION_MS = 340;

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
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
  emit({ ...next, isClosing: false });
}

export function updateOverlay(next: Partial<OverlaySnapshot>) {
  emit({ ...snapshot, ...next });
}

export function dismissOverlay() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
  emit({ state: "HIDDEN" });
  void emitTauriEvent(TAURI_EVENTS.DISMISS, undefined);
  void hideOverlay().catch((cause) => {
    if (import.meta.env?.DEV) console.error("Unable to hide the native Quick Overlay.", cause);
  });
}

/** Plays the exit animation before removing the overlay and hiding its native window. */
export function dismissOverlayWithAnimation() {
  if (dismissTimer || snapshot.state === null || snapshot.state === "HIDDEN") return;
  emit({ ...snapshot, isClosing: true });
  dismissTimer = setTimeout(() => {
    dismissTimer = undefined;
    dismissOverlay();
  }, OVERLAY_EXIT_DURATION_MS);
}

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
