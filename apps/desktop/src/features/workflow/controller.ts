import type { Goal, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import { createCheckpoint, createGapSession, decideGapAction, endGapSession, fetchGapActions, runGap } from "../gap/api";
import { fetchRecoveryBrief } from "../recovery/api";
import { getDesktopWorkflowState, patchDesktopWorkflowState, setDesktopWorkflowState } from "./store";
import { applyApprovedTextPatch, listApprovedTextFiles, readApprovedTextFile, revokeTextFileAuthorization } from "../permissions/approved-files";

export interface DesktopWorkflowControllerDependencies {
  readonly createCheckpoint: typeof createCheckpoint;
  readonly createGapSession: typeof createGapSession;
  readonly runGap: typeof runGap;
  readonly decideGapAction: typeof decideGapAction;
  readonly fetchGapActions: typeof fetchGapActions;
  readonly endGapSession: typeof endGapSession;
  readonly fetchRecoveryBrief: typeof fetchRecoveryBrief;
}
const defaults: DesktopWorkflowControllerDependencies = { createCheckpoint, createGapSession, runGap, decideGapAction, fetchGapActions, endGapSession, fetchRecoveryBrief };

export class DesktopWorkflowController {
  private starting?: Promise<void>;
  private executing?: Promise<void>;
  private ending?: Promise<RecoveryBrief>;
  constructor(workSessionId: string, confirmedGoal?: Goal, private readonly dependencies = defaults) {
    setDesktopWorkflowState({ workSessionId, confirmedGoal, actionResults: [], artifacts: [], phase: confirmedGoal ? "READY_FOR_GAP" : "OBSERVING", pending: false });
  }
  beginGapIntent(): void {
    const current = getDesktopWorkflowState();
    if (current.gapSession && current.gapSession.status !== "COMPLETED") {
      throw new Error("A Gap is already active.");
    }
    const { workSessionId } = current;
    setDesktopWorkflowState({ workSessionId, actionResults: [], artifacts: [], phase: "IDENTIFYING_GOAL", pending: false });
  }
  cancelGapIntent(): void {
    const current = getDesktopWorkflowState();
    if (current.phase === "IDENTIFYING_GOAL" || current.phase === "GOAL_CONFIRMATION") {
      patchDesktopWorkflowState({ phase: "OBSERVING", pending: false });
    }
  }
  setConfirmedGoal(goal: Goal): void { patchDesktopWorkflowState({ confirmedGoal: goal, phase: "READY_FOR_GAP", error: undefined }); }
  clear(): void {
    const { workSessionId } = getDesktopWorkflowState();
    setDesktopWorkflowState({ workSessionId, actionResults: [], artifacts: [], phase: "OBSERVING", pending: false });
  }
  restore(workSessionId: string, goal?: Goal): void {
    setDesktopWorkflowState({ workSessionId, confirmedGoal: goal, actionResults: [], artifacts: [], phase: goal ? "READY_FOR_GAP" : "OBSERVING", pending: false });
  }
  startGap(inference?: GoalInferenceResult): Promise<void> {
    this.starting ??= this.startGapOnce(inference).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  private async startGapOnce(inference?: GoalInferenceResult): Promise<void> {
    const current = getDesktopWorkflowState();
    const goal = current.confirmedGoal;
    if (!goal) throw new Error("Confirm a Goal before starting Gap Mode.");
    patchDesktopWorkflowState({ phase: "STARTING_GAP", pending: true, error: undefined });
    try {
      const checkpoint = current.checkpoint ?? await this.dependencies.createCheckpoint(goal, inference);
      patchDesktopWorkflowState({ checkpoint });
      const gapSession = current.gapSession ?? await this.dependencies.createGapSession(current.workSessionId, goal.goalId, checkpoint.checkpointId);
      patchDesktopWorkflowState({ gapSession, phase: "GAP_ACTIVE", pending: false });
    } catch {
      patchDesktopWorkflowState({ phase: "FAILED", pending: false, error: "Gap Mode could not start. Your confirmed Goal and completed setup were preserved." });
      throw new Error("Gap Mode could not start.");
    }
  }
  private executeGapActions(): Promise<void> {
    this.executing ??= this.executeGapActionsOnce().finally(() => { this.executing = undefined; });
    return this.executing;
  }
  private async executeGapActionsOnce(): Promise<void> {
    const current = getDesktopWorkflowState();
    const gapSession = current.gapSession;
    if (!gapSession) throw new Error("There is no active Gap to execute.");
    try {
      const approvals = await listApprovedTextFiles();
      const approved = approvals.find((item) => item.scope === "GAP") ?? approvals.find((item) => item.scope === "ALWAYS");
      const fileContext = approved ? await readApprovedTextFile(approved.authorizationId) : undefined;
      const runtime = fileContext ? await this.dependencies.runGap(gapSession, fileContext) : await this.dependencies.runGap(gapSession);
      const awaitingApproval = runtime.actionPlan.actions.some((action) => action.status === "WAITING_APPROVAL");
      patchDesktopWorkflowState({ actionPlan: runtime.actionPlan, actionResults: runtime.actionResults, artifacts: runtime.artifacts, recoveryBrief: runtime.recoveryBrief, phase: awaitingApproval ? "AWAITING_APPROVAL" : "GAP_ACTIVE", pending: false });
      for (const action of runtime.actionPlan.actions) {
        if (action.type === "EDIT_APPROVED_TEXT_FILE" && action.status === "WAITING_APPROVAL" && action.textEdit && approved?.authorizationId === action.textEdit.authorizationId) {
          const executionResult = await applyApprovedTextPatch(action.actionId, action.textEdit.authorizationId, action.textEdit.find, action.textEdit.replace);
          await this.decideAction(action.actionId, "APPROVE", executionResult);
        }
      }
      if (approved?.scope === "GAP") await revokeTextFileAuthorization(approved.authorizationId);
    } catch {
      patchDesktopWorkflowState({ phase: "FAILED", pending: false, error: "Gap actions could not complete. The approved file was not changed unless a successful edit was recorded." });
      throw new Error("Gap actions could not complete.");
    }
  }
  async decideAction(actionId: string, decision: "APPROVE" | "REJECT", executionResult?: import("@continuity/contracts").ActionResult): Promise<void> {
    const state = getDesktopWorkflowState();
    if (!state.gapSession || !state.actionPlan) throw new Error("The active Gap action is no longer available.");
    const action = await this.dependencies.decideGapAction(state.gapSession.gapId, actionId, decision, decision === "REJECT" ? "The user rejected this action." : undefined, executionResult);
    const history = await this.dependencies.fetchGapActions(state.gapSession.gapId);
    const actions = state.actionPlan.actions.map((item) => item.actionId === action.actionId ? action : item);
    const results = history.actions.flatMap((item) => item.result ? [item.result] : []);
    const recoveryBrief = executionResult ? await this.dependencies.fetchRecoveryBrief(state.gapSession.gapId) : state.recoveryBrief;
    patchDesktopWorkflowState({ actionPlan: { ...state.actionPlan, actions }, actionResults: results, recoveryBrief, phase: actions.some((item) => item.status === "WAITING_APPROVAL") ? "AWAITING_APPROVAL" : "GAP_ACTIVE" });
  }
  endGap(): Promise<RecoveryBrief> {
    this.ending ??= this.endGapOnce().finally(() => { this.ending = undefined; });
    return this.ending;
  }
  private async endGapOnce(): Promise<RecoveryBrief> {
    let state = getDesktopWorkflowState();
    if (!state.gapSession) throw new Error("There is no active Gap to end.");
    const gapId = state.gapSession.gapId;
    patchDesktopWorkflowState({ phase: "ENDING_GAP", pending: true, error: undefined });
    try {
      if (!state.actionPlan || !state.recoveryBrief) {
        await this.executeGapActions();
        state = getDesktopWorkflowState();
      }
      const gapSession = await this.dependencies.endGapSession(gapId);
      const recoveryBrief = state.recoveryBrief ?? await this.dependencies.fetchRecoveryBrief(gapSession.gapId);
      patchDesktopWorkflowState({ gapSession, recoveryBrief, phase: "RECOVERY_READY", pending: false });
      return recoveryBrief;
    } catch {
      patchDesktopWorkflowState({ phase: "FAILED", pending: false, error: "The Gap could not be completed. Its current state was preserved." });
      throw new Error("The Gap could not be completed.");
    }
  }
}

let controller: DesktopWorkflowController | undefined;
export function initializeDesktopWorkflowController(workSessionId: string, goal?: Goal): DesktopWorkflowController {
  if (!controller) controller = new DesktopWorkflowController(workSessionId, goal);
  else controller.restore(workSessionId, goal);
  return controller;
}
export function getDesktopWorkflowController(): DesktopWorkflowController | undefined { return controller; }
