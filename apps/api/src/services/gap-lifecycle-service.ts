import { randomUUID } from "node:crypto";
import {
  CheckpointSchema,
  GapSessionSchema,
  PlannedActionSchema,
  type ActionApprovalParams,
  type ActionApprovalRequest,
  type Checkpoint,
  type CreateCheckpointRequest,
  type EndGapParams,
  type EndGapRequest,
  type GapSession,
  type StartGapRequest,
} from "@continuity/contracts";
import type { AgentEventPublisher } from "../features/workflow/event-bus.js";
import { ApiHttpError } from "../plugins/error-handler.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";
import type { Clock } from "./gap-recovery-service.js";
import { systemClock } from "./gap-recovery-service.js";

export class GapLifecycleService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly events: AgentEventPublisher,
    private readonly clock: Clock = systemClock,
  ) {}

  async createCheckpoint(request: CreateCheckpointRequest): Promise<Checkpoint> {
    await this.requireGoal(request.goalId);
    const checkpoint = CheckpointSchema.parse({
      checkpointId: `checkpoint-${randomUUID()}`,
      ...request,
      createdAt: this.clock.now(),
    });
    try {
      await this.repository.saveCheckpoint(checkpoint);
      return checkpoint;
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The Checkpoint could not be saved.", { cause });
    }
  }

  async startGap(request: StartGapRequest): Promise<GapSession> {
    const [goal, checkpoint] = await this.loadStartContext(request);
    if (goal.goalId !== checkpoint.goalId) {
      throw new ApiHttpError("CONFLICT", "The Goal and Checkpoint do not match.");
    }

    const gapSession = GapSessionSchema.parse({
      gapId: `gap-${randomUUID()}`,
      ...request,
      status: "PLANNING",
      startedAt: this.clock.now(),
    });
    try {
      await this.repository.saveGapSession(gapSession);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The GapSession could not be saved.", { cause });
    }
    this.events.publish({
      eventId: `event-${randomUUID()}`,
      type: "GAP_STARTED",
      gapId: gapSession.gapId,
      occurredAt: this.clock.now(),
      payload: { gapSession },
    });
    return gapSession;
  }

  async decideAction(
    params: ActionApprovalParams,
    request: ActionApprovalRequest,
  ) {
    const gapSession = await this.requireGap(params.gapId);
    if (gapSession.status === "COMPLETED" || gapSession.status === "FAILED") {
      throw new ApiHttpError("INVALID_STATE_TRANSITION", "Actions cannot be changed after the Gap ends.");
    }

    let action;
    try {
      action = await this.repository.getAction(params.gapId, params.actionId);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The planned action could not be loaded.", { cause });
    }
    if (!action) throw new ApiHttpError("NOT_FOUND", "The planned action was not found.");
    if (action.status !== "WAITING_APPROVAL" && action.status !== "POLICY_CHECKING") {
      throw new ApiHttpError("INVALID_STATE_TRANSITION", "The planned action is not waiting for a decision.");
    }

    const updated = PlannedActionSchema.parse({
      ...action,
      status: request.decision === "APPROVE" ? "EXECUTING" : "REJECTED",
    });
    try {
      await this.repository.updateAction(params.gapId, updated, request.decision, request.reason);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The planned action could not be updated.", { cause });
    }
    this.events.publish({
      eventId: `event-${randomUUID()}`,
      type: "ACTION_UPDATED",
      gapId: params.gapId,
      occurredAt: this.clock.now(),
      payload: { action: updated, decision: request.decision, reason: request.reason },
    });
    return updated;
  }

  async endGap(params: EndGapParams, _request: EndGapRequest): Promise<GapSession> {
    const gapSession = await this.requireGap(params.gapId);
    if (gapSession.endedAt) {
      throw new ApiHttpError("INVALID_STATE_TRANSITION", "The GapSession has already ended.");
    }
    const ended = GapSessionSchema.parse({
      ...gapSession,
      status: "COMPLETED",
      endedAt: this.clock.now(),
    });
    try {
      await this.repository.saveGapSession(ended);
      return ended;
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The GapSession could not be ended.", { cause });
    }
  }

  private async requireGoal(goalId: string) {
    try {
      const goal = await this.repository.getGoal(goalId);
      if (!goal) throw new ApiHttpError("NOT_FOUND", "The confirmed Goal was not found.");
      return goal;
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "The Goal could not be loaded.", { cause });
    }
  }

  private async loadStartContext(request: StartGapRequest) {
    try {
      const [goal, checkpoint] = await Promise.all([
        this.repository.getGoal(request.goalId),
        this.repository.getCheckpoint(request.checkpointId),
      ]);
      if (!goal) throw new ApiHttpError("NOT_FOUND", "The confirmed Goal was not found.");
      if (!checkpoint) throw new ApiHttpError("NOT_FOUND", "The Checkpoint was not found.");
      return [goal, checkpoint] as const;
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "The Gap context could not be loaded.", { cause });
    }
  }

  private async requireGap(gapId: string): Promise<GapSession> {
    try {
      const gapSession = await this.repository.getGapSession(gapId);
      if (!gapSession) throw new ApiHttpError("NOT_FOUND", "The GapSession was not found.");
      return gapSession;
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "The GapSession could not be loaded.", { cause });
    }
  }
}

export function createGapLifecycleService(
  repository: WorkflowRepository,
  events: AgentEventPublisher,
  clock: Clock = systemClock,
): GapLifecycleService {
  return new GapLifecycleService(repository, events, clock);
}
