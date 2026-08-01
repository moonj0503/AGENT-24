import { useState } from "react";
import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";
import { dismissOverlayWithAnimation } from "../overlay-store";

export function GoalConfirmationOverlay({ inference, onSelect, onOpenDetails }: { inference: GoalInferenceResult; onSelect: (goal: GoalCandidate) => void; onOpenDetails: () => void }) {
  const [manualMode, setManualMode] = useState(false);
  const [title, setTitle] = useState("");
  if (manualMode) return <section className="overlay-card" aria-labelledby="overlay-manual-goal-title">
    <div className="overlay-intro">
      <p className="eyebrow">MANUAL GOAL</p>
      <h2 id="overlay-manual-goal-title">What are you working on?</h2>
      <p className="overlay-copy">Type your goal and pass it directly to the agent. The agent will organize the context for you.</p>
    </div>
    <form className="manual-goal-form" onSubmit={(event) => { event.preventDefault(); const cleanTitle = title.trim(); if (!cleanTitle) return; onSelect({ candidateId: `manual-${Date.now()}`, title: cleanTitle, description: "Goal entered directly by the user.", confidence: 1, evidence: [{ type: "USER_PATTERN", description: "Entered directly by the user." }], suggestedGoalPath: ["User-defined goal"] }); }}>
      <label>Goal title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Finish the project report" autoFocus /></label>
      <div className="overlay-actions"><button className="button primary" type="submit" disabled={!title.trim()}>Pass to agent</button><button className="button secondary" type="button" onClick={() => setManualMode(false)}>Back</button></div>
    </form>
  </section>;
  return <section className="overlay-card" aria-labelledby="overlay-goal-title">
    <div className="overlay-intro">
      <p className="eyebrow">GOAL CONFIRMATION</p>
      <h2 id="overlay-goal-title">What are you working on?</h2>
      <p className="overlay-copy">{inference.inferenceSummary}</p>
    </div>
    <div className="overlay-options">{inference.candidates.slice(0, 3).map((candidate) => <button className="overlay-option" key={candidate.candidateId} onClick={() => onSelect(candidate)}>
      <span><strong>{candidate.title}</strong><small>{candidate.description}</small><small>Evidence: {candidate.evidence[0]?.description ?? "No evidence summary available."}</small></span>
      <b>{Math.round(candidate.confidence * 100)}%</b>
    </button>)}</div>
    <div className="overlay-actions"><button className="button primary" onClick={() => setManualMode(true)}>Enter a different goal</button><button className="button secondary" onClick={dismissOverlayWithAnimation}>Cancel</button></div>
  </section>;
}
