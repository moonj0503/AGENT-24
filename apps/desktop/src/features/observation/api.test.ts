import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@continuity/contracts";
import { uploadObservations } from "./api";

const event: ActivityEvent = { eventId: "event-1", type: "ACTIVE_WINDOW_CHANGED", occurredAt: "2026-08-01T00:00:00.000Z", application: { name: "Writer", category: "DOCUMENT" }, metadata: { idleSeconds: 0 } };
afterEach(() => vi.unstubAllGlobals());
describe("observation upload", () => {
  it("reuses the same idempotency key for the same batch", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ workSessionId: "session", acceptedEventIds: ["event-1"] }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadObservations("session", [event]);
    await uploadObservations("session", [event]);
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders["idempotency-key"]).toBe(secondHeaders["idempotency-key"]);
  });
});
