import type { FastifyInstance } from "fastify";
import {
  ActionApprovalParamsSchema,
  ActionApprovalRequestSchema,
  CheckpointSchema,
  CreateCheckpointRequestSchema,
  EndGapParamsSchema,
  EndGapRequestSchema,
  EndGapResponseSchema,
  PlannedActionSchema,
  StartGapRequestSchema,
  StartGapResponseSchema,
} from "@continuity/contracts";
import type { GapLifecycleService } from "../../services/gap-lifecycle-service.js";

export function registerLifecycleRoutes(app: FastifyInstance, service: GapLifecycleService): void {
  app.post("/api/v1/checkpoints", async (request, reply) => {
    const body = CreateCheckpointRequestSchema.parse(request.body);
    return reply.status(201).send(CheckpointSchema.parse(await service.createCheckpoint(body)));
  });

  app.post("/api/v1/gaps", async (request, reply) => {
    const body = StartGapRequestSchema.parse(request.body);
    return reply.status(201).send(StartGapResponseSchema.parse(await service.startGap(body)));
  });

  app.post("/api/v1/gaps/:gapId/actions/:actionId/approval", async (request) => {
    const params = ActionApprovalParamsSchema.parse(request.params);
    const body = ActionApprovalRequestSchema.parse(request.body);
    return PlannedActionSchema.parse(await service.decideAction(params, body));
  });

  app.post("/api/v1/gaps/:gapId/end", async (request) => {
    const params = EndGapParamsSchema.parse(request.params);
    const body = EndGapRequestSchema.parse(request.body);
    return EndGapResponseSchema.parse(await service.endGap(params, body));
  });
}
