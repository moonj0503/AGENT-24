import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabase } from "@continuity/db";
import { buildApp } from "./app.js";
import { createApplicationDependencies } from "./application-composition.js";
import { DrizzleWorkflowRepository } from "./repositories/drizzle-workflow-repository.js";
import { DrizzleIdempotencyStore } from "./repositories/drizzle-idempotency-store.js";

export async function startServer(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const port = Number(environment.API_PORT ?? 4000);
  const host = environment.API_HOST ?? "127.0.0.1";
  const { db } = createDatabase(environment.DATABASE_URL);
  const dependencies = createApplicationDependencies(environment, {
    workflowRepository: new DrizzleWorkflowRepository(db),
  });
  const app = buildApp({
    workflowService: dependencies.workflowService,
    gapLifecycleService: dependencies.gapLifecycleService,
    gapRecoveryService: dependencies.gapRecoveryService,
    eventBus: dependencies.eventBus,
    idempotencyStore: new DrizzleIdempotencyStore(db),
  });
  await app.listen({ host, port });
}

function isMainModule(moduleUrl: string, entryPath: string | undefined): boolean {
  return entryPath !== undefined && moduleUrl === pathToFileURL(resolve(entryPath)).href;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await startServer();
}
