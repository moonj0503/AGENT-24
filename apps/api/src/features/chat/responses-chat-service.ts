import OpenAI from "openai";

export interface RawStreamEvent {
  readonly occurredAt: string;
  readonly type: string;
  readonly payload: unknown;
}

export interface ResponsesChatService {
  stream(message: string, emit: (event: RawStreamEvent) => void): Promise<void>;
}

type StreamEvent = {
  readonly type?: string;
  readonly name?: string;
  readonly call_id?: string;
  readonly arguments?: string;
  readonly response?: { readonly id?: string };
};

type FunctionCall = Required<Pick<StreamEvent, "name" | "call_id" | "arguments">>;

const weatherTool = {
  type: "function" as const,
  name: "get_weather",
  description: "Get the current weather for a city. Use this when the user asks about weather.",
  parameters: {
    type: "object",
    properties: { location: { type: "string", description: "City or region to look up" } },
    required: ["location"],
    additionalProperties: false,
  },
  strict: true,
};

function now(): string { return new Date().toISOString(); }

function eventType(event: unknown): string {
  const record = event as StreamEvent;
  return typeof record.type === "string" ? record.type : "error";
}

function weatherResult(argumentsJson: string): Record<string, unknown> {
  const args = JSON.parse(argumentsJson) as { location?: unknown };
  if (typeof args.location !== "string" || !args.location.trim()) throw new Error("location must be a non-empty string");
  return { location: args.location.trim(), temperature_celsius: 22, condition: "clear", source: "demo server-side weather tool" };
}

export class OpenAIResponsesChatService implements ResponsesChatService {
  constructor(private readonly client: Pick<OpenAI, "responses">, private readonly model: string) {}

  async stream(message: string, emit: (event: RawStreamEvent) => void): Promise<void> {
    let input: string | Array<{ type: "function_call_output"; call_id: string; output: string }> = message;
    let previousResponseId: string | undefined;
    for (;;) {
      const stream = await this.client.responses.create({ model: this.model, input, previous_response_id: previousResponseId, tools: [weatherTool], stream: true, store: false });
      const calls: FunctionCall[] = [];
      let completedResponseId: string | undefined;
      for await (const event of stream as AsyncIterable<unknown>) {
        emit({ occurredAt: now(), type: eventType(event), payload: event });
        const record = event as StreamEvent;
        if (record.type === "response.function_call_arguments.done" && record.name && record.call_id && record.arguments) calls.push({ name: record.name, call_id: record.call_id, arguments: record.arguments });
        if (record.type === "response.completed") completedResponseId = record.response?.id;
      }
      if (calls.length === 0) return;
      previousResponseId = completedResponseId;
      input = calls.map((call) => {
        emit({ occurredAt: now(), type: "tool_call", payload: call });
        try {
          if (call.name !== "get_weather") throw new Error(`Unsupported tool: ${call.name}`);
          const result = weatherResult(call.arguments);
          emit({ occurredAt: now(), type: "tool_result", payload: { call_id: call.call_id, output: result } });
          return { type: "function_call_output" as const, call_id: call.call_id, output: JSON.stringify(result) };
        } catch (error) {
          const result = { error: error instanceof Error ? error.message : String(error) };
          emit({ occurredAt: now(), type: "tool_result", payload: { call_id: call.call_id, output: result } });
          return { type: "function_call_output" as const, call_id: call.call_id, output: JSON.stringify(result) };
        }
      });
    }
  }
}
