import { useEffect, useMemo } from "react";
import { fetchGoalInference, selectGoal } from "../features/goals/api";
import { createApprovalAction, createGapStartAction } from "./actions";
import { dismissOverlayWithAnimation, getOverlaySnapshot, openOverlay, useOverlaySnapshot } from "./overlay-store";
import { OverlayRoot } from "./OverlayRoot";
import { listenForTauriEvent, openMainWindow, TAURI_EVENTS } from "../lib/tauri";
import type { GoalCandidate } from "@continuity/contracts";

export function OverlayApp() {
  const snapshot = useOverlaySnapshot();
  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];
    const restoreGoalAfterFocus = () => {
      const state = getOverlaySnapshot().state;
      if (state !== null && state !== "HIDDEN") return;
      void fetchGoalInference().then((nextInference) => {
        const nextState = getOverlaySnapshot().state;
        if (active && (nextState === null || nextState === "HIDDEN")) openOverlay({ state: "GOAL_CONFIRMATION", inference: nextInference });
      }).catch(() => undefined);
    };
    void Promise.all([
      listenForTauriEvent(TAURI_EVENTS.GOAL_CONFIRMATION, (payload) => { if (active) openOverlay({ state: "GOAL_CONFIRMATION", ...payload }); }),
      listenForTauriEvent(TAURI_EVENTS.GAP_START_CONFIRMATION, (payload) => { if (active) openOverlay({ state: "GAP_START_CONFIRMATION", ...payload }); }),
      listenForTauriEvent(TAURI_EVENTS.APPROVAL_REQUIRED, (payload) => { if (active) openOverlay({ state: "APPROVAL_REQUIRED", ...payload }); }),
      listenForTauriEvent(TAURI_EVENTS.RECOVERY_READY, (payload) => { if (active) openOverlay({ state: "RECOVERY_READY", ...payload }); }),
      listenForTauriEvent(TAURI_EVENTS.WINDOW_FOCUS, restoreGoalAfterFocus),
    ]).then((unsubscribes) => { if (active) cleanups.push(...unsubscribes); else unsubscribes.forEach((cleanup) => cleanup()); });
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, []);

  const startGapOnce = useMemo(() => createGapStartAction(), []);
  const inference = snapshot.inference;
  return <div className="overlay-shell">
    <button className="overlay-dismiss" aria-label="Dismiss" onClick={dismissOverlayWithAnimation}>×</button>
    <OverlayRoot
      inference={inference}
      handlers={{
        onGoalSelected: (goal) => { if (inference) openOverlay({ state: "GAP_START_CONFIRMATION", selectedGoal: goal }); },
        onConfirmGapStart: startGapOnce,
        onApproval: async (actionId, status) => { if (snapshot.gap) openOverlay({ state: "APPROVAL_REQUIRED", gap: await createApprovalAction(snapshot.gap, actionId, status), actionId }); },
        onOpenMain: (screen) => { dismissOverlayWithAnimation(); void openMainWindow(screen); },
      }}
    />
  </div>;
}

export function selectedGoalFromInference(inference: Parameters<typeof selectGoal>[0], candidateId: string): GoalCandidate {
  return selectGoal(inference, candidateId);
}
