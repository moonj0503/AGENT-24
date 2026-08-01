import OpenAI from "openai";
import type {
  OpenAIClient,
  OpenAIClientConstructor,
  OpenAIClientFactory,
  OpenAIConfig,
} from "./types.js";

export class OpenAIClientInitializationError extends Error {
  constructor() {
    super("The OpenAI client could not be initialized.");
    this.name = "OpenAIClientInitializationError";
  }
}

export class DefaultOpenAIClientFactory implements OpenAIClientFactory {
  constructor(private readonly Client: OpenAIClientConstructor = OpenAI) {}

  create(config: OpenAIConfig): OpenAIClient {
    try {
      return new this.Client({ apiKey: config.apiKey });
    } catch {
      throw new OpenAIClientInitializationError();
    }
  }
}

export function createOpenAIClient(
  config: OpenAIConfig,
  factory: OpenAIClientFactory = new DefaultOpenAIClientFactory(),
): OpenAIClient {
  return factory.create(config);
}
