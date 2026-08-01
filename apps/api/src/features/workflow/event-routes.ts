import type { FastifyInstance } from "fastify";
import type { ServerResponse } from "node:http";
import type { InMemoryAgentEventBus, SequencedAgentEvent } from "./event-bus.js";

function writeEvent(response: ServerResponse, record: SequencedAgentEvent): void {
  response.write(`id: ${record.sequence}\n`);
  response.write(`event: ${record.event.type}\n`);
  response.write(`data: ${JSON.stringify(record.event)}\n\n`);
}

export function registerEventRoutes(app: FastifyInstance, eventBus: InMemoryAgentEventBus): void {
  app.get("/api/v1/events", (request, reply) => {
    const rawLastEventId = request.headers["last-event-id"];
    const parsedLastEventId = typeof rawLastEventId === "string" ? Number(rawLastEventId) : 0;
    const lastEventId = Number.isSafeInteger(parsedLastEventId) && parsedLastEventId >= 0
      ? parsedLastEventId
      : 0;

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    const unsubscribe = eventBus.subscribe(lastEventId, (record) => writeEvent(reply.raw, record));
    request.raw.once("close", unsubscribe);
    reply.hijack();
  });
}
