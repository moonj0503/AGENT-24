import type OpenAI from "openai";
import type { ClientOptions } from "openai";

export interface AgentModelConfig {
  readonly goalModel: string;
  readonly continuityModel: string;
  readonly recoveryModel: string;
}

export interface OpenAIConfig extends AgentModelConfig {
  readonly apiKey: string;
}

export type OpenAIClient = OpenAI;

export type OpenAIClientConstructor = new (options: ClientOptions) => OpenAIClient;

export interface OpenAIClientFactory {
  create(config: OpenAIConfig): OpenAIClient;
}
