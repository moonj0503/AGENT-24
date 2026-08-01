import type { RawStreamChannelMessage, RawStreamEvent } from "./raw-stream-channel.js";

export function applyRawStreamMessage(
  events: readonly RawStreamEvent[],
  message: RawStreamChannelMessage,
): RawStreamEvent[] {
  if (message.kind === "event") return [...events, message.event];
  if (message.kind === "snapshot") return [...message.events];
  if (message.kind === "clear") return [];
  return [...events];
}
