import type { ActionPlan, Checkpoint, CreateCheckpointRequest, GapSession, PlannedAction, RecoveryBrief, RunGapRecoveryResponse } from "@continuity/contracts";
import { apiRequest } from "../../lib/api";

export type GapData = { session: GapSession; plan: ActionPlan; recoveryBrief: RecoveryBrief };
export type GapStartContext = Omit<CreateCheckpointRequest, "goalId"> & { workSessionId: string; goalId: string };

export async function startGap(context: GapStartContext): Promise<GapData> {
  const { workSessionId, goalId, ...checkpointRequest } = context;
  const checkpoint = await apiRequest<Checkpoint>("/checkpoints", { method: "POST", body: JSON.stringify({ goalId, ...checkpointRequest }) });
  const session = await apiRequest<GapSession>("/gaps", { method: "POST", body: JSON.stringify({ workSessionId, goalId, checkpointId: checkpoint.checkpointId }) });
  const recovery = await apiRequest<RunGapRecoveryResponse>(`/gaps/${session.gapId}/run`, { method: "POST", body: JSON.stringify({ goalId, checkpointId: checkpoint.checkpointId }) });
  return { session, plan: recovery.actionPlan, recoveryBrief: recovery.recoveryBrief };
}

export async function updateAction(gap: GapData, actionId: string, decision: "APPROVE" | "REJECT"): Promise<GapData> {
  const updated = await apiRequest<PlannedAction>(`/gaps/${gap.session.gapId}/actions/${actionId}/approval`, { method: "POST", body: JSON.stringify({ decision }) });
  return { ...gap, plan: { ...gap.plan, actions: gap.plan.actions.map((action) => action.actionId === actionId ? updated : action) } };
}

export async function endGap(gap: GapData): Promise<GapData> {
  const session = await apiRequest<GapSession>(`/gaps/${gap.session.gapId}/end`, { method: "POST", body: JSON.stringify({}) });
  return { ...gap, session };
}
