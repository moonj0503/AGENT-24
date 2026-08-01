import { useEffect, useMemo, useRef } from "react";
import { fetchGoalInference, selectGoal } from "../features/goals/api";
import { createApprovalAction, createGapStartAction } from "./actions";
import { dismissOverlayWithAnimation, getOverlaySnapshot, openOverlay, OVERLAY_EXIT_DURATION_MS, useOverlaySnapshot } from "./overlay-store";
import { OverlayRoot } from "./OverlayRoot";
import { listenForTauriEvent, openMainWindow, TAURI_EVENTS } from "../lib/tauri";
import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";

export function OverlayApp() {
  const snapshot = useOverlaySnapshot();
  const previousInference = useRef<GoalInferenceResult | undefined>(undefined);
  const lastGapModeCycle = useRef<string | null>(null);
  const shouldShowGoalOverlay = (nextInference: GoalInferenceResult) => {
    if (window.localStorage.getItem("continuity:gap-mode") !== "on") return false;
    const cycle = window.localStorage.getItem("continuity:gap-mode-cycle") ?? "initial";
    const previous = previousInference.current;
    previousInference.current = nextInference;
    if (lastGapModeCycle.current !== cycle) {
      lastGapModeCycle.current = cycle;
      return true;
    }
    if (!previous) return false;
    const previousTop = previous.candidates.slice().sort((a, b) => b.confidence - a.confidence)[0]?.candidateId;
    const nextTop = nextInference.candidates.slice().sort((a, b) => b.confidence - a.confidence)[0]?.candidateId;
    return Boolean(previousTop && nextTop && previousTop !== nextTop);
  };
  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];
    const restoreGoalAfterFocus = () => {
      const state = getOverlaySnapshot().state;
      if (state !== null && state !== "HIDDEN") return;
      void fetchGoalInference().then((nextInference) => {
        const nextState = getOverlaySnapshot().state;
        if (active && shouldShowGoalOverlay(nextInference) && (nextState === null || nextState === "HIDDEN")) openOverlay({ state: "GOAL_CONFIRMATION", inference: nextInference });
      }).catch(() => undefined);
    };
    void Promise.all([
      listenForTauriEvent(TAURI_EVENTS.GOAL_CONFIRMATION, (payload) => {
        const isTest = window.localStorage.getItem("continuity:overlay-test") === "on";
        window.localStorage.removeItem("continuity:overlay-test");
        if (active && (isTest || shouldShowGoalOverlay(payload.inference))) openOverlay({ state: "GOAL_CONFIRMATION", ...payload });
      }),
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
        onGoalSelected: (goal) => { window.localStorage.setItem("continuity:selected-goal", JSON.stringify(goal)); dismissOverlayWithAnimation(); setTimeout(() => void openMainWindow("dashboard"), OVERLAY_EXIT_DURATION_MS); },
        onConfirmGapStart: startGapOnce,
        onApproval: async (actionId, status) => { if (snapshot.gap) openOverlay({ state: "APPROVAL_REQUIRED", gap: await createApprovalAction(snapshot.gap, actionId, status), actionId }); },
        onOpenMain: (screen) => { dismissOverlayWithAnimation(); setTimeout(() => void openMainWindow(screen), OVERLAY_EXIT_DURATION_MS); },
      }}
    />
  </div>;
}

export function selectedGoalFromInference(inference: Parameters<typeof selectGoal>[0], candidateId: string): GoalCandidate {
  return selectGoal(inference, candidateId);
}
