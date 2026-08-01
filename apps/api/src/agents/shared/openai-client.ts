export interface JsonSchemaDefinition {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface StructuredResponseRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly output: JsonSchemaDefinition;
}

export interface OpenAIClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export class OpenAIResponseError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OpenAIResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractOutputText(response: unknown): string {
  if (!isRecord(response)) throw new OpenAIResponseError("OpenAI returned an invalid response body.");
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) throw new OpenAIResponseError("OpenAI response contained no output.");

  for (const item of response.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (content.type === "refusal" && typeof content.refusal === "string") {
        throw new OpenAIResponseError(`OpenAI refused the request: ${content.refusal}`);
      }
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new OpenAIResponseError("OpenAI response contained no structured text output.");
}

export class OpenAIResponsesClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async createStructuredResponse(request: StructuredResponseRequest): Promise<unknown> {
    if (!this.apiKey) throw new OpenAIResponseError("OPENAI_API_KEY is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          store: false,
          text: { format: { type: "json_schema", name: request.output.name, strict: true, schema: request.output.schema } },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new OpenAIResponseError(`OpenAI request failed with status ${response.status}.`, response.status);
      const text = extractOutputText(await response.json());
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new OpenAIResponseError("OpenAI structured output was not valid JSON.");
      }
    } catch (error) {
      if (error instanceof OpenAIResponseError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new OpenAIResponseError("OpenAI request timed out.");
      throw new OpenAIResponseError(error instanceof Error ? error.message : "OpenAI request failed.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const openAIClient = new OpenAIResponsesClient();
