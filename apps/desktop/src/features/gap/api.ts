import {
  ActionApprovalRequestSchema,
  CheckpointSchema,
  CreateCheckpointRequestSchema,
  EndGapRequestSchema,
  EndGapResponseSchema,
  GapActionsResponseSchema,
  GapSessionSchema,
  PlannedActionSchema,
  RunGapRecoveryRequestSchema,
  RunGapRecoveryResponseSchema,
  StartGapRequestSchema,
  type ActionPlan,
  type ActionResult,
  type Checkpoint,
  type GapSession,
  type Goal,
  type GoalInferenceResult,
  type PlannedAction,
  type RunGapRecoveryResponse,
} from "@continuity/contracts";
import { apiRequest } from "../../lib/api";

export type GapData = { session: GapSession; plan: ActionPlan; actionResults: readonly ActionResult[] };

export async function createCheckpoint(goal: Goal, inference?: GoalInferenceResult): Promise<Checkpoint> {
  const request = CreateCheckpointRequestSchema.parse({
    goalId: goal.goalId,
    currentState: inference?.inferenceSummary ?? `Continuity is preserving the confirmed Goal: ${goal.title}.`,
    completedSincePrevious: [], openQuestions: [],
    likelyNextActions: [{ title: `Resume ${goal.title}`, estimatedMinutes: 10 }],
    relatedResources: [], confidence: goal.confidence,
  });
  return CheckpointSchema.parse(await apiRequest("/checkpoints", { method: "POST", body: JSON.stringify(request) }));
}

export async function createGapSession(workSessionId: string, goalId: string, checkpointId: string): Promise<GapSession> {
  const request = StartGapRequestSchema.parse({ workSessionId, goalId, checkpointId });
  return GapSessionSchema.parse(await apiRequest("/gaps", { method: "POST", body: JSON.stringify(request) }));
}

export async function runGap(session: GapSession): Promise<RunGapRecoveryResponse> {
  const request = RunGapRecoveryRequestSchema.parse({ goalId: session.goalId, checkpointId: session.checkpointId });
  return RunGapRecoveryResponseSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(session.gapId)}/run`, { method: "POST", body: JSON.stringify(request) }));
}

export async function decideGapAction(gapId: string, actionId: string, decision: "APPROVE" | "REJECT", reason?: string): Promise<PlannedAction> {
  const request = ActionApprovalRequestSchema.parse({ decision, ...(reason ? { reason } : {}) });
  return PlannedActionSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(gapId)}/actions/${encodeURIComponent(actionId)}/approval`, { method: "POST", body: JSON.stringify(request) }));
}

export async function fetchGapActions(gapId: string) {
  return GapActionsResponseSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(gapId)}/actions`));
}

export async function endGapSession(gapId: string): Promise<GapSession> {
  const request = EndGapRequestSchema.parse({ reason: "The user returned to the workflow." });
  return EndGapResponseSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(gapId)}/end`, { method: "POST", body: JSON.stringify(request) }));
}
