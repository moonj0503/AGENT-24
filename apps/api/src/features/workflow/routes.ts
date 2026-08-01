import type { FastifyInstance } from "fastify";
import {
  ConfirmGoalRequestSchema,
  GoalInferenceRequestSchema,
  GoalInferenceResultSchema,
  GoalSchema,
  ObservationIngestionResultSchema,
  ObservationRequestSchema,
} from "@continuity/contracts";
import { createInMemoryWorkflowService, type WorkflowService } from "../../services/workflow-service.js";

export function registerWorkflowRoutes(app: FastifyInstance, service: WorkflowService = createInMemoryWorkflowService()): void {
  app.post("/api/v1/observations", async (request, reply) => {
    const body = ObservationRequestSchema.parse(request.body);
    const result = await service.ingestObservations(body);
    return reply.status(201).send(ObservationIngestionResultSchema.parse(result));
  });

  app.post("/api/v1/goal-inferences", async (request) => {
    const body = GoalInferenceRequestSchema.parse(request.body);
    return GoalInferenceResultSchema.parse(await service.inferGoal(body));
  });

  app.post("/api/v1/goals/confirm", async (request, reply) => {
    const body = ConfirmGoalRequestSchema.parse(request.body);
    return reply.status(201).send(GoalSchema.parse(await service.confirmGoal(body)));
  });
}
