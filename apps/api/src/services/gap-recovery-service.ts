import type {
  RunGapRecoveryParams,
  RunGapRecoveryRequest,
  RunGapRecoveryResponse,
} from "@continuity/contracts";
import { randomUUID } from "node:crypto";
import {
  RuntimeContextValidationError,
  RuntimeExecutionError,
  type RuntimeOrchestrator,
} from "../agents/runtime/index.js";
import type { AgentEventPublisher } from "../features/workflow/event-bus.js";
import { ApiHttpError } from "../plugins/error-handler.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";

export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export class GapRecoveryService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly runtime: RuntimeOrchestrator,
    private readonly clock: Clock = systemClock,
    private readonly events?: AgentEventPublisher,
  ) {}

  async run(
    params: RunGapRecoveryParams,
    request: RunGapRecoveryRequest,
  ): Promise<RunGapRecoveryResponse> {
    const [goal, checkpoint, gapSession] = await this.loadContext(params, request);

    if (goal.goalId !== checkpoint.goalId || goal.goalId !== gapSession.goalId) {
      throw new ApiHttpError("CONFLICT", "The recovery context identities do not match.");
    }
    if (checkpoint.checkpointId !== gapSession.checkpointId) {
      throw new ApiHttpError("CONFLICT", "The recovery context identities do not match.");
    }

    let result;
    try {
      result = await this.runtime.run({
        goal,
        checkpoint,
        gapSession,
        occurredAt: this.clock.now(),
      });
    } catch (cause) {
      if (cause instanceof RuntimeContextValidationError) {
        throw new ApiHttpError("CONFLICT", "The recovery context identities do not match.", { cause });
      }
      if (cause instanceof RuntimeExecutionError) {
        throw new ApiHttpError("AGENT_FAILURE", "The recovery runtime could not complete.", { cause });
      }
      throw new ApiHttpError("AGENT_FAILURE", "The recovery runtime could not complete.", { cause });
    }

    try {
      await this.repository.saveActionPlan(result.actionPlan);
      await Promise.all(result.actionResults.map((actionResult) =>
        this.repository.saveActionResult(gapSession.gapId, actionResult)));
      await this.repository.saveRecoveryBrief(result.recoveryBrief);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The recovery result could not be saved.", { cause });
    }
    this.events?.publish({
      eventId: `event-${randomUUID()}`,
      type: "RECOVERY_READY",
      gapId: gapSession.gapId,
      occurredAt: this.clock.now(),
      payload: { recoveryBrief: result.recoveryBrief },
    });
    return {
      actionPlan: result.actionPlan,
      actionResults: [...result.actionResults],
      recoveryBrief: result.recoveryBrief,
    };
  }

  private async loadContext(params: RunGapRecoveryParams, request: RunGapRecoveryRequest) {
    try {
      const [goal, checkpoint, gapSession] = await Promise.all([
        this.repository.getGoal(request.goalId),
        this.repository.getCheckpoint(request.checkpointId),
        this.repository.getGapSession(params.gapId),
      ]);
      if (!goal) throw new ApiHttpError("NOT_FOUND", "The confirmed Goal was not found.");
      if (!checkpoint) throw new ApiHttpError("NOT_FOUND", "The Checkpoint was not found.");
      if (!gapSession) throw new ApiHttpError("NOT_FOUND", "The GapSession was not found.");
      return [goal, checkpoint, gapSession] as const;
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "The recovery context could not be loaded.", { cause });
    }
  }
}

export function createGapRecoveryService(
  repository: WorkflowRepository,
  runtime: RuntimeOrchestrator,
  clock: Clock = systemClock,
  events?: AgentEventPublisher,
): GapRecoveryService {
  return new GapRecoveryService(repository, runtime, clock, events);
}
