import { useEffect, useMemo } from "react";
import { fetchGoalInference, selectGoal } from "../features/goals/api";
import { createApprovalAction, createGapStartAction } from "./actions";
import { dismissOverlay, openOverlay, useOverlaySnapshot } from "./overlay-store";
import { OverlayRoot } from "./OverlayRoot";
import { listenForTauriEvent, openMainWindow } from "../lib/tauri";
import type { GoalCandidate } from "@continuity/contracts";

export function OverlayApp() {
  const snapshot = useOverlaySnapshot();
  useEffect(() => {
    let active = true;
    const subscriptions = [
      ["overlay.goal-confirmation", "GOAL_CONFIRMATION"],
      ["overlay.gap-start-confirmation", "GAP_START_CONFIRMATION"],
      ["overlay.approval-required", "APPROVAL_REQUIRED"],
      ["overlay.recovery-ready", "RECOVERY_READY"],
    ] as const;
    const cleanups: Array<() => void> = [];
    void Promise.all(subscriptions.map(async ([event, state]) => {
      const cleanup = await listenForTauriEvent(event, (payload) => {
        if (active && payload && typeof payload === "object") openOverlay({ state, ...(payload as object) });
      });
      cleanups.push(cleanup);
    }));
    void fetchGoalInference().then((inference) => {
      if (active && !snapshot.state) openOverlay({ state: "GOAL_CONFIRMATION", inference });
    }).catch(() => undefined);
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, []);

  const startGapOnce = useMemo(() => createGapStartAction(), []);
  const inference = snapshot.inference;
  return <div className="overlay-shell">
    <button className="overlay-dismiss" aria-label="Dismiss" onClick={dismissOverlay}>×</button>
    <OverlayRoot
      inference={inference}
      handlers={{
        onGoalSelected: (goal) => { if (inference) openOverlay({ state: "GAP_START_CONFIRMATION", selectedGoal: goal }); },
        onConfirmGapStart: startGapOnce,
        onApproval: async (actionId, status) => { if (snapshot.gap) openOverlay({ state: "APPROVAL_REQUIRED", gap: await createApprovalAction(snapshot.gap, actionId, status), actionId }); },
        onOpenMain: (screen) => { void openMainWindow(screen); },
      }}
    />
  </div>;
}

export function selectedGoalFromInference(inference: Parameters<typeof selectGoal>[0], candidateId: string): GoalCandidate {
  return selectGoal(inference, candidateId);
}
