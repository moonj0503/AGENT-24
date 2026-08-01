import { afterEach, expect, it } from "vitest";
import {
  publishRawStreamMessage,
  subscribeToRawStream,
  type RawStreamChannelMessage,
} from "./raw-stream-channel.js";

const sampleEvent = {
  occurredAt: "2026-08-02T00:00:00.000Z",
  type: "response.created",
  payload: { id: "resp-test" },
};

afterEach(() => {
  publishRawStreamMessage({ kind: "clear" });
});

it("delivers published raw events to a subscriber", () => {
  const received: RawStreamChannelMessage[] = [];
  const unsubscribe = subscribeToRawStream((message) => received.push(message));

  publishRawStreamMessage({ kind: "event", event: sampleEvent });

  expect(received).toEqual([{ kind: "event", event: sampleEvent }]);
  unsubscribe();
});
