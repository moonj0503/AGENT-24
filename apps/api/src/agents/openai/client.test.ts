import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  OpenAIClient,
  OpenAIClientConstructor,
  OpenAIClientFactory,
  OpenAIConfig,
} from "./types.js";

const config: OpenAIConfig = Object.freeze({
  apiKey: "unit-test-key",
  goalModel: "goal-model",
  continuityModel: "continuity-model",
  recoveryModel: "recovery-model",
});

afterEach(() => {
  vi.doUnmock("openai");
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("OpenAI client foundation", () => {
  it("creates the official client lazily with the configured API key and no request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { createOpenAIClient } = await import("./client.js");

    const client = createOpenAIClient(config);

    expect(client.apiKey).toBe(config.apiKey);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts an injectable client factory", async () => {
    const fakeClient = Object.create(null) as OpenAIClient;
    const factory: OpenAIClientFactory = { create: vi.fn(() => fakeClient) };
    const { createOpenAIClient } = await import("./client.js");

    expect(createOpenAIClient(config, factory)).toBe(fakeClient);
    expect(factory.create).toHaveBeenCalledOnce();
    expect(factory.create).toHaveBeenCalledWith(config);
  });

  it("sanitizes initialization errors so constructor messages cannot expose the key", async () => {
    const secret = "sensitive-unit-test-value";
    class ThrowingClient {
      constructor() {
        throw new Error(`Constructor received ${secret}`);
      }
    }
    const { DefaultOpenAIClientFactory, OpenAIClientInitializationError } =
      await import("./client.js");
    const factory = new DefaultOpenAIClientFactory(
      ThrowingClient as unknown as OpenAIClientConstructor,
    );

    let thrown: unknown;
    try {
      factory.create({ ...config, apiKey: secret });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAIClientInitializationError);
    expect(String(thrown)).not.toContain(secret);
    expect(thrown).not.toHaveProperty("cause");
  });

  it("imports without an API key and does not instantiate the SDK client", async () => {
    const constructorSpy = vi.fn();
    vi.doMock("openai", () => ({ default: constructorSpy }));

    await expect(import("./index.js")).resolves.toBeDefined();

    expect(constructorSpy).not.toHaveBeenCalled();
  });
});
