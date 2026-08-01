import { expect, it } from "vitest";
import { InMemoryAgentEventBus } from "../src/features/workflow/event-bus.js";

it("replays only events after Last-Event-ID and streams later events", () => {
  const events = new InMemoryAgentEventBus();
  events.publish({
    eventId: "event-001",
    type: "GOAL_INFERRED",
    occurredAt: "2026-08-02T12:00:00.000Z",
    payload: {},
  });
  events.publish({
    eventId: "event-002",
    type: "GAP_STARTED",
    gapId: "gap-001",
    occurredAt: "2026-08-02T12:01:00.000Z",
    payload: {},
  });

  const received: number[] = [];
  const unsubscribe = events.subscribe(1, (record) => received.push(record.sequence));
  events.publish({
    eventId: "event-003",
    type: "RECOVERY_READY",
    gapId: "gap-001",
    occurredAt: "2026-08-02T12:02:00.000Z",
    payload: {},
  });
  unsubscribe();

  expect(received).toEqual([2, 3]);
});
