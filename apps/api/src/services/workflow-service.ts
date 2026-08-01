import { randomUUID } from "node:crypto";
import {
  type ConfirmGoalRequest,
  type Goal,
  type GoalInferenceRequest,
  type GoalInferenceResult,
  type ObservationRequest,
  GoalSchema,
} from "@continuity/contracts";
import { FixtureGoalInterpreter, type GoalInterpreter } from "../agents/goal-interpreter/index.js";
import type { AgentEventPublisher } from "../features/workflow/event-bus.js";
import { ApiHttpError } from "../plugins/error-handler.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";
import { InMemoryWorkflowRepository } from "../repositories/in-memory-workflow-repository.js";

export class WorkflowService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly goalInterpreter: GoalInterpreter,
    private readonly events?: AgentEventPublisher,
  ) {}

  async ingestObservations(request: ObservationRequest) {
    try {
      return await this.repository.ingestObservations(request);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "Observations could not be saved.", { cause });
    }
  }

  async inferGoal(request: GoalInferenceRequest): Promise<GoalInferenceResult> {
    let events: ReadonlyMap<string, import("@continuity/contracts").ActivityEvent>;
    try {
      events = await this.repository.getActivityEvents(request.workSessionId, request.observationEventIds);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "Observations could not be loaded.", { cause });
    }

    const selectedEvents = request.observationEventIds.map((eventId) => {
      const event = events.get(eventId);
      if (!event) {
        throw new ApiHttpError("NOT_FOUND", `Observation event ${eventId} was not found.`);
      }
      return event;
    });

    let result: GoalInferenceResult;
    try {
      result = await this.goalInterpreter.run({
        workSessionId: request.workSessionId,
        events: selectedEvents,
      });
    } catch (cause) {
      throw new ApiHttpError("AGENT_FAILURE", "The goal inference could not be created.", { cause });
    }

    try {
      await this.repository.saveInference(request.workSessionId, result);
      this.events?.publish({
        eventId: `event-${randomUUID()}`,
        type: "GOAL_INFERRED",
        occurredAt: new Date().toISOString(),
        payload: { result },
      });
      return result;
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The goal inference could not be saved.", { cause });
    }
  }

  async confirmGoal(request: ConfirmGoalRequest): Promise<Goal> {
    let inference;
    try {
      inference = await this.repository.getInference(request.inferenceId);
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The goal inference could not be loaded.", { cause });
    }

    if (!inference) {
      throw new ApiHttpError("NOT_FOUND", `Goal inference ${request.inferenceId} was not found.`);
    }

    const goal = request.selection.type === "CANDIDATE"
      ? this.confirmCandidate(inference.result, request.selection.candidateId)
      : GoalSchema.parse({
        goalId: `goal-manual-${randomUUID()}`,
        title: request.selection.title,
        path: request.selection.path,
        status: "IN_PROGRESS",
        source: "USER_CREATED",
        confidence: 1,
      });

    try {
      await this.repository.saveGoal(request.inferenceId, goal);
      return goal;
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The confirmed goal could not be saved.", { cause });
    }
  }

  private confirmCandidate(result: GoalInferenceResult, candidateId: string): Goal {
    const candidate = result.candidates.find((item) => item.candidateId === candidateId);
    if (!candidate) {
      throw new ApiHttpError("NOT_FOUND", `Goal candidate ${candidateId} was not found.`);
    }

    return GoalSchema.parse({
      goalId: candidate.candidateId,
      title: candidate.title,
      path: candidate.suggestedGoalPath,
      status: "IN_PROGRESS",
      source: "USER_CONFIRMED",
      confidence: candidate.confidence,
    });
  }
}

export function createWorkflowService(
  repository: WorkflowRepository,
  goalInterpreter: GoalInterpreter,
  events?: AgentEventPublisher,
): WorkflowService {
  return new WorkflowService(repository, goalInterpreter, events);
}

export function createInMemoryWorkflowService(
  goalInterpreter: GoalInterpreter = new FixtureGoalInterpreter(),
  events?: AgentEventPublisher,
): WorkflowService {
  return createWorkflowService(new InMemoryWorkflowRepository(), goalInterpreter, events);
}
