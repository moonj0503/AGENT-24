import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiErrorSchema,
  GoalInferenceResultSchema,
  ObservationIngestionResultSchema,
  type ActivityEvent,
  type GoalInferenceResult,
} from "@continuity/contracts";
import { buildApp } from "../src/app.js";
import {
  createApplicationDependencies,
} from "../src/application-composition.js";
import { FixtureGoalInterpreter, type GoalInterpreter } from "../src/agents/goal-interpreter/index.js";
import {
  createAgentRuntimeBundle,
  type AgentRuntimeBundle,
} from "../src/agents/runtime/index.js";
import {
  OpenAIClientInitializationError,
  type OpenAIClient,
} from "../src/agents/openai/index.js";
import { InMemoryWorkflowRepository } from "../src/repositories/in-memory-workflow-repository.js";
import {
  createWorkflowService,
  WorkflowService,
} from "../src/services/workflow-service.js";

const events: ActivityEvent[] = [
  {
    eventId: "event-one",
    type: "ACTIVE_WINDOW_CHANGED",
    occurredAt: "2026-08-01T09:00:00.000Z",
    application: { name: "Writer", category: "DOCUMENT" },
    resource: { title: "Project report", kind: "DOCUMENT" },
    metadata: { idleSeconds: 0 },
  },
  {
    eventId: "event-two",
    type: "BROWSER_TAB_CHANGED",
    occurredAt: "2026-08-01T09:01:00.000Z",
    application: { name: "Browser", category: "BROWSER" },
    resource: { title: "QR factorization reference", kind: "WEB_PAGE" },
    metadata: { idleSeconds: 0 },
  },
];

const observationPayload = {
  workSessionId: "work-session-composition",
  events,
};

const openAIInference = GoalInferenceResultSchema.parse({
  inferenceId: "inference-openai-composition",
  candidates: [
    {
      candidateId: "candidate-openai-composition",
      title: "Continue the project report",
      description: "The selected reference may support report writing.",
      confidence: 0.88,
      evidence: [{ type: "RESOURCE", description: "QR factorization reference" }],
      suggestedGoalPath: ["Final Project", "Report Writing"],
    },
  ],
  requiresConfirmation: true,
  inferenceSummary: "Report work may be continuing.",
});

function fakeGoalClient() {
  const parse = vi.fn(async (_request: Record<string, unknown>) => ({
    output_parsed: openAIInference,
  }));
  return {
    parse,
    client: { responses: { parse } } as unknown as OpenAIClient,
  };
}

async function postObservations(app: ReturnType<typeof buildApp>, key: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/observations",
    headers: { "idempotency-key": key },
    payload: observationPayload,
  });
}

