import { describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  ApiErrorSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalSchema,
  RecoveryBriefSchema,
  RunGapRecoveryResponseSchema,
} from "@continuity/contracts";
import { buildApp } from "../src/app.js";
import { createApplicationDependencies } from "../src/application-composition.js";
import {
  RuntimeExecutionError,
  createAgentRuntimeBundle,
  type RuntimeOrchestrator,
  type RuntimeResult,
} from "../src/agents/runtime/index.js";
import type { OpenAIClient } from "../src/agents/openai/index.js";
import { InMemoryWorkflowRepository } from "../src/repositories/in-memory-workflow-repository.js";
import { GapRecoveryService } from "../src/services/gap-recovery-service.js";

const occurredAt = "2026-08-01T09:30:00.000Z";
const goal = GoalSchema.parse({
  goalId: "goal-001",
  title: "Write the final project report",
  path: ["Final Project", "Report Writing", "QR Factorization"],
  status: "IN_PROGRESS",
  source: "USER_CONFIRMED",
  confidence: 0.84,
});
const checkpoint = CheckpointSchema.parse({
  checkpointId: "checkpoint-001",
  goalId: goal.goalId,
  currentState: "Drafting the QR factorization stability section.",
  completedSincePrevious: ["Collected references"],
  openQuestions: ["Which example is clearest?"],
  likelyNextActions: [{ title: "Outline the next paragraph", estimatedMinutes: 10 }],
  relatedResources: [{ title: "QR Factorization Stability", kind: "WEB_PAGE" }],
  confidence: 0.9,
  createdAt: "2026-08-01T09:05:00.000Z",
});
const gapSession = GapSessionSchema.parse({
  gapId: "gap-001",
  workSessionId: "work-session-001",
  goalId: goal.goalId,
  checkpointId: checkpoint.checkpointId,
  status: "PLANNING",
  startedAt: "2026-08-01T09:10:00.000Z",
});
const actionPlan = ActionPlanSchema.parse({
  planId: "plan-runtime-api",
  gapId: gapSession.gapId,
  continuityObjective: "Preserve report-writing continuity.",
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
  briefId: "brief-runtime-api",
  gapId: gapSession.gapId,
  goalBeforeGap: "Final Project > Report Writing > QR Factorization",
  completedActions: ["Created a TODO draft", "Prepared a message draft"],
  pendingActions: [],
  externalEffects: [],
  recommendedNextAction: { title: "Review the prepared drafts", estimatedMinutes: 10 },
  createdAt: "2026-08-01T09:48:00.000Z",
});

function repository(overrides: {
  goal?: typeof goal;
  checkpoint?: typeof checkpoint;
  gapSession?: typeof gapSession;
} = {}) {
  return new InMemoryWorkflowRepository({
    goals: overrides.goal === undefined ? [goal] : [overrides.goal],
    checkpoints: overrides.checkpoint === undefined ? [checkpoint] : [overrides.checkpoint],
    gapSessions: overrides.gapSession === undefined ? [gapSession] : [overrides.gapSession],
  });
}

function runtimeResult(): RuntimeResult {
  return {
    actionPlan,
    policyEvaluations: [],
    actionResults: [
      {
        actionId: "action-safe",
        status: "COMPLETED",
        summary: "TODO draft created.",
        externalEffect: "NONE",
        occurredAt,
      },
      {
        actionId: "action-email",
        status: "COMPLETED",
        summary: "Message draft prepared instead of sending email.",
        externalEffect: "NONE",
        occurredAt,
      },
    ],
    recoveryBrief,
  };
}

const request = { goalId: goal.goalId, checkpointId: checkpoint.checkpointId };
const params = { gapId: gapSession.gapId };

