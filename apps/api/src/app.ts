import Fastify from "fastify";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerIdempotency } from "./plugins/idempotency.js";
import { registerWorkflowRoutes } from "./features/workflow/routes.js";

export function buildApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerIdempotency(app);
  app.get("/api/v1/health", async () => ({ status: "ok" }));
  registerWorkflowRoutes(app);
  return app;
}
