import Fastify from "fastify";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerIdempotency } from "./plugins/idempotency.js";
import { registerWorkflowRoutes } from "./features/workflow/routes.js";
import { createInMemoryWorkflowService, type WorkflowService } from "./services/workflow-service.js";
import type { IdempotencyRepository } from "./repositories/idempotency-repository.js";
import { registerRecoveryRoutes } from "./features/workflow/recovery-routes.js";
import type { GapRecoveryService } from "./services/gap-recovery-service.js";
import { registerLifecycleRoutes } from "./features/workflow/lifecycle-routes.js";
import type { GapLifecycleService } from "./services/gap-lifecycle-service.js";
import { InMemoryAgentEventBus } from "./features/workflow/event-bus.js";
import { registerEventRoutes } from "./features/workflow/event-routes.js";

export interface AppDependencies {
  workflowService?: WorkflowService;
  idempotencyStore?: IdempotencyRepository;
  gapRecoveryService?: GapRecoveryService;
  gapLifecycleService?: GapLifecycleService;
  eventBus?: InMemoryAgentEventBus;
}

export function buildApp(dependencies: AppDependencies = {}) {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header("access-control-allow-headers", "content-type,idempotency-key");
      reply.header("vary", "Origin");
    }
    if (request.method === "OPTIONS") return reply.status(204).send();
  });
  const eventBus = dependencies.eventBus ?? new InMemoryAgentEventBus();
  registerErrorHandler(app);
  registerIdempotency(app, dependencies.idempotencyStore);
  app.get("/api/v1/health", async () => ({ status: "ok" }));
  registerWorkflowRoutes(app, dependencies.workflowService ?? createInMemoryWorkflowService(undefined, eventBus));
  registerEventRoutes(app, eventBus);
  if (dependencies.gapLifecycleService) {
    registerLifecycleRoutes(app, dependencies.gapLifecycleService);
  }
  if (dependencies.gapRecoveryService) {
    registerRecoveryRoutes(app, dependencies.gapRecoveryService);
  }
  return app;
}
