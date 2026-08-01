import { useState } from "react";
import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";
import type { PendingGoalConfirmation } from "../../features/goals/pending-confirmation-store";

export function GoalConfirmationOverlay({ inference, pending, onSelect, onLater, onIgnore, onKeepCurrent, onOpenDetails }: {
  inference: GoalInferenceResult;
  pending?: PendingGoalConfirmation;
  onSelect: (goal: GoalCandidate) => void | Promise<void>;
  onLater: () => void;
  onIgnore: () => void;
  onKeepCurrent: () => void;
  onOpenDetails: () => void;
}) {
  const [submittingId, setSubmittingId] = useState<string>();
  const [error, setError] = useState<string>();
  async function select(candidate: GoalCandidate) {
    if (submittingId) return;
    setSubmittingId(candidate.candidateId);
    setError(undefined);
    try {
      await onSelect(candidate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Goal could not be confirmed.");
      setSubmittingId(undefined);
    }
  }
  const changingGoal = pending?.reason === "GOAL_CHANGE";
  return <section className="overlay-card" aria-labelledby="overlay-goal-title">
    <div className="overlay-intro">
      <p className="eyebrow">GOAL CONFIRMATION</p>
      <h2 id="overlay-goal-title">{changingGoal ? "Your work may have changed." : "What are you working on?"}</h2>
      {changingGoal && pending.previousGoal && <p className="overlay-copy"><strong>Current Goal:</strong> {pending.previousGoal.title}</p>}
      <p className="overlay-copy">{inference.inferenceSummary}</p>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="overlay-options">{inference.candidates.slice(0, 3).map((candidate) => <button className="overlay-option" disabled={Boolean(submittingId)} key={candidate.candidateId} onClick={() => void select(candidate)}>
      <span><strong>{candidate.title}</strong><small>{candidate.description}</small><small>Evidence: {candidate.evidence[0]?.description ?? "No evidence summary available."}</small></span>
      <b>{submittingId === candidate.candidateId ? "Confirming…" : `${Math.round(candidate.confidence * 100)}%`}</b>
    </button>)}</div>
    <div className="overlay-actions">
      {changingGoal && <button className="button secondary" disabled={Boolean(submittingId)} onClick={onKeepCurrent}>Keep current Goal</button>}
      <button className="button secondary" disabled={Boolean(submittingId)} onClick={onLater}>Later</button>
      <button className="button secondary" disabled={Boolean(submittingId)} onClick={onIgnore}>Do not ask again today</button>
      <button className="button primary" disabled={Boolean(submittingId)} onClick={onOpenDetails}>Enter a different goal</button>
    </div>
  </section>;
}
