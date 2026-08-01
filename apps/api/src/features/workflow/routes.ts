import type { FastifyInstance } from "fastify";
import {
  ConfirmGoalRequestSchema,
  GoalInferenceRequestSchema,
  GoalInferenceResultSchema,
  GoalSchema,
  ObservationIngestionResultSchema,
  ObservationRequestSchema,
} from "@continuity/contracts";
import { InMemoryWorkflowStore } from "./in-memory-workflow-store.js";

export function registerWorkflowRoutes(app: FastifyInstance, store = new InMemoryWorkflowStore()): void {
  app.post("/api/v1/observations", async (request, reply) => {
    const body = ObservationRequestSchema.parse(request.body);
    const result = store.ingestObservations(body);
    return reply.status(201).send(ObservationIngestionResultSchema.parse(result));
  });

  app.post("/api/v1/goal-inferences", async (request) => {
    const body = GoalInferenceRequestSchema.parse(request.body);
    return GoalInferenceResultSchema.parse(await store.inferGoal(body));
  });

  app.post("/api/v1/goals/confirm", async (request, reply) => {
    const body = ConfirmGoalRequestSchema.parse(request.body);
    return reply.status(201).send(GoalSchema.parse(store.confirmGoal(body)));
  });
}
