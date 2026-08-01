import { useSyncExternalStore } from "react";
import type { ActionPlan, ActionResult, Checkpoint, GapSession, Goal, RecoveryBrief } from "@continuity/contracts";

export type DesktopWorkflowPhase = "OBSERVING" | "IDENTIFYING_GOAL" | "GOAL_CONFIRMATION" | "READY_FOR_GAP" | "STARTING_GAP" | "GAP_ACTIVE" | "AWAITING_APPROVAL" | "ENDING_GAP" | "RECOVERY_READY" | "FAILED";
export interface DesktopWorkflowState {
  readonly workSessionId: string;
  readonly confirmedGoal?: Goal;
  readonly checkpoint?: Checkpoint;
  readonly gapSession?: GapSession;
  readonly actionPlan?: ActionPlan;
  readonly actionResults: readonly ActionResult[];
  readonly recoveryBrief?: RecoveryBrief;
  readonly phase: DesktopWorkflowPhase;
  readonly pending: boolean;
  readonly error?: string;
}

let snapshot: DesktopWorkflowState = { workSessionId: "", actionResults: [], phase: "OBSERVING", pending: false };
const listeners = new Set<() => void>();
export function getDesktopWorkflowState(): DesktopWorkflowState { return snapshot; }
export function setDesktopWorkflowState(next: DesktopWorkflowState): void { snapshot = next; listeners.forEach((listener) => listener()); }
export function patchDesktopWorkflowState(next: Partial<DesktopWorkflowState>): void { setDesktopWorkflowState({ ...snapshot, ...next }); }
export function subscribeDesktopWorkflow(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function useDesktopWorkflowState(): DesktopWorkflowState { return useSyncExternalStore(subscribeDesktopWorkflow, getDesktopWorkflowState, getDesktopWorkflowState); }
