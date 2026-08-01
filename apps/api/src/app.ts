import Fastify from "fastify";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerIdempotency } from "./plugins/idempotency.js";
import { registerWorkflowRoutes } from "./features/workflow/routes.js";
import { createInMemoryWorkflowService, type WorkflowService } from "./services/workflow-service.js";
import type { IdempotencyRepository } from "./repositories/idempotency-repository.js";

export interface AppDependencies {
  workflowService?: WorkflowService;
  idempotencyStore?: IdempotencyRepository;
}

export function buildApp(dependencies: AppDependencies = {}) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerIdempotency(app, dependencies.idempotencyStore);
  app.get("/api/v1/health", async () => ({ status: "ok" }));
  registerWorkflowRoutes(app, dependencies.workflowService ?? createInMemoryWorkflowService());
  return app;
}
