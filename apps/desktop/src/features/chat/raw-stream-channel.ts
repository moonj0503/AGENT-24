export type RawStreamEvent = {
  readonly occurredAt: string;
  readonly type: string;
  readonly payload: unknown;
};

export type RawStreamChannelMessage =
  | { readonly kind: "event"; readonly event: RawStreamEvent }
  | { readonly kind: "snapshot"; readonly events: readonly RawStreamEvent[] }
  | { readonly kind: "request_snapshot" }
  | { readonly kind: "clear" };

type Subscriber = (message: RawStreamChannelMessage) => void;
const subscribers = new Set<Subscriber>();
const channel = typeof BroadcastChannel === "undefined"
  ? undefined
  : new BroadcastChannel("continuity:raw-api-stream");

function deliver(message: RawStreamChannelMessage): void {
  subscribers.forEach((subscriber) => subscriber(message));
}

channel?.addEventListener("message", (event: MessageEvent<RawStreamChannelMessage>) => {
  deliver(event.data);
});

export function publishRawStreamMessage(message: RawStreamChannelMessage): void {
  deliver(message);
  channel?.postMessage(message);
}

export function subscribeToRawStream(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}
