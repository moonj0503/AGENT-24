import { describe, expect, it, vi } from "vitest";
import { GoalInferenceResultSchema, type GoalInferenceResult } from "@continuity/contracts";
import type { OpenAIClient, OpenAIConfig } from "../openai/index.js";
import {
  GoalInterpreterEmptyResponseError,
  GoalInterpreterRequestError,
  GoalInterpreterStructuredOutputError,
  OpenAIGoalInterpreter,
  OpenAIResponsesGoalInferenceModel,
  createOpenAIGoalInterpreter,
  type GoalInferenceModel,
} from "./openai-goal-interpreter.js";
import { GoalInterpreterValidationError } from "./fixture-goal-interpreter.js";
import { GOAL_INTERPRETER_INSTRUCTIONS } from "./prompt.js";
import type { SanitizedGoalContext } from "./types.js";

const input: SanitizedGoalContext = {
  workSessionId: "ws-openai-test",
  events: [
    {
      eventId: "evt-001",
      type: "DOCUMENT_SAVED",
      occurredAt: "2026-08-01T09:00:00.000Z",
      application: { name: "Writer", category: "DOCUMENT" },
      resource: { title: "Project report", kind: "DOCUMENT" },
      metadata: { idleSeconds: 0 },
    },
    {
      eventId: "evt-002",
      type: "BROWSER_TAB_CHANGED",
      occurredAt: "2026-08-01T09:01:00.000Z",
      application: { name: "Browser", category: "BROWSER" },
      resource: { title: "QR factorization notes", kind: "WEB_PAGE" },
      metadata: { idleSeconds: 0 },
    },
  ],
};

const candidates: GoalInferenceResult["candidates"] = [
  {
    candidateId: "candidate-001",
    title: "Continue the project report",
    description: "The user may be drafting a report section.",
    confidence: 0.86,
    evidence: [
      { type: "RESOURCE", description: "Project report was saved." },
      { type: "ACTIVITY_SEQUENCE", description: "A related reference followed the save." },
    ],
    suggestedGoalPath: ["Final Project", "Report Writing"],
  },
  {
    candidateId: "candidate-002",
    title: "Review factorization material",
    description: "The user may be reviewing supporting material.",
    confidence: 0.55,
    evidence: [{ type: "RESOURCE", description: "QR factorization notes were viewed." }],
    suggestedGoalPath: ["Final Project", "Research"],
  },
];

function validResult(count = 2): GoalInferenceResult {
  const selected = Array.from({ length: count }, (_, index) => ({
    ...candidates[index % candidates.length]!,
    candidateId: `candidate-${String(index + 1).padStart(3, "0")}`,
  }));
  return {
    inferenceId: "inference-001",
    candidates: selected,
    requiresConfirmation: true,
    inferenceSummary: "Report-related work may be in progress.",
  };
}

function mockModel(output: unknown): GoalInferenceModel & { generate: ReturnType<typeof vi.fn> } {
  return { generate: vi.fn().mockResolvedValue(output) };
}

const unusedClient = {} as OpenAIClient;

