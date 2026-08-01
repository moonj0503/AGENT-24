import type { AgentModelConfig, OpenAIConfig } from "./types.js";

export const DEFAULT_OPENAI_MODELS = Object.freeze({
  goalModel: "gpt-5-mini",
  continuityModel: "gpt-5.1",
  recoveryModel: "gpt-5-mini",
} satisfies AgentModelConfig);

export class OpenAIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIConfigurationError";
  }
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

export function loadOpenAIConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAIConfig {
  const apiKey = trimmed(environment.OPENAI_API_KEY);
  if (!apiKey) {
    throw new OpenAIConfigurationError("OPENAI_API_KEY is required to create a real OpenAI client.");
  }

  return Object.freeze({
    apiKey,
    goalModel: trimmed(environment.OPENAI_GOAL_MODEL) ?? DEFAULT_OPENAI_MODELS.goalModel,
    continuityModel:
      trimmed(environment.OPENAI_CONTINUITY_MODEL) ?? DEFAULT_OPENAI_MODELS.continuityModel,
    recoveryModel: trimmed(environment.OPENAI_RECOVERY_MODEL) ?? DEFAULT_OPENAI_MODELS.recoveryModel,
  });
}

export function getAgentModelConfig(config: OpenAIConfig): AgentModelConfig {
  return Object.freeze({
    goalModel: config.goalModel,
    continuityModel: config.continuityModel,
    recoveryModel: config.recoveryModel,
  });
}
