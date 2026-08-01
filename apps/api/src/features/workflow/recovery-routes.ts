import type { FastifyInstance } from "fastify";
import {
  RunGapRecoveryParamsSchema,
  RunGapRecoveryRequestSchema,
  RunGapRecoveryResponseSchema,
} from "@continuity/contracts";
import type { GapRecoveryService } from "../../services/gap-recovery-service.js";

export function registerRecoveryRoutes(
  app: FastifyInstance,
  service: GapRecoveryService,
): void {
  app.post("/api/v1/gaps/:gapId/run", async (request) => {
    const params = RunGapRecoveryParamsSchema.parse(request.params);
    const body = RunGapRecoveryRequestSchema.parse(request.body);
    return RunGapRecoveryResponseSchema.parse(await service.run(params, body));
  });
}
