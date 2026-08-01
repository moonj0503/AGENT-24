import type { RecoveryBrief } from "@continuity/contracts";
import { dismissOverlay } from "../overlay-store";

export function recoveryNotificationSummary(brief: RecoveryBrief) {
  return { completed: brief.completedActions.length, hasExternalEffects: brief.externalEffects.length > 0, nextAction: brief.recommendedNextAction.title };
}

export function RecoveryNotificationOverlay({ brief, onOpenDetails }: { brief: RecoveryBrief & { gapDurationSeconds?: number }; onOpenDetails: () => void }) {
  const externalEffect = brief.externalEffects.length > 0;
  const duration = brief.gapDurationSeconds ? `${Math.floor(brief.gapDurationSeconds / 60)} minutes` : "an extended period";
  return <section className="overlay-card" aria-labelledby="overlay-recovery-title">
    <p className="eyebrow">RECOVERY READY</p>
    <h2 id="overlay-recovery-title">Welcome back</h2>
    <p className="overlay-copy">Your task flow was interrupted for {duration}.</p>
    <div className="overlay-summary"><strong>{brief.goalBeforeGap}</strong><span>{brief.completedActions.length} completed actions · {externalEffect ? "External effects occurred" : "No external effects"}</span></div>
    <p className="overlay-recommendation"><span>Recommended next action</span>{brief.recommendedNextAction.title} · about {brief.recommendedNextAction.estimatedMinutes} min</p>
    <div className="overlay-actions"><button className="button primary" onClick={() => { dismissOverlay(); onOpenDetails(); }}>Open Full Recovery Brief</button><button className="button secondary" onClick={dismissOverlay}>Resume</button></div>
  </section>;
}
