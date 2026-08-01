import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";
import { dismissOverlay } from "../overlay-store";

export function GoalConfirmationOverlay({ inference, onSelect, onOpenDetails }: { inference: GoalInferenceResult; onSelect: (goal: GoalCandidate) => void; onOpenDetails: () => void }) {
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
    <div className="overlay-actions"><button className="button primary" onClick={onOpenDetails}>Enter a different goal</button><button className="button secondary" onClick={dismissOverlay}>Cancel</button></div>
  </section>;
}