async function postInference(
  app: ReturnType<typeof buildApp>,
  key: string,
  observationEventIds: readonly string[] = ["event-two"],
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/goal-inferences",
    headers: { "idempotency-key": key },
    payload: {
      workSessionId: observationPayload.workSessionId,
      observationEventIds,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("application dependency composition", () => {
  it.each([{}, { AGENT_PROVIDER: "fixture" }])(
    "composes fixture Goal Interpreter without a key or OpenAI client for %o",
    (environment) => {
      const repository = new InMemoryWorkflowRepository();
      const loadOpenAIConfig = vi.fn(() => {
        throw new Error("Fixture mode must not load OpenAI configuration.");
      });
      const createOpenAIClient = vi.fn(() => fakeGoalClient().client);
      const createBundle = vi.fn((selectedEnvironment: NodeJS.ProcessEnv) =>
        createAgentRuntimeBundle(selectedEnvironment, {
          loadOpenAIConfig,
          createOpenAIClient,
        }),
      );

      const dependencies = createApplicationDependencies(environment, {
        workflowRepository: repository,
        createAgentRuntimeBundle: createBundle,
      });

      expect(dependencies.agentBundle.provider).toBe("fixture");
      expect(dependencies.agentBundle.goalInterpreter).toBeInstanceOf(FixtureGoalInterpreter);
      expect(dependencies.workflowService).toBeInstanceOf(WorkflowService);
      expect(createBundle).toHaveBeenCalledOnce();
      expect(loadOpenAIConfig).not.toHaveBeenCalled();
      expect(createOpenAIClient).not.toHaveBeenCalled();
    },
  );

  it("passes the selected Goal Interpreter to WorkflowService and retains Runtime", async () => {
    const runGoal = vi.fn(async () => openAIInference);
    const runRuntime = vi.fn();
    const bundle: AgentRuntimeBundle = {
      provider: "openai",
      goalInterpreter: { run: runGoal },
      runtime: { run: runRuntime },
    };
    const repository = new InMemoryWorkflowRepository();
    await repository.ingestObservations(observationPayload);
    const dependencies = createApplicationDependencies(
      { AGENT_PROVIDER: "openai" },
      {
        workflowRepository: repository,
        createAgentRuntimeBundle: () => bundle,
      },
    );

    expect(dependencies.agentBundle.runtime).toBe(bundle.runtime);
    expect(
      await dependencies.workflowService.inferGoal({
        workSessionId: observationPayload.workSessionId,
        observationEventIds: ["event-two"],
      }),
    ).toEqual(openAIInference);
    expect(runGoal).toHaveBeenCalledWith({
      workSessionId: observationPayload.workSessionId,
      events: [events[1]],
    });
    expect(runRuntime).not.toHaveBeenCalled();
  });

  it("does not mutate the supplied environment", () => {
    const environment = { AGENT_PROVIDER: "fixture", OPENAI_API_KEY: "unchanged" };
    const snapshot = { ...environment };
    createApplicationDependencies(environment, {
      workflowRepository: new InMemoryWorkflowRepository(),
    });
    expect(environment).toEqual(snapshot);
  });
});

describe("provider-selected Goal Inference API", () => {
  it("returns the existing fixture inference with unchanged observation and confirmation contracts", async () => {
    const dependencies = createApplicationDependencies({}, {
      workflowRepository: new InMemoryWorkflowRepository(),
    });
    const app = buildApp({ workflowService: dependencies.workflowService });

    const observation = await postObservations(app, "fixture-observation");
    expect(observation.statusCode).toBe(201);
    expect(ObservationIngestionResultSchema.parse(observation.json())).toEqual({
      workSessionId: observationPayload.workSessionId,
      acceptedEventIds: ["event-one", "event-two"],
    });

    const inference = await postInference(
      app,
      "fixture-inference",
      ["event-one", "event-two"],
    );
    expect(inference.statusCode).toBe(200);
    const inferenceBody = GoalInferenceResultSchema.parse(inference.json());
    expect(inferenceBody).toMatchObject({ inferenceId: "inf-001", requiresConfirmation: true });

    const confirmation = await app.inject({
      method: "POST",
      url: "/api/v1/goals/confirm",
      headers: { "idempotency-key": "fixture-confirmation" },
      payload: {
        inferenceId: inferenceBody.inferenceId,
        selection: { type: "CANDIDATE", candidateId: "goal-001" },
      },
    });
    expect(confirmation.statusCode).toBe(201);
    expect(confirmation.json()).toMatchObject({
      goalId: "goal-001",
      source: "USER_CONFIRMED",
      status: "IN_PROGRESS",
    });
    await app.close();
  });

  it("runs the OpenAI-selected interpreter through the existing HTTP and repository flow", async () => {
    const repository = new InMemoryWorkflowRepository();
    const { client, parse } = fakeGoalClient();
    const createOpenAIClient = vi.fn(() => client);
    const runtimeRun = vi.fn();
    const createBundle = vi.fn((environment: NodeJS.ProcessEnv) => {
      const selected = createAgentRuntimeBundle(environment, { createOpenAIClient });
      return { ...selected, runtime: { run: runtimeRun } } satisfies AgentRuntimeBundle;
    });
    const environment = {
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "fake-application-key",
      OPENAI_GOAL_MODEL: "application-goal-model",
      OPENAI_CONTINUITY_MODEL: "unused-continuity-model",
      OPENAI_RECOVERY_MODEL: "unused-recovery-model",
    };
    const dependencies = createApplicationDependencies(environment, {
      workflowRepository: repository,
      createAgentRuntimeBundle: createBundle,
    });
    const app = buildApp({ workflowService: dependencies.workflowService });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const observation = await postObservations(app, "openai-observation");
    expect(observation.statusCode).toBe(201);

    const first = await postInference(app, "openai-inference-one");
    const second = await postInference(app, "openai-inference-two");
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(GoalInferenceResultSchema.parse(first.json())).toEqual(openAIInference);
    expect(GoalInferenceResultSchema.parse(second.json())).toEqual(openAIInference);

    expect(createBundle).toHaveBeenCalledOnce();
    expect(createOpenAIClient).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledTimes(2);
    for (const [request] of parse.mock.calls) {
      expect(request).toMatchObject({ model: "application-goal-model", store: false });
      const serializedInput = JSON.parse(String(request.input)) as {
        workSessionId: string;
        events: ActivityEvent[];
      };
      expect(serializedInput).toEqual({
        workSessionId: observationPayload.workSessionId,
        events: [events[1]],
      });
      expect(JSON.stringify(request)).not.toContain(environment.OPENAI_API_KEY);
    }
    expect(first.body).not.toContain(environment.OPENAI_API_KEY);
    expect(await repository.getInference(openAIInference.inferenceId)).toEqual({
      workSessionId: observationPayload.workSessionId,
      result: openAIInference,
    });
    expect(runtimeRun).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it("preserves AGENT_FAILURE handling without exposing provider details", async () => {
    const providerSecret = "provider-secret-body";
    const interpreter: GoalInterpreter = {
      run: vi.fn(async () => {
        throw new Error(providerSecret);
      }),
    };
    const repository = new InMemoryWorkflowRepository();
    const app = buildApp({
      workflowService: createWorkflowService(repository, interpreter),
    });
    await postObservations(app, "failure-observation");

    const response = await postInference(app, "failure-inference");

    expect(response.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(response.json())).toMatchObject({
      code: "AGENT_FAILURE",
      message: "The goal inference could not be created.",
      retryable: true,
    });
    expect(response.body).not.toContain(providerSecret);
    await app.close();
  });

  it("does not expose an API key in startup component errors", () => {
    const secret = "startup-secret-key";
    expect(() =>
      createApplicationDependencies(
        { AGENT_PROVIDER: "openai", OPENAI_API_KEY: secret },
        {
          workflowRepository: new InMemoryWorkflowRepository(),
          createAgentRuntimeBundle: (environment) =>
            createAgentRuntimeBundle(environment, {
              createOpenAIClient: () => {
                throw new OpenAIClientInitializationError();
              },
            }),
        },
      ),
    ).toThrow(OpenAIClientInitializationError);

    try {
      createApplicationDependencies(
        { AGENT_PROVIDER: "openai", OPENAI_API_KEY: secret },
        {
          workflowRepository: new InMemoryWorkflowRepository(),
          createAgentRuntimeBundle: (environment) =>
            createAgentRuntimeBundle(environment, {
              createOpenAIClient: () => {
                throw new OpenAIClientInitializationError();
              },
            }),
        },
      );
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("lazy application construction", () => {
  it("lets explicit buildApp service injection bypass provider configuration", async () => {
    const run = vi.fn(async (): Promise<GoalInferenceResult> => openAIInference);
    const service = createWorkflowService(new InMemoryWorkflowRepository(), { run });
    const app = buildApp({ workflowService: service });
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(run).not.toHaveBeenCalled();
    await app.close();
  });

  it("imports app, server, and composition modules without eager OpenAI initialization", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalProvider = process.env.AGENT_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    process.env.AGENT_PROVIDER = "openai";
    vi.resetModules();
    try {
      await expect(import("../src/app.js")).resolves.toHaveProperty("buildApp");
      await expect(import("../src/server.js")).resolves.toHaveProperty("startServer");
      await expect(import("../src/application-composition.js")).resolves.toHaveProperty(
        "createApplicationDependencies",
      );
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
      if (originalProvider === undefined) delete process.env.AGENT_PROVIDER;
      else process.env.AGENT_PROVIDER = originalProvider;
    }
  });
});
