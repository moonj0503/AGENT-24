import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalInferenceResultSchema,
  GoalSchema,
  RecoveryBriefSchema,
} from "@continuity/contracts";
import {
  FixtureGoalInterpreter,
  OpenAIGoalInterpreter,
} from "../goal-interpreter/index.js";
import {
  OpenAIClientInitializationError,
  OpenAIConfigurationError,
  type OpenAIClient,
  type OpenAIConfig,
} from "../openai/index.js";
import { NO_EXTERNAL_EFFECT } from "../../tools/result.js";
import {
  AgentProviderConfigurationError,
  FixtureRuntimeOrchestrator,
  createAgentRuntimeBundle,
  parseAgentProviderMode,
} from "./index.js";
import type { RuntimeInput } from "./types.js";

const openAIConfig: OpenAIConfig = {
  apiKey: "fake-composition-key",
  goalModel: "goal-model-for-composition",
  continuityModel: "continuity-model-for-composition",
  recoveryModel: "recovery-model-for-composition",
};

const runtimeInput: RuntimeInput = {
  goal: GoalSchema.parse({
    goalId: "goal-001",
    title: "Write the final project report",
    path: ["Final Project", "Report Writing", "QR Factorization"],
    status: "IN_PROGRESS",
    source: "USER_CONFIRMED",
    confidence: 0.84,
  }),
  checkpoint: CheckpointSchema.parse({
    checkpointId: "checkpoint-001",
    goalId: "goal-001",
    currentState: "Drafting the QR factorization stability section.",
    completedSincePrevious: ["Collected numerical stability references"],
    openQuestions: ["Which example best demonstrates the stability difference?"],
    likelyNextActions: [{ title: "Outline the next paragraph", estimatedMinutes: 10 }],
    relatedResources: [{ title: "QR Factorization Stability", kind: "WEB_PAGE" }],
    confidence: 0.9,
    createdAt: "2026-08-01T09:05:00.000Z",
  }),
  gapSession: GapSessionSchema.parse({
    gapId: "gap-001",
    workSessionId: "work-session-001",
    goalId: "goal-001",
    checkpointId: "checkpoint-001",
    status: "PLANNING",
    startedAt: "2026-08-01T09:10:00.000Z",
  }),
  occurredAt: "2026-08-01T09:30:00.000Z",
};

const goalInference = GoalInferenceResultSchema.parse({
  inferenceId: "inference-composition",
  candidates: [
    {
      candidateId: "candidate-001",
      title: "Write the final project report",
      description: "The activity may be report writing.",
      confidence: 0.84,
      evidence: [{ type: "RESOURCE", description: "Project report was active." }],
      suggestedGoalPath: ["Final Project", "Report Writing"],
    },
  ],
  requiresConfirmation: true,
  inferenceSummary: "Report work may be in progress.",
});

const actionPlan = ActionPlanSchema.parse({
  planId: "plan-composition",
  gapId: "gap-001",
  continuityObjective: "Preserve the report workflow and minimize recovery cost.",
  actions: [
    {
      actionId: "action-safe",
      type: "CREATE_TODO_DRAFT",
      title: "Draft the next writing step",
      reason: "Preserve the next task.",
      riskLevel: "LOW",
      reversible: true,
      status: "PLANNED",
    },
    {
      actionId: "action-email",
      type: "SEND_EMAIL",
      title: "Send a team update",
      reason: "Keep teammates informed.",
      riskLevel: "HIGH",
      reversible: false,
      status: "POLICY_CHECKING",
    },
  ],
});

const recoveryBrief = RecoveryBriefSchema.parse({
  briefId: "brief-composition",
  gapId: "gap-001",
  goalBeforeGap: "Final Project > Report Writing > QR Factorization",
  completedActions: ["Created a TODO draft", "Prepared a message draft"],
  pendingActions: [],
  externalEffects: [],
  recommendedNextAction: { title: "Review the prepared drafts", estimatedMinutes: 10 },
  createdAt: "2026-08-01T09:48:00.000Z",
});

