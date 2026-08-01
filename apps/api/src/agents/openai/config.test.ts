import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_MODELS,
  OpenAIConfigurationError,
  getAgentModelConfig,
  loadOpenAIConfig,
} from "./index.js";

const validEnvironment: NodeJS.ProcessEnv = {
  OPENAI_API_KEY: "unit-test-key",
  OPENAI_GOAL_MODEL: "goal-model",
  OPENAI_CONTINUITY_MODEL: "continuity-model",
  OPENAI_RECOVERY_MODEL: "recovery-model",
};

describe("loadOpenAIConfig", () => {
  it("returns fresh immutable configuration with trimmed environment values", () => {
    const environment: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: "  unit-test-key  ",
      OPENAI_GOAL_MODEL: "  goal-model  ",
      OPENAI_CONTINUITY_MODEL: "  continuity-model  ",
      OPENAI_RECOVERY_MODEL: "  recovery-model  ",
    };

    const first = loadOpenAIConfig(environment);
    const second = loadOpenAIConfig(environment);

    expect(first).toEqual({
      apiKey: "unit-test-key",
      goalModel: "goal-model",
      continuityModel: "continuity-model",
      recoveryModel: "recovery-model",
    });
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([undefined, "", "   "])("rejects a missing or blank API key", (apiKey) => {
    expect(() => loadOpenAIConfig({ ...validEnvironment, OPENAI_API_KEY: apiKey })).toThrow(
      OpenAIConfigurationError,
    );
  });

  it("uses centralized defaults for missing or blank model values", () => {
    const config = loadOpenAIConfig({
      OPENAI_API_KEY: "unit-test-key",
      OPENAI_GOAL_MODEL: "",
      OPENAI_CONTINUITY_MODEL: "   ",
    });

    expect(config).toMatchObject(DEFAULT_OPENAI_MODELS);
  });

  it("does not mutate the supplied environment or process.env", () => {
    const environment = { ...validEnvironment };
    const environmentSnapshot = { ...environment };
    const processGoalModel = process.env.OPENAI_GOAL_MODEL;

    loadOpenAIConfig(environment);

    expect(environment).toEqual(environmentSnapshot);
    expect(process.env.OPENAI_GOAL_MODEL).toBe(processGoalModel);
  });

  it("provides Agent model configuration without exposing the API key", () => {
    const models = getAgentModelConfig(loadOpenAIConfig(validEnvironment));

    expect(models).toEqual({
      goalModel: "goal-model",
      continuityModel: "continuity-model",
      recoveryModel: "recovery-model",
    });
    expect(models).not.toHaveProperty("apiKey");
    expect(Object.isFrozen(models)).toBe(true);
  });
});
