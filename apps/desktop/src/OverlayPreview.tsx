/** Development-only visual preview. This file must not become production overlay behavior. */
import { useEffect, useState } from "react";
import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import { fetchGoalInference } from "./features/goals/api";
import { getGapPreviewData, type GapData } from "./features/gap/api";
import { fetchRecoveryBrief } from "./features/recovery/api";
import { OverlayRoot } from "./overlay/OverlayRoot";
import { dismissOverlay, openOverlay } from "./overlay/overlay-store";
import type { OverlayState } from "./overlay/types";

type PreviewState = OverlayState | "HIDDEN";
export const PREVIEW_CONTROLS: Array<{ label: string; state: PreviewState }> = [
  { label: "Goal Confirmation", state: "GOAL_CONFIRMATION" },
  { label: "Gap Start", state: "GAP_START_CONFIRMATION" },
  { label: "Approval", state: "APPROVAL_REQUIRED" },
  { label: "Recovery", state: "RECOVERY_READY" },
  { label: "Hidden", state: "HIDDEN" },
];

export function OverlayPreview() {
  const [state, setState] = useState<PreviewState>("GOAL_CONFIRMATION");
  const [inference, setInference] = useState<GoalInferenceResult>();
  const [gap, setGap] = useState<GapData>();
  const [brief, setBrief] = useState<RecoveryBrief>();
  const [feedback, setFeedback] = useState("Safe preview handlers are active; no mutation API is called.");

  useEffect(() => {
    let active = true;
    void Promise.all([fetchGoalInference(), fetchRecoveryBrief()]).then(([nextInference, nextBrief]) => {
      if (!active) return;
      const nextGap = getGapPreviewData();
      setInference(nextInference); setBrief(nextBrief); setGap(nextGap);
      openPreviewState("GOAL_CONFIRMATION", nextInference, nextGap, nextBrief);
    });
    return () => { active = false; dismissOverlay(); };
  }, []);

  function openPreviewState(nextState: PreviewState, nextInference = inference, nextGap = gap, nextBrief = brief) {
    setState(nextState);
    if (nextState === "HIDDEN") { dismissOverlay(); return; }
    if (nextState === "GOAL_CONFIRMATION" && nextInference) openOverlay({ state: nextState, inference: nextInference });
    if (nextState === "GAP_START_CONFIRMATION") openOverlay({ state: nextState, selectedGoal: nextInference?.candidates[0], gap: nextGap });
    if (nextState === "APPROVAL_REQUIRED" && nextGap) openOverlay({ state: nextState, gap: nextGap, actionId: "act-002" });
    if (nextState === "RECOVERY_READY" && nextBrief) openOverlay({ state: nextState, brief: nextBrief });
  }

  const ready = state === "HIDDEN" || (state === "GOAL_CONFIRMATION" ? Boolean(inference) : state === "RECOVERY_READY" ? Boolean(brief) : Boolean(gap));
  return <main className="preview-page">
    <header className="preview-header"><div><p className="eyebrow">DEVELOPMENT PREVIEW</p><h1>Quick Overlay UI</h1><p>Inspect the production overlay components before native Tauri integration.</p></div><span className="demo-pill">DEV ONLY</span></header>
    <section className="preview-controls" aria-label="Overlay preview states"><strong>Preview state</strong>{PREVIEW_CONTROLS.map((control) => <button className={`button ${state === control.state ? "primary" : "secondary"}`} key={control.state} onClick={() => openPreviewState(control.state)}>{control.label}</button>)}</section>
    <p className="preview-feedback" role="status">{feedback}</p>
    <section className="preview-stage" aria-label="Desktop overlay preview"><div className="preview-stage-label">Desktop workspace</div>{ready ? state === "HIDDEN" ? <div className="preview-hidden">Overlay hidden</div> : <div className="preview-overlay"><OverlayRoot inference={inference} handlers={{
      onGoalSelected: (goal: GoalCandidate) => setFeedback(`Selected goal: ${goal.title}`),
      onConfirmGapStart: async () => { setFeedback("Gap confirmation clicked — no gap API request was sent."); return gap ?? getGapPreviewData(); },
      onApproval: async (_actionId, status) => { setFeedback(`Approval ${status === "COMPLETED" ? "accepted" : "rejected"} — no approval request was sent.`); },
      onOpenMain: (screen) => setFeedback(`Detail request for Main Window screen: ${screen}`),
    }} /></div> : <div className="preview-loading">Loading mock overlay data…</div>}</section>
    <p className="preview-note">Native always-on-top, frameless, and desktop positioning behavior cannot be verified until Member 1&apos;s Tauri integration is complete.</p>
  </main>;
}
