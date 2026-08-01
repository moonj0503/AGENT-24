import type { GoalCandidate } from "@continuity/contracts";
import type { GapData } from "../../features/gap/api";
import { dismissOverlayWithAnimation } from "../overlay-store";

export function GapStartOverlay({ goal, gap, onConfirm, onOpenDetails }: { goal?: GoalCandidate; gap?: GapData; onConfirm: () => Promise<void>; onOpenDetails: () => void }) {
  return <section className="overlay-card" aria-labelledby="overlay-gap-title">
    <div className="overlay-intro">
      <p className="eyebrow">GAP START CONFIRMATION</p>
      <h2 id="overlay-gap-title">Ready to start Gap Mode?</h2>
      <p className="overlay-copy">Your confirmed goal stays protected while you are away.</p>
    </div>
    <div className="overlay-summary"><strong>{goal?.title ?? "Confirmed goal"}</strong><span>{goal?.suggestedGoalPath.join(" / ") ?? gap?.session.goalId ?? "Latest checkpoint is ready."}</span></div>
    <div className="overlay-actions"><button className="button primary" onClick={() => void onConfirm().then(dismissOverlayWithAnimation)}>Start Gap Mode</button><button className="button secondary" onClick={dismissOverlayWithAnimation}>Cancel</button><button className="text-button" onClick={onOpenDetails}>Open full details</button></div>
  </section>;
}
