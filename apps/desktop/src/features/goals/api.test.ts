import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@continuity/contracts";
import { fetchGoalInference } from "./api";

const event: ActivityEvent = {
  eventId: "event-1",
  type: "ACTIVE_WINDOW_CHANGED",
  occurredAt: "2026-08-01T09:00:00.000Z",
  application: { name: "Microsoft Word", category: "DOCUMENT" },
  resource: { title: "Report.docx", kind: "DOCUMENT" },
  metadata: { idleSeconds: 0 },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("fetchGoalInference", () => {
  const previousWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = previousWindow;
    vi.unstubAllGlobals();
  });

  it("ingests observed events before requesting a goal inference", async () => {
    globalThis.window = { __TAURI__: { core: { invoke: vi.fn().mockResolvedValue([event]) } } } as unknown as Window;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ workSessionId: "work-1", acceptedEventIds: ["event-1"] }))
      .mockResolvedValueOnce(jsonResponse({ inferenceId: "inf-1", requiresConfirmation: true, inferenceSummary: "Writing", candidates: [{ candidateId: "goal-1", title: "Write report", description: "Finish report", confidence: 0.9, evidence: [{ type: "RESOURCE", description: "Report.docx" }], suggestedGoalPath: ["Report"] }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGoalInference("work-1")).resolves.toMatchObject({ inferenceId: "inf-1" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/v1/observations", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/v1/goal-inferences", expect.anything());
  });
});
