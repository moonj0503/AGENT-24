import Fastify from "fastify";
import { registerErrorHandler } from "./plugins/error-handler.js";

export function buildApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get("/api/v1/health", async () => ({ status: "ok" }));
  return app;
}
