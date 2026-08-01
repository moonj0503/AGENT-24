import type { FastifyInstance } from "fastify";
import { createOpenAIClient } from "../../agents/openai/index.js";
import { OpenAIResponsesChatService, type ResponsesChatService, type RawStreamEvent } from "./responses-chat-service.js";

function writeSse(response: NodeJS.WritableStream, event: RawStreamEvent): void {
  response.write("event: raw\n");
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerChatRoutes(app: FastifyInstance, service?: ResponsesChatService): void {
  app.post<{ Body: { message?: unknown } }>("/api/v1/chat/stream", async (request, reply) => {
    const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
    if (!message) return reply.code(400).send({ message: "message is required" });
    const chat = service ?? new OpenAIResponsesChatService(
      createOpenAIClient({
        apiKey: process.env.OPENAI_API_KEY ?? "",
        recoveryModel: "gpt-5-mini",
        goalModel: "gpt-5-mini",
        continuityModel: "gpt-5-mini",
      }),
      process.env.OPENAI_CHAT_MODEL ?? "gpt-5-mini",
    );

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    reply.hijack();
    try {
      await chat.stream(message, (event) => writeSse(reply.raw, event));
      reply.raw.write("event: done\ndata: {}\n\n");
    } catch (error) {
      writeSse(reply.raw, { occurredAt: new Date().toISOString(), type: "error", payload: error instanceof Error ? { name: error.name, message: error.message } : error });
    } finally {
      reply.raw.end();
    }
  });
}
