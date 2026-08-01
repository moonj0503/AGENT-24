import { afterEach, expect, it, vi } from "vitest";
import { fetchGapArtifacts, updateArtifact } from "./api";

const artifact = { artifactId: "artifact-1", gapId: "gap-1", actionId: "action-1", type: "TODO", title: "Plan", content: "Draft", status: "ACTIVE", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" };
afterEach(() => vi.restoreAllMocks());

it("validates artifact list and update responses", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [artifact] }), { status: 200, headers: { "content-type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...artifact, content: "Edited" }), { status: 200, headers: { "content-type": "application/json" } }));
  await expect(fetchGapArtifacts("gap-1")).resolves.toHaveLength(1);
  await expect(updateArtifact("artifact-1", { content: "Edited" })).resolves.toMatchObject({ content: "Edited" });
  expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PATCH");
});
