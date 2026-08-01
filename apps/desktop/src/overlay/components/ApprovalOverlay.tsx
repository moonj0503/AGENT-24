import type { ActionPlan } from "@continuity/contracts";
import type { GapData } from "../../features/gap/api";
import { dismissOverlayWithAnimation } from "../overlay-store";

export function ApprovalOverlay({ gap, actionId, onDecision, onOpenDetails }: { gap: GapData; actionId: string; onDecision: (actionId: string, decision: "APPROVE" | "REJECT") => Promise<void>; onOpenDetails: () => void }) {
  const action = gap.plan.actions.find((item) => item.actionId === actionId);
  if (!action || action.status !== "WAITING_APPROVAL") return null;
  const decide = (decision: "APPROVE" | "REJECT") => void onDecision(actionId, decision).then(dismissOverlayWithAnimation);
  return <section className="overlay-card" aria-labelledby="overlay-approval-title">
    <div className="overlay-intro">
      <p className="eyebrow">ACTION APPROVAL</p>
      <h2 id="overlay-approval-title">Review this action</h2>
    </div>
    <div className="overlay-summary"><strong>{action.title}</strong><span>{action.reason}</span></div>
    <dl className="overlay-facts"><div><dt>External impact</dt><dd>{action.riskLevel === "LOW" ? "None" : "A draft may affect your team if sent."}</dd></div><div><dt>Reversible</dt><dd>{action.reversible ? "Yes" : "No"}</dd></div><div><dt>Data used</dt><dd>Current goal and latest checkpoint</dd></div></dl>
    <div className="overlay-actions"><button className="button primary" onClick={() => decide("APPROVE")}>Approve</button><button className="button secondary" onClick={() => decide("REJECT")}>Reject</button><button className="text-button" onClick={onOpenDetails}>Open full details</button></div>
  </section>;
}

export type ApprovalAction = ActionPlan["actions"][number];