describe("GapRecoveryService", () => {
  it("loads the exact context and supplies one fixed request time to Runtime", async () => {
    const selectedRepository = repository();
    const getGoal = vi.spyOn(selectedRepository, "getGoal");
    const getCheckpoint = vi.spyOn(selectedRepository, "getCheckpoint");
    const getGap = vi.spyOn(selectedRepository, "getGapSession");
    const run = vi.fn(async () => runtimeResult());
    const service = new GapRecoveryService(selectedRepository, { run }, { now: () => occurredAt });

    await expect(service.run(params, request)).resolves.toEqual({
      actionPlan,
      actionResults: runtimeResult().actionResults,
      recoveryBrief,
    });
    expect(getGoal).toHaveBeenCalledWith(goal.goalId);
    expect(getCheckpoint).toHaveBeenCalledWith(checkpoint.checkpointId);
    expect(getGap).toHaveBeenCalledWith(gapSession.gapId);
    expect(run).toHaveBeenCalledWith({ goal, checkpoint, gapSession, occurredAt });
  });

  it.each([
    ["Goal", "getGoal"],
    ["Checkpoint", "getCheckpoint"],
    ["GapSession", "getGapSession"],
  ] as const)("returns NOT_FOUND when %s is missing", async (_label, method) => {
    const selectedRepository = repository();
    vi.spyOn(selectedRepository, method).mockResolvedValueOnce(null);
    const runtime = { run: vi.fn(async () => runtimeResult()) };
    const service = new GapRecoveryService(selectedRepository, runtime, { now: () => occurredAt });
    await expect(service.run(params, request)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it.each([
    { checkpoint: { ...checkpoint, goalId: "other-goal" } },
    { gapSession: { ...gapSession, goalId: "other-goal" } },
    { gapSession: { ...gapSession, checkpointId: "other-checkpoint" } },
  ])("rejects mismatched identities before Runtime", async (overrides) => {
    const runtime = { run: vi.fn(async () => runtimeResult()) };
    const service = new GapRecoveryService(repository(overrides), runtime, { now: () => occurredAt });
    await expect(service.run(params, request)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it("maps Runtime and repository failures without leaking their details", async () => {
    const secret = "provider-secret-value";
    const runtime: RuntimeOrchestrator = {
      run: vi.fn(async () => {
        throw new RuntimeExecutionError("CONTINUITY", secret);
      }),
    };
    const service = new GapRecoveryService(repository(), runtime, { now: () => occurredAt });
    await expect(service.run(params, request)).rejects.toMatchObject({
      code: "AGENT_FAILURE",
      message: "The recovery runtime could not complete.",
    });

    const failingRepository = repository();
    vi.spyOn(failingRepository, "getGoal").mockRejectedValueOnce(new Error(secret));
    const failingService = new GapRecoveryService(failingRepository, runtime, { now: () => occurredAt });
    await expect(failingService.run(params, request)).rejects.toMatchObject({
      code: "DATABASE_FAILURE",
      message: "The recovery context could not be loaded.",
    });
  });
});

function runtimeRequest(key: string, payload: object = request) {
  return {
    method: "POST" as const,
    url: `/api/v1/gaps/${gapSession.gapId}/run`,
    headers: { "idempotency-key": key },
    payload,
  };
}

describe("confirmed-gap runtime route", () => {
  it("rejects invalid bodies through the shared request schema", async () => {
    const service = new GapRecoveryService(repository(), { run: vi.fn(async () => runtimeResult()) });
    const app = buildApp({ gapRecoveryService: service });
    const response = await app.inject(runtimeRequest("invalid-runtime", { goalId: goal.goalId }));
    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json()).code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("maps Runtime failures to a safe AGENT_FAILURE response", async () => {
    const runtime = { run: vi.fn(async () => { throw new Error("secret-provider-payload"); }) };
    const app = buildApp({
      gapRecoveryService: new GapRecoveryService(repository(), runtime, { now: () => occurredAt }),
    });
    const response = await app.inject(runtimeRequest("runtime-failure"));
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("secret-provider-payload");
    expect(response.json()).toMatchObject({ code: "AGENT_FAILURE", retryable: true });
    await app.close();
  });

  it("replays duplicate requests without executing Runtime twice", async () => {
    const run = vi.fn(async () => runtimeResult());
    const app = buildApp({
      gapRecoveryService: new GapRecoveryService(repository(), { run }, { now: () => occurredAt }),
    });
    const first = await app.inject(runtimeRequest("runtime-replay"));
    const replay = await app.inject(runtimeRequest("runtime-replay"));
    expect(first.statusCode).toBe(200);
    expect(replay.body).toBe(first.body);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(run).toHaveBeenCalledOnce();
    await app.close();
  });
});

describe("application-level runtime composition", () => {
  it("runs the fixture Runtime without a key and preserves Policy and Tool safety", async () => {
    const selectedRepository = repository();
    const dependencies = createApplicationDependencies({ AGENT_PROVIDER: "fixture" }, {
      workflowRepository: selectedRepository,
      clock: { now: () => occurredAt },
    });
    const goalInterpreter = vi.spyOn(dependencies.agentBundle.goalInterpreter, "run");
    const runtime = vi.spyOn(dependencies.agentBundle.runtime, "run");
    const app = buildApp(dependencies);
    const response = await app.inject(runtimeRequest("fixture-runtime"));
    expect(response.statusCode).toBe(200);
    const body = RunGapRecoveryResponseSchema.parse(response.json());
    expect(body.actionPlan.actions.map(({ type }) => type)).toEqual(["CREATE_TODO_DRAFT", "SEND_EMAIL"]);
    expect(body.actionResults.map(({ actionId }) => actionId)).toEqual(["act-001", "act-002"]);
    expect(body.actionResults[1]?.summary).toContain("Message draft prepared");
    expect(body.actionResults.every(({ externalEffect }) => externalEffect === "NONE")).toBe(true);
    expect(body.recoveryBrief.externalEffects).toEqual([]);
    await expect(runtime.mock.results[0]?.value).resolves.toMatchObject({ policyEvaluations: [
      { decision: "AUTO_EXECUTE" },
      { decision: "DOWNGRADE" },
    ] });
    expect(goalInterpreter).not.toHaveBeenCalled();
    await app.close();
  });

  it("uses one mocked OpenAI client and only the configured Continuity and Recovery models", async () => {
    const parse = vi.fn(async (openAIRequest: unknown) => {
      const format = (openAIRequest as { text?: { format?: { name?: string } } }).text?.format?.name;
      if (format === "continuity_action_plan") return { output_parsed: actionPlan };
      if (format === "recovery_brief") return { output_parsed: recoveryBrief };
      throw new Error(`Unexpected structured response: ${format}`);
    });
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const createClient = vi.fn(() => client);
    const createBundle = vi.fn((environment: NodeJS.ProcessEnv) => createAgentRuntimeBundle(
      environment,
      { createOpenAIClient: createClient },
    ));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dependencies = createApplicationDependencies({
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "fake-runtime-api-key",
      OPENAI_GOAL_MODEL: "unused-goal-model",
      OPENAI_CONTINUITY_MODEL: "continuity-runtime-model",
      OPENAI_RECOVERY_MODEL: "recovery-runtime-model",
    }, {
      workflowRepository: repository(),
      createAgentRuntimeBundle: createBundle,
      clock: { now: () => occurredAt },
    });
    const goalInterpreter = vi.spyOn(dependencies.agentBundle.goalInterpreter, "run");
    const app = buildApp(dependencies);
    const response = await app.inject(runtimeRequest("openai-runtime"));
    expect(response.statusCode).toBe(200);
    const body = RunGapRecoveryResponseSchema.parse(response.json());
    expect(createBundle).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledOnce();
    expect(parse.mock.calls.map(([call]) => (call as { model?: string }).model)).toEqual([
      "continuity-runtime-model",
      "recovery-runtime-model",
    ]);
    expect(goalInterpreter).not.toHaveBeenCalled();
    expect(body.actionResults[1]).toMatchObject({ externalEffect: "NONE" });
    expect(body.actionResults[1]?.summary).toContain("Message draft prepared");
    expect(body.recoveryBrief.completedActions.join(" ")).not.toMatch(/email sent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    await app.close();
  });
});
