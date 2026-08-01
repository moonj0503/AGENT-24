import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import type { GapData } from "../features/gap/api";
import { useOverlaySnapshot } from "./overlay-store";
import { GoalConfirmationOverlay } from "./components/GoalConfirmationOverlay";
import { GapStartOverlay } from "./components/GapStartOverlay";
import { ApprovalOverlay } from "./components/ApprovalOverlay";
import { RecoveryNotificationOverlay } from "./components/RecoveryNotificationOverlay";

export type OverlayHandlers = {
  onGoalSelected: (goal: GoalCandidate) => void;
  onConfirmGapStart: () => Promise<GapData>;
  onApproval: (actionId: string, status: "COMPLETED" | "REJECTED") => Promise<void>;
  onOpenMain: (screen: "dashboard" | "goal" | "gap" | "recovery") => void;
};

export function OverlayRoot({ handlers, inference }: { handlers: OverlayHandlers; inference?: GoalInferenceResult }) {
  const snapshot = useOverlaySnapshot();
  const currentInference = snapshot.inference ?? inference;
  if (snapshot.state === "GOAL_CONFIRMATION" && currentInference) return <GoalConfirmationOverlay inference={currentInference} onSelect={handlers.onGoalSelected} onOpenDetails={() => handlers.onOpenMain("goal")} />;
  if (snapshot.state === "GAP_START_CONFIRMATION") return <GapStartOverlay goal={snapshot.selectedGoal} gap={snapshot.gap} onConfirm={handlers.onConfirmGapStart} onOpenDetails={() => handlers.onOpenMain("gap")} />;
  if (snapshot.state === "APPROVAL_REQUIRED" && snapshot.gap && snapshot.actionId) return <ApprovalOverlay gap={snapshot.gap} actionId={snapshot.actionId} onDecision={handlers.onApproval} onOpenDetails={() => handlers.onOpenMain("gap")} />;
  if (snapshot.state === "RECOVERY_READY" && snapshot.brief) return <RecoveryNotificationOverlay brief={snapshot.brief} onOpenDetails={() => handlers.onOpenMain("recovery")} />;
  return <div className="overlay-empty" aria-live="polite">No action needs your attention.</div>;
}
