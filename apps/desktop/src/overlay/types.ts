import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";
import type { GapData } from "../features/gap/api";
import type { RecoveryBrief } from "@continuity/contracts";

export const OVERLAY_STATES = [
  "GOAL_CONFIRMATION",
  "GAP_START_CONFIRMATION",
  "APPROVAL_REQUIRED",
  "RECOVERY_READY",
  "HIDDEN",
] as const;

export type OverlayState = (typeof OVERLAY_STATES)[number];
export type MainScreen = "dashboard" | "goal" | "gap" | "recovery" | "history" | "permissions";

export type OverlaySnapshot = {
  state: OverlayState | null;
  inference?: GoalInferenceResult;
  selectedGoal?: GoalCandidate;
  gap?: GapData;
  actionId?: string;
  brief?: RecoveryBrief;
};

export const OVERLAY_PRIORITY: readonly OverlayState[] = [
  "APPROVAL_REQUIRED",
  "RECOVERY_READY",
  "GAP_START_CONFIRMATION",
  "GOAL_CONFIRMATION",
];

export function chooseOverlayState(states: Iterable<OverlayState>): OverlayState | null {
  const available = new Set(states);
  return OVERLAY_PRIORITY.find((state) => available.has(state)) ?? null;
}
