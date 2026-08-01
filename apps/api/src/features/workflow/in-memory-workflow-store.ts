import {
  type ActivityEvent,
  type ConfirmGoalRequest,
  type Goal,
  type GoalInferenceRequest,
  type GoalInferenceResult,
  type ObservationRequest,
  ObservationIngestionResultSchema,
} from "@continuity/contracts";
import { FixtureGoalInterpreter, type GoalInterpreter } from "../../agents/goal-interpreter/index.js";
import { ApiHttpError } from "../../plugins/error-handler.js";

type InferenceRecord = {
  readonly workSessionId: string;
  readonly result: GoalInferenceResult;
};

export class InMemoryWorkflowStore {
  private readonly eventsByWorkSession = new Map<string, Map<string, ActivityEvent>>();
  private readonly inferences = new Map<string, InferenceRecord>();
  private readonly goals = new Map<string, Goal>();
  private manualGoalSequence = 0;

  constructor(private readonly goalInterpreter: GoalInterpreter = new FixtureGoalInterpreter()) {}

  ingestObservations(request: ObservationRequest) {
    const events = this.eventsByWorkSession.get(request.workSessionId) ?? new Map<string, ActivityEvent>();
    for (const event of request.events) {
      events.set(event.eventId, event);
    }
    this.eventsByWorkSession.set(request.workSessionId, events);

    return ObservationIngestionResultSchema.parse({
      workSessionId: request.workSessionId,
      acceptedEventIds: request.events.map((event) => event.eventId),
    });
  }

  async inferGoal(request: GoalInferenceRequest): Promise<GoalInferenceResult> {
    const events = this.eventsByWorkSession.get(request.workSessionId);
    const selectedEvents = request.observationEventIds.map((eventId) => {
      const event = events?.get(eventId);
      if (!event) {
        throw new ApiHttpError("NOT_FOUND", `Observation event ${eventId} was not found.`);
      }
      return event;
    });

    const result = await this.goalInterpreter.run({
      workSessionId: request.workSessionId,
      events: selectedEvents,
    });
    this.inferences.set(result.inferenceId, { workSessionId: request.workSessionId, result });
    return result;
  }

  confirmGoal(request: ConfirmGoalRequest): Goal {
    const inference = this.inferences.get(request.inferenceId);
    if (!inference) {
      throw new ApiHttpError("NOT_FOUND", `Goal inference ${request.inferenceId} was not found.`);
    }

    const goal = request.selection.type === "CANDIDATE"
      ? this.confirmCandidate(inference.result, request.selection.candidateId)
      : this.createManualGoal(request.selection.title, request.selection.path);

    this.goals.set(goal.goalId, goal);
    return goal;
  }

  private confirmCandidate(inference: GoalInferenceResult, candidateId: string): Goal {
    const candidate = inference.candidates.find((item) => item.candidateId === candidateId);
    if (!candidate) {
      throw new ApiHttpError("NOT_FOUND", `Goal candidate ${candidateId} was not found.`);
    }

    return {
      goalId: candidate.candidateId,
      title: candidate.title,
      path: candidate.suggestedGoalPath,
      status: "IN_PROGRESS",
      source: "USER_CONFIRMED",
      confidence: candidate.confidence,
    };
  }

  private createManualGoal(title: string, path: string[]): Goal {
    this.manualGoalSequence += 1;
    return {
      goalId: `goal-manual-${this.manualGoalSequence}`,
      title,
      path,
      status: "IN_PROGRESS",
      source: "USER_CREATED",
      confidence: 1,
    };
  }
}