describe("OpenAIGoalInterpreter", () => {
  it("sends only serialized sanitized context with the configured goal model", async () => {
    const inferenceModel = mockModel(validResult());
    const interpreter = new OpenAIGoalInterpreter(unusedClient, "configured-goal-model", inferenceModel);

    await interpreter.run(input);

    expect(inferenceModel.generate).toHaveBeenCalledWith({
      model: "configured-goal-model",
      instructions: GOAL_INTERPRETER_INSTRUCTIONS,
      input: JSON.stringify({ workSessionId: input.workSessionId, events: input.events }),
    });
    expect(JSON.stringify(inferenceModel.generate.mock.calls)).not.toContain("OPENAI_API_KEY");
    expect(GOAL_INTERPRETER_INSTRUCTIONS).toContain("never confirmed intent");
    expect(GOAL_INTERPRETER_INSTRUCTIONS).toContain("Do not infer sensitive personal information");
  });

  it("returns contract-valid candidates without reordering evidence or goal paths", async () => {
    const expected = validResult();
    const result = await new OpenAIGoalInterpreter(
      unusedClient,
      "goal-model",
      mockModel(expected),
    ).run(input);

    expect(GoalInferenceResultSchema.parse(result)).toEqual(expected);
    expect(result.candidates.map(({ candidateId }) => candidateId)).toEqual([
      "candidate-001",
      "candidate-002",
    ]);
    expect(result.candidates[0]?.evidence).toEqual(expected.candidates[0]?.evidence);
    expect(result.candidates[0]?.suggestedGoalPath).toEqual(["Final Project", "Report Writing"]);
  });

  it.each([1, 2, 3])("accepts %i ranked candidate(s)", async (count) => {
    const result = await new OpenAIGoalInterpreter(
      unusedClient,
      "goal-model",
      mockModel(validResult(count)),
    ).run(input);
    expect(result.candidates).toHaveLength(count);
  });

  it.each([0, 4])("rejects %i candidates", async (count) => {
    const invalid = { ...validResult(), candidates: validResult(count).candidates };
    await expect(
      new OpenAIGoalInterpreter(unusedClient, "goal-model", mockModel(invalid)).run(input),
    ).rejects.toBeInstanceOf(GoalInterpreterValidationError);
  });

  it("rejects malformed structured output and a result that claims no confirmation is needed", async () => {
    const malformed = { inferenceId: "inference-001", candidates: [{}] };
    await expect(
      new OpenAIGoalInterpreter(unusedClient, "goal-model", mockModel(malformed)).run(input),
    ).rejects.toBeInstanceOf(GoalInterpreterValidationError);

    await expect(
      new OpenAIGoalInterpreter(
        unusedClient,
        "goal-model",
        mockModel({ ...validResult(), requiresConfirmation: false }),
      ).run(input),
    ).rejects.toThrow("must require user confirmation");
  });

  it("rejects output with a missing required field", async () => {
    const { inferenceSummary: _missing, ...incomplete } = validResult();
    await expect(
      new OpenAIGoalInterpreter(unusedClient, "goal-model", mockModel(incomplete)).run(input),
    ).rejects.toBeInstanceOf(GoalInterpreterValidationError);
  });

  it.each([null, undefined, ""])('rejects empty structured output: %j', async (output) => {
    await expect(
      new OpenAIGoalInterpreter(unusedClient, "goal-model", mockModel(output)).run(input),
    ).rejects.toBeInstanceOf(GoalInterpreterEmptyResponseError);
  });

  it("sanitizes unexpected provider failures", async () => {
    const inferenceModel: GoalInferenceModel = {
      generate: vi.fn().mockRejectedValue(new Error("secret-key-and-provider-payload")),
    };
    const promise = new OpenAIGoalInterpreter(unusedClient, "goal-model", inferenceModel).run(input);

    await expect(promise).rejects.toBeInstanceOf(GoalInterpreterRequestError);
    await expect(promise).rejects.not.toThrow("secret-key-and-provider-payload");
  });

  it("preserves identifiable structured-output failures", async () => {
    const inferenceModel: GoalInferenceModel = {
      generate: vi.fn().mockRejectedValue(new GoalInterpreterStructuredOutputError()),
    };
    await expect(
      new OpenAIGoalInterpreter(unusedClient, "goal-model", inferenceModel).run(input),
    ).rejects.toBeInstanceOf(GoalInterpreterStructuredOutputError);
  });

  it("does not mutate input and produces equivalent results for equivalent model output", async () => {
    const before = structuredClone(input);
    const interpreter = new OpenAIGoalInterpreter(unusedClient, "goal-model", mockModel(validResult()));

    expect(await interpreter.run(input)).toEqual(await interpreter.run(input));
    expect(input).toEqual(before);
  });

  it("can be imported without OPENAI_API_KEY", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    try {
      await expect(import("./index.js")).resolves.toHaveProperty("OpenAIGoalInterpreter");
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });
});

describe("OpenAIResponsesGoalInferenceModel", () => {
  it("uses Responses structured parsing without making a real network call", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: validResult() });
    const client = { responses: { parse } } as unknown as OpenAIClient;

    expect(
      await new OpenAIResponsesGoalInferenceModel(client).generate({
        model: "goal-model",
        instructions: "instructions",
        input: "sanitized-input",
      }),
    ).toEqual(validResult());
    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0]).toMatchObject({
      model: "goal-model",
      instructions: "instructions",
      input: "sanitized-input",
      store: false,
      text: { format: { type: "json_schema", name: "goal_inference_result", strict: true } },
    });
  });

  it("distinguishes parse failures and sanitizes other SDK failures", async () => {
    const parse = vi.fn().mockRejectedValueOnce(new SyntaxError("raw output"));
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const model = new OpenAIResponsesGoalInferenceModel(client);
    const request = { model: "goal-model", instructions: "instructions", input: "input" };

    await expect(model.generate(request)).rejects.toBeInstanceOf(
      GoalInterpreterStructuredOutputError,
    );
    parse.mockRejectedValueOnce(new Error("provider detail with secret"));
    await expect(model.generate(request)).rejects.toEqual(new GoalInterpreterRequestError());
  });

  it("uses goalModel in the explicit factory without reading environment configuration", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: validResult() });
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const config: OpenAIConfig = {
      apiKey: "not-transmitted-by-the-interpreter",
      goalModel: "factory-goal-model",
      continuityModel: "continuity-model",
      recoveryModel: "recovery-model",
    };

    await createOpenAIGoalInterpreter(config, client).run(input);

    expect(parse.mock.calls[0]?.[0].model).toBe("factory-goal-model");
    expect(JSON.stringify(parse.mock.calls[0]?.[0])).not.toContain(config.apiKey);
  });
});
