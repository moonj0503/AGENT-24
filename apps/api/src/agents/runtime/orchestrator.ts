import type {
  ActionPlan,
  ActionResult,
  PlannedAction,
  RecoveryBrief,
} from "@continuity/contracts";
import {
  FixtureContinuityAgent,
  type ContinuityAgent,
} from "../continuity-agent/index.js";
import {
  FixtureRecoveryGenerator,
  type RecoveryGenerator,
} from "../recovery-generator/index.js";
import {
  DeterministicPolicyEngine,
  type PolicyEngine,
  type PolicyEvaluation,
} from "../../policy/index.js";
import { ToolExecutor } from "../../tools/index.js";
import type {
  RuntimeActionExecutor,
  RuntimeInput,
  RuntimeOrchestrator,
  RuntimeResult,
  RuntimeStage,
} from "./types.js";

export class RuntimeContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeContextValidationError";
  }
}

export class RuntimeExecutionError extends Error {
  constructor(
    readonly stage: RuntimeStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${stage}: ${message}`, options);
    this.name = "RuntimeExecutionError";
  }
}

function validateInputIdentities(input: RuntimeInput): void {
  if (input.goal.goalId !== input.checkpoint.goalId) {
    throw new RuntimeContextValidationError("Goal and Checkpoint goalIds do not match.");
  }
  if (input.goal.goalId !== input.gapSession.goalId) {
    throw new RuntimeContextValidationError("Goal and GapSession goalIds do not match.");
  }
  if (input.checkpoint.checkpointId !== input.gapSession.checkpointId) {
    throw new RuntimeContextValidationError("Checkpoint and GapSession checkpointIds do not match.");
  }
}

function dependencyError(stage: RuntimeStage, error: unknown): RuntimeExecutionError {
  const message = error instanceof Error ? error.message : "Unknown dependency error.";
  return new RuntimeExecutionError(stage, message, { cause: error });
}

export class FixtureRuntimeOrchestrator implements RuntimeOrchestrator {
  constructor(
    private readonly continuityAgent: ContinuityAgent = new FixtureContinuityAgent(),
    private readonly policyEngine: PolicyEngine = new DeterministicPolicyEngine(),
    private readonly toolExecutor: RuntimeActionExecutor = new ToolExecutor(),
    private readonly recoveryGenerator: RecoveryGenerator = new FixtureRecoveryGenerator(),
  ) {}

  async run(input: RuntimeInput): Promise<RuntimeResult> {
    validateInputIdentities(input);

    let actionPlan: ActionPlan;
    try {
      actionPlan = await this.continuityAgent.run({
        goal: input.goal,
        checkpoint: input.checkpoint,
        gapSession: input.gapSession,
      });
    } catch (error) {
      throw dependencyError("CONTINUITY", error);
    }

    if (actionPlan.gapId !== input.gapSession.gapId) {
      throw new RuntimeContextValidationError("ActionPlan and GapSession gapIds do not match.");
    }

    const policyEvaluations: PolicyEvaluation[] = [];
    const actionResults: ActionResult[] = [];

    for (const action of actionPlan.actions) {
      const evaluation = this.evaluatePolicy(action);
      policyEvaluations.push(evaluation);

      const result = await this.executeTool(action, evaluation, input.occurredAt);
      if (result.actionId !== action.actionId) {
        throw new RuntimeExecutionError(
          "TOOL",
          `ActionResult ${result.actionId} does not match PlannedAction ${action.actionId}.`,
        );
      }
      actionResults.push(result);
    }

    let recoveryBrief: RecoveryBrief;
    try {
      recoveryBrief = await this.recoveryGenerator.run({
        goal: input.goal,
        gapSession: input.gapSession,
        actionPlan,
        actionResults,
      });
    } catch (error) {
      throw dependencyError("RECOVERY", error);
    }

    return { actionPlan, policyEvaluations, actionResults, recoveryBrief };
  }

  private evaluatePolicy(action: PlannedAction): PolicyEvaluation {
    try {
      return this.policyEngine.evaluate(action);
    } catch (error) {
      throw dependencyError("POLICY", error);
    }
  }

  private async executeTool(
    action: PlannedAction,
    evaluation: PolicyEvaluation,
    occurredAt: string,
  ): Promise<ActionResult> {
    try {
      return await this.toolExecutor.execute(action, evaluation, { occurredAt });
    } catch (error) {
      throw dependencyError("TOOL", error);
    }
  }
}