function structuredName(request: unknown): string | undefined {
  if (typeof request !== "object" || request === null) return undefined;
  const text = (request as { text?: unknown }).text;
  if (typeof text !== "object" || text === null) return undefined;
  const format = (text as { format?: unknown }).format;
  if (typeof format !== "object" || format === null) return undefined;
  const name = (format as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function fakeOpenAIClient() {
  const parse = vi.fn(async (request: unknown) => {
    switch (structuredName(request)) {
      case "goal_inference_result":
        return { output_parsed: goalInference };
      case "continuity_action_plan":
        return { output_parsed: actionPlan };
      case "recovery_brief":
        return { output_parsed: recoveryBrief };
      default:
        throw new Error("Unexpected structured output request.");
    }
  });
  return {
    parse,
    client: { responses: { parse } } as unknown as OpenAIClient,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent provider parsing", () => {
  it.each([
    [{}, "fixture"],
    [{ AGENT_PROVIDER: "" }, "fixture"],
    [{ AGENT_PROVIDER: "   " }, "fixture"],
    [{ AGENT_PROVIDER: " fixture " }, "fixture"],
    [{ AGENT_PROVIDER: " openai " }, "openai"],
  ] as const)("parses %o as %s", (environment, expected) => {
    expect(parseAgentProviderMode(environment)).toBe(expected);
  });

  it.each(["OPENAI", "Fixture", "unknown", "open-ai"])(
    "rejects unsupported case-sensitive provider value %s",
    (provider) => {
      expect(() => parseAgentProviderMode({ AGENT_PROVIDER: provider })).toThrow(
        AgentProviderConfigurationError,
      );
    },
  );

  it("does not mutate the supplied environment", () => {
    const environment = { AGENT_PROVIDER: " fixture ", OPENAI_API_KEY: "untouched" };
    const snapshot = { ...environment };
    parseAgentProviderMode(environment);
    expect(environment).toEqual(snapshot);
  });
});

describe("fixture runtime composition", () => {
  it.each([{}, { AGENT_PROVIDER: "fixture" }])(
    "requires no key, config load, client, or network for %o",
    (environment) => {
      const loadOpenAIConfig = vi.fn(() => openAIConfig);
      const createOpenAIClient = vi.fn(() => fakeOpenAIClient().client);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const bundle = createAgentRuntimeBundle(environment, {
        loadOpenAIConfig,
        createOpenAIClient,
      });

      expect(bundle.provider).toBe("fixture");
      expect(bundle.goalInterpreter).toBeInstanceOf(FixtureGoalInterpreter);
      expect(bundle.runtime).toBeInstanceOf(FixtureRuntimeOrchestrator);
      expect(loadOpenAIConfig).not.toHaveBeenCalled();
      expect(createOpenAIClient).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("creates independently usable deterministic fixture bundles", async () => {
    const first = createAgentRuntimeBundle({});
    const second = createAgentRuntimeBundle({ AGENT_PROVIDER: "fixture" });

    expect(first).not.toBe(second);
    expect(first.goalInterpreter).not.toBe(second.goalInterpreter);
    expect(first.runtime).not.toBe(second.runtime);
    expect(await first.runtime.run(runtimeInput)).toEqual(await second.runtime.run(runtimeInput));
  });
});

describe("OpenAI runtime composition", () => {
  it("requires OpenAI configuration only in openai mode", () => {
    expect(() => createAgentRuntimeBundle({ AGENT_PROVIDER: "openai" })).toThrow(
      OpenAIConfigurationError,
    );
  });

  it("preserves client initialization errors", () => {
    expect(() =>
      createAgentRuntimeBundle(
        { AGENT_PROVIDER: "openai" },
        {
          loadOpenAIConfig: () => openAIConfig,
          createOpenAIClient: () => {
            throw new OpenAIClientInitializationError();
          },
        },
      ),
    ).toThrow(OpenAIClientInitializationError);
  });

  it("creates one shared client and uses every configured model", async () => {
    const { client, parse } = fakeOpenAIClient();
    const createOpenAIClient = vi.fn(() => client);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const environment = {
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "fake-composition-key",
      OPENAI_GOAL_MODEL: openAIConfig.goalModel,
      OPENAI_CONTINUITY_MODEL: openAIConfig.continuityModel,
      OPENAI_RECOVERY_MODEL: openAIConfig.recoveryModel,
    };
    const snapshot = { ...environment };
    const bundle = createAgentRuntimeBundle(environment, { createOpenAIClient });

    expect(bundle.provider).toBe("openai");
    expect(bundle.goalInterpreter).toBeInstanceOf(OpenAIGoalInterpreter);
    expect(bundle.runtime).toBeInstanceOf(FixtureRuntimeOrchestrator);
    expect(createOpenAIClient).toHaveBeenCalledOnce();

    await bundle.goalInterpreter.run({ workSessionId: "session-001", events: [] });
    const runtimeResult = await bundle.runtime.run(runtimeInput);

    expect(parse).toHaveBeenCalledTimes(3);
    const requests = parse.mock.calls.map(([request]) => request as { model?: string });
    expect(requests.map(({ model }) => model)).toEqual([
      openAIConfig.goalModel,
      openAIConfig.continuityModel,
      openAIConfig.recoveryModel,
    ]);
    expect(environment).toEqual(snapshot);

    expect(runtimeResult.actionPlan.gapId).toBe(runtimeInput.gapSession.gapId);
    expect(runtimeResult.policyEvaluations.map(({ decision }) => decision)).toEqual([
      "AUTO_EXECUTE",
      "DOWNGRADE",
    ]);
    expect(runtimeResult.actionResults.map(({ status }) => status)).toEqual([
      "COMPLETED",
      "COMPLETED",
    ]);
    expect(runtimeResult.actionResults[0]?.summary).toContain("TODO draft created");
    expect(runtimeResult.actionResults[1]?.summary).toContain("Message draft prepared");
    expect(
      runtimeResult.actionResults.every(({ externalEffect }) => externalEffect === NO_EXTERNAL_EFFECT),
    ).toBe(true);
    expect(runtimeResult.recoveryBrief.externalEffects).toEqual([]);
    expect(runtimeResult.recoveryBrief.completedActions.join(" ")).not.toMatch(/email sent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps Goal Interpreter outside the confirmed-gap runtime", async () => {
    const { client, parse } = fakeOpenAIClient();
    const bundle = createAgentRuntimeBundle(
      { AGENT_PROVIDER: "openai" },
      {
        loadOpenAIConfig: () => openAIConfig,
        createOpenAIClient: () => client,
      },
    );

    await bundle.runtime.run(runtimeInput);

    expect(parse.mock.calls.map(([request]) => structuredName(request))).toEqual([
      "continuity_action_plan",
      "recovery_brief",
    ]);
  });

  it("imports without OPENAI_API_KEY and creates no eager bundle", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    try {
      await expect(import("./composition.js")).resolves.toHaveProperty(
        "createAgentRuntimeBundle",
      );
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });
});
