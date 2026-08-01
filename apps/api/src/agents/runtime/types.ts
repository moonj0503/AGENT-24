import type {
  ActionPlan,
  ActionResult,
  Checkpoint,
  GapSession,
  Goal,
  PlannedAction,
  RecoveryBrief,
} from "@continuity/contracts";
import type { PolicyEvaluation } from "../../policy/index.js";
import type { ToolExecutionContext } from "../../tools/index.js";

export interface RuntimeInput {
  readonly goal: Goal;
  readonly checkpoint: Checkpoint;
  readonly gapSession: GapSession;
  readonly occurredAt: string;
  readonly approvedTextFile?: { readonly authorizationId: string; readonly fileName: string; readonly content: string };
}

export interface RuntimeResult {
  readonly actionPlan: ActionPlan;
  readonly policyEvaluations: readonly PolicyEvaluation[];
  readonly actionResults: readonly ActionResult[];
  readonly recoveryBrief: RecoveryBrief;
}

export interface RuntimeActionExecutor {
  execute(
    action: PlannedAction,
    evaluation: PolicyEvaluation,
    context: ToolExecutionContext,
  ): Promise<ActionResult>;
}

export interface RuntimeOrchestrator {
  run(input: RuntimeInput): Promise<RuntimeResult>;
}

export type RuntimeStage = "CONTINUITY" | "POLICY" | "TOOL" | "RECOVERY";
