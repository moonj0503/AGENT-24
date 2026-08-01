import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@continuity/contracts";
import { boundedObservationQueue, isApplicationBlocked, observationBatchKey } from "./queue";

function event(eventId: string, occurredAt: string, application = "Writer"): ActivityEvent { return { eventId, occurredAt, type: "ACTIVE_WINDOW_CHANGED", application: { name: application, category: "DOCUMENT" }, metadata: { idleSeconds: 0 } }; }
describe("durable observation queue", () => {
  it("deduplicates and trims oldest events by count and age", () => {
    const now = Date.parse("2026-08-08T00:00:00.000Z");
    const result = boundedObservationQueue([event("old", "2026-07-31T00:00:00.000Z"), event("a", "2026-08-07T00:00:00.000Z"), event("a", "2026-08-07T00:00:00.000Z"), event("b", "2026-08-08T00:00:00.000Z")], now, { maximumEvents: 1, maximumAgeMs: 7 * 86_400_000 });
    expect(result.events.map(({ eventId }) => eventId)).toEqual(["b"]);
    expect(result.trimmed).toBe(true);
  });
  it("blocks normalized application identifiers before queueing", () => {
    expect(isApplicationBlocked(event("a", "2026-08-01T00:00:00.000Z", " Secret App "), ["secret app"])).toBe(true);
  });
  it("creates stable batch keys without sensitive payloads", async () => {
    expect(await observationBatchKey("session", ["b", "a"])).toBe(await observationBatchKey("session", ["a", "b"]));
    expect(await observationBatchKey("session", ["a"])).not.toBe(await observationBatchKey("session", ["b"]));
  });
});
