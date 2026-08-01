import type { FastifyInstance } from "fastify";
import {
  GapActionsResponseSchema,
  GapHistoryDetailSchema,
  GapHistoryListResponseSchema,
  GapHistoryParamsSchema,
  GapHistoryQuerySchema,
  RecoveryBriefSchema,
} from "@continuity/contracts";
import type { GapHistoryService } from "../../services/gap-history-service.js";

export function registerHistoryRoutes(app: FastifyInstance, service: GapHistoryService): void {
  app.get("/api/v1/gaps", async (request) => {
    const query = GapHistoryQuerySchema.parse(request.query);
    return GapHistoryListResponseSchema.parse(await service.list(query));
  });

  app.get("/api/v1/gaps/:gapId", async (request) => {
    const params = GapHistoryParamsSchema.parse(request.params);
    return GapHistoryDetailSchema.parse(await service.getDetail(params.gapId));
  });

  app.get("/api/v1/gaps/:gapId/recovery-brief", async (request) => {
    const params = GapHistoryParamsSchema.parse(request.params);
    return RecoveryBriefSchema.parse(await service.getRecoveryBrief(params.gapId));
  });

  app.get("/api/v1/gaps/:gapId/actions", async (request) => {
    const params = GapHistoryParamsSchema.parse(request.params);
    return GapActionsResponseSchema.parse(await service.listActions(params.gapId));
  });
}
