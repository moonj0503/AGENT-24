import { describe, expect, it } from "vitest";
import { ArtifactSchema, GapSessionSchema } from "@continuity/contracts";
import { buildApp } from "../src/app.js";
import { InMemoryWorkflowRepository } from "../src/repositories/in-memory-workflow-repository.js";
import { GapHistoryService } from "../src/services/gap-history-service.js";

const gap = GapSessionSchema.parse({ gapId: "gap-artifact", workSessionId: "ws", goalId: "goal", checkpointId: "checkpoint", status: "COMPLETED", startedAt: "2026-08-02T00:00:00.000Z", endedAt: "2026-08-02T00:01:00.000Z" });
const artifact = ArtifactSchema.parse({ artifactId: "artifact-1", gapId: gap.gapId, actionId: "action-1", type: "TODO", title: "Plan", content: "Original", status: "ACTIVE", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" });

describe("artifact routes", () => {
  it("lists, edits, and discards persisted artifacts", async () => {
    const repository = new InMemoryWorkflowRepository({ gapSessions: [gap] });
    await repository.saveArtifacts([artifact]);
    const app = buildApp({ gapHistoryService: new GapHistoryService(repository) });
    const list = await app.inject({ method: "GET", url: `/api/v1/gaps/${gap.gapId}/artifacts` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ artifacts: [{ artifactId: artifact.artifactId, content: "Original" }] });
    const update = await app.inject({ method: "PATCH", url: `/api/v1/artifacts/${artifact.artifactId}`, headers: { "idempotency-key": "artifact-update" }, payload: { content: "Edited", status: "DISCARDED" } });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ content: "Edited", status: "DISCARDED" });
    await app.close();
  });
});
