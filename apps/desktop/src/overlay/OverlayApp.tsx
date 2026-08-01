import { useEffect, useMemo } from "react";
import { confirmGoal, selectGoal } from "../features/goals/api";
import { createApprovalAction, createGapStartAction } from "./actions";
import { dismissOverlayWithAnimation, openOverlay, useOverlaySnapshot } from "./overlay-store";
import { OverlayRoot } from "./OverlayRoot";
import { emitTauriEvent, listenForTauriEvent, openMainWindow, TAURI_EVENTS } from "../lib/tauri";
import type { GoalCandidate } from "@continuity/contracts";
import {
  clearPendingGoalConfirmation,
  getPendingGoalConfirmationSnapshot,
  setPendingGoalConfirmation,
} from "../features/goals/pending-confirmation-store";
import { setConfirmedGoal } from "../features/goals/confirmed-goal-store";
import { candidateSignature } from "../features/observation/stability";

export function OverlayApp() {
  const snapshot = useOverlaySnapshot();
  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];
    void Promise.all([
      listenForTauriEvent(TAURI_EVENTS.GOAL_CONFIRMATION, (payload) => {
        if (!active) return;
        if (payload.pending) setPendingGoalConfirmation(payload.pending);
        openOverlay({ state: "GOAL_CONFIRMATION", inference: payload.inference });
      }),
      listenForTauriEvent(TAURI_EVENTS.GAP_START_CONFIRMATION, (payload) => { if (active) openOverlay({ state: "GAP_START_CONFIRMATION", ...payload }); }),
      listenForTauriEvent(TAURI_EVENTS.APPROVAL_REQUIRED, (payload) => { if (active) openOverlay({ state: "APPROVAL_REQUIRED", ...payload }); }),
      listenForTauriEvent(TAURI_EVENTS.RECOVERY_READY, (payload) => { if (active) openOverlay({ state: "RECOVERY_READY", ...payload }); }),
    ]).then((unsubscribes) => { if (active) cleanups.push(...unsubscribes); else unsubscribes.forEach((cleanup) => cleanup()); });
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, []);

  const startGapOnce = useMemo(() => createGapStartAction(), []);
  const inference = snapshot.inference;
  async function confirmCandidate(goal: GoalCandidate): Promise<void> {
    if (!inference) throw new Error("The Goal inference is no longer available.");
    const confirmed = await confirmGoal(inference, goal.candidateId);
    setConfirmedGoal(confirmed);
    clearPendingGoalConfirmation();
    await emitTauriEvent(TAURI_EVENTS.GOAL_CONFIRMED, { goal: confirmed });
    dismissOverlayWithAnimation();
  }
  function resolve(action: "LATER" | "IGNORE" | "KEEP_CURRENT") {
    const pending = getPendingGoalConfirmationSnapshot().pending;
    const signature = pending?.candidateSignature
      ?? (inference?.candidates[0] ? candidateSignature(inference.candidates[0]) : undefined);
    if (!signature) return;
    clearPendingGoalConfirmation();
    void emitTauriEvent(TAURI_EVENTS.GOAL_CONFIRMATION_RESOLVED, {
      action,
      candidateSignature: signature,
    });
    dismissOverlayWithAnimation();
  }
  return <div className="overlay-shell">
    <button className="overlay-dismiss" aria-label="Dismiss" onClick={() => resolve("LATER")}>×</button>
    <OverlayRoot
      inference={inference}
      handlers={{
        onGoalSelected: confirmCandidate,
        onGoalLater: () => resolve("LATER"),
        onGoalIgnore: () => resolve("IGNORE"),
        onKeepCurrentGoal: () => resolve("KEEP_CURRENT"),
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
