import { createDatabase } from "@continuity/db";
import { buildApp } from "./app.js";
import { DrizzleWorkflowRepository } from "./repositories/drizzle-workflow-repository.js";
import { DrizzleIdempotencyStore } from "./repositories/drizzle-idempotency-store.js";
import { WorkflowService } from "./services/workflow-service.js";
import { FixtureGoalInterpreter } from "./agents/goal-interpreter/index.js";

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "127.0.0.1";
const { db } = createDatabase();
const app = buildApp({
  workflowService: new WorkflowService(new DrizzleWorkflowRepository(db), new FixtureGoalInterpreter()),
  idempotencyStore: new DrizzleIdempotencyStore(db),
});
await app.listen({ host, port });
