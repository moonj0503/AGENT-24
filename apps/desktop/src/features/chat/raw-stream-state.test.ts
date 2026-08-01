import { expect, it } from "vitest";
import { applyRawStreamMessage } from "./raw-stream-state.js";

const event = {
  occurredAt: "2026-08-02T00:00:00.000Z",
  type: "response.created",
  payload: { id: "resp-test" },
};

it("replaces events from a snapshot and clears on a clear message", () => {
  const fromSnapshot = applyRawStreamMessage([], { kind: "snapshot", events: [event] });
  expect(fromSnapshot).toEqual([event]);

  expect(applyRawStreamMessage(fromSnapshot, { kind: "clear" })).toEqual([]);
});
