import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import type { ReactNode } from "react";
import type { GapData } from "../features/gap/api";
import { useOverlaySnapshot } from "./overlay-store";
import { GoalConfirmationOverlay } from "./components/GoalConfirmationOverlay";
import { GapStartOverlay } from "./components/GapStartOverlay";
import { ApprovalOverlay } from "./components/ApprovalOverlay";
import { RecoveryNotificationOverlay } from "./components/RecoveryNotificationOverlay";
import { usePendingGoalConfirmationSnapshot } from "../features/goals/pending-confirmation-store";
import { dismissOverlayWithAnimation } from "./overlay-store";

export type OverlayHandlers = {
  onGoalSelected: (goal: GoalCandidate) => void | Promise<void>;
  onGoalLater?: () => void;
  onGoalIgnore?: () => void;
  onKeepCurrentGoal?: () => void;
  onConfirmGapStart: () => Promise<void>;
  onApproval: (actionId: string, decision: "APPROVE" | "REJECT") => Promise<void>;
  onOpenMain: (screen: "dashboard" | "goal" | "gap" | "recovery") => void;
};

export function OverlayRoot({ handlers, inference }: { handlers: OverlayHandlers; inference?: GoalInferenceResult }) {
  const snapshot = useOverlaySnapshot();
  const pending = usePendingGoalConfirmationSnapshot().pending;
  const currentInference = snapshot.inference ?? inference;
  if (snapshot.state === "HIDDEN") return null;
  let content: ReactNode;
  if (snapshot.state === "GOAL_CONFIRMATION" && currentInference) content = <GoalConfirmationOverlay
    inference={currentInference}
    pending={pending}
    onSelect={handlers.onGoalSelected}
    onLater={handlers.onGoalLater ?? dismissOverlayWithAnimation}
    onIgnore={handlers.onGoalIgnore ?? dismissOverlayWithAnimation}
    onKeepCurrent={handlers.onKeepCurrentGoal ?? dismissOverlayWithAnimation}
    onOpenDetails={() => handlers.onOpenMain("goal")}
  />;
  else if (snapshot.state === "GAP_START_CONFIRMATION") content = <GapStartOverlay goal={snapshot.selectedGoal} gap={snapshot.gap} onConfirm={handlers.onConfirmGapStart} onOpenDetails={() => handlers.onOpenMain("gap")} />;
  else if (snapshot.state === "APPROVAL_REQUIRED" && snapshot.gap && snapshot.actionId) content = <ApprovalOverlay gap={snapshot.gap} actionId={snapshot.actionId} onDecision={handlers.onApproval} onOpenDetails={() => handlers.onOpenMain("gap")} />;
  else if (snapshot.state === "RECOVERY_READY" && snapshot.brief) content = <RecoveryNotificationOverlay brief={snapshot.brief} onOpenDetails={() => handlers.onOpenMain("recovery")} />;
  else content = <div className="overlay-empty" aria-live="polite">No action needs your attention.</div>;
  return <div className={`overlay-panel${snapshot.isClosing ? " is-closing" : ""}`}>{content}</div>;
}
