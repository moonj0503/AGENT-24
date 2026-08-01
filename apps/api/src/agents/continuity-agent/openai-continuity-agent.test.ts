import { describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalSchema,
  type ActionPlan,
} from "@continuity/contracts";
import type { OpenAIClient, OpenAIConfig } from "../openai/index.js";
import { ContinuityAgentValidationError } from "./fixture-continuity-agent.js";
import {
  ContinuityAgentEmptyResponseError,
  ContinuityAgentParseError,
  ContinuityAgentRequestError,
  OpenAIContinuityAgent,
  OpenAIResponsesContinuityPlanningModel,
  createOpenAIContinuityAgent,
  type ContinuityPlanningModel,
} from "./openai-continuity-agent.js";
import { CONTINUITY_AGENT_INSTRUCTIONS } from "./prompt.js";
import type { ContinuityContext } from "./types.js";

const input: ContinuityContext = {
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
};

function validPlan(): ActionPlan {
  return {
    planId: "plan-001",
    gapId: "gap-001",
    continuityObjective: "Preserve the report workflow and minimize recovery cost.",
    actions: [
      {
        actionId: "action-001",
        type: "ORGANIZE_REFERENCES",
        title: "Organize stability references",
        reason: "Keep supporting material easy to resume.",
        riskLevel: "LOW",
        reversible: true,
        status: "PLANNED",
      },
      {
        actionId: "action-002",
        type: "CREATE_TODO_DRAFT",
        title: "Draft the next writing step",
        reason: "Preserve the unfinished thought without changing the report.",
        riskLevel: "MEDIUM",
        reversible: true,
        status: "POLICY_CHECKING",
      },
      {
        actionId: "action-003",
        type: "SEND_EMAIL",
        title: "Propose a team update",
        reason: "A later deterministic policy review can downgrade it to a draft.",
        riskLevel: "HIGH",
        reversible: false,
        status: "POLICY_CHECKING",
      },
    ],
  };
}

function mockModel(output: unknown): ContinuityPlanningModel & {
  generate: ReturnType<typeof vi.fn>;
} {
  return { generate: vi.fn().mockResolvedValue(output) };
}

const unusedClient = {} as OpenAIClient;

describe("OpenAIContinuityAgent", () => {
  it("uses the configured model and serializes exactly the existing context", async () => {
    const planningModel = mockModel(validPlan());
    await new OpenAIContinuityAgent(
      unusedClient,
      "configured-continuity-model",
      planningModel,
    ).run(input);

    expect(planningModel.generate).toHaveBeenCalledWith({
      model: "configured-continuity-model",
      instructions: CONTINUITY_AGENT_INSTRUCTIONS,
      input: JSON.stringify({
        goal: input.goal,
        checkpoint: input.checkpoint,
        gapSession: input.gapSession,
      }),
    });
    expect(JSON.stringify(planningModel.generate.mock.calls)).not.toContain("OPENAI_API_KEY");
  });

  it("returns a contract-valid plan while preserving gap, action order, titles, and reasons", async () => {
    const expected = validPlan();
    const result = await new OpenAIContinuityAgent(
      unusedClient,
      "continuity-model",
      mockModel(expected),
    ).run(input);

    expect(ActionPlanSchema.parse(result)).toEqual(expected);
    expect(result.gapId).toBe(input.gapSession.gapId);
    expect(result.actions.map(({ actionId }) => actionId)).toEqual([
      "action-001",
      "action-002",
      "action-003",
    ]);
    expect(result.actions.map(({ title, reason }) => ({ title, reason }))).toEqual(
      expected.actions.map(({ title, reason }) => ({ title, reason })),
    );
  });

  it("accepts every supported action type as an unexecuted proposal", async () => {
    const types: ActionPlan["actions"][number]["type"][] = [
      "CREATE_CHECKPOINT",
      "CREATE_TODO_DRAFT",
      "CREATE_MESSAGE_DRAFT",
      "ORGANIZE_REFERENCES",
      "GENERATE_RECOVERY_BRIEF",
      "SEND_EMAIL",
    ];
    const plan = {
      ...validPlan(),
      actions: types.map((type, index) => ({
        ...validPlan().actions[0]!,
        actionId: `action-${index}`,
        type,
      })),
    };

    expect(
      (await new OpenAIContinuityAgent(unusedClient, "model", mockModel(plan)).run(input)).actions
        .map(({ type }) => type),
    ).toEqual(types);
  });

  it("rejects empty actions, unsupported types, and missing fields", async () => {
    const invalidOutputs = [
      { ...validPlan(), actions: [] },
      {
        ...validPlan(),
        actions: [{ ...validPlan().actions[0], type: "DELETE_ORIGINAL_FILE" }],
      },
      { planId: "plan-001", gapId: "gap-001", actions: validPlan().actions },
    ];

    for (const output of invalidOutputs) {
      await expect(
        new OpenAIContinuityAgent(unusedClient, "model", mockModel(output)).run(input),
      ).rejects.toBeInstanceOf(ContinuityAgentValidationError);
    }
  });

  it("rejects mismatched gap IDs and duplicate action IDs", async () => {
    await expect(
      new OpenAIContinuityAgent(
        unusedClient,
        "model",
        mockModel({ ...validPlan(), gapId: "different-gap" }),
      ).run(input),
    ).rejects.toThrow("preserve the active GapSession gapId");

    const duplicate = validPlan();
    duplicate.actions[1] = { ...duplicate.actions[1]!, actionId: duplicate.actions[0]!.actionId };
    await expect(
      new OpenAIContinuityAgent(unusedClient, "model", mockModel(duplicate)).run(input),
    ).rejects.toThrow("unique actionId");
  });

  it("requires one valid approved-file edit and retries one invalid proposal", async () => {
    const approvedInput: ContinuityContext = {
      ...input,
      approvedTextFile: {
        authorizationId: "authorization-001",
        fileName: "notes.txt",
        content: "Unique unfinished note",
      },
    };
    const validEditPlan: ActionPlan = {
      ...validPlan(),
      actions: [{
        actionId: "action-edit",
        type: "EDIT_APPROVED_TEXT_FILE",
        title: "Finish the approved note",
        reason: "Advance the confirmed Goal in the user-approved file.",
        riskLevel: "MEDIUM",
        reversible: true,
        status: "POLICY_CHECKING",
        textEdit: {
          authorizationId: "authorization-001",
          find: "Unique unfinished note",
          replace: "Completed note",
        },
      }],
    };
    const planningModel: ContinuityPlanningModel & { generate: ReturnType<typeof vi.fn> } = {
      generate: vi.fn()
        .mockResolvedValueOnce(validPlan())
        .mockResolvedValueOnce(validEditPlan),
    };

    await expect(new OpenAIContinuityAgent(unusedClient, "model", planningModel).run(approvedInput))
      .resolves.toEqual(validEditPlan);
    expect(planningModel.generate).toHaveBeenCalledTimes(2);
    expect(planningModel.generate.mock.calls[1]?.[0].instructions).toContain("Retry the plan");
  });

  it("fails closed after two invalid approved-file proposals", async () => {
    const approvedInput: ContinuityContext = {
      ...input,
      approvedTextFile: {
        authorizationId: "authorization-001",
        fileName: "notes.txt",
        content: "Unique unfinished note",
      },
    };
    const planningModel = mockModel(validPlan());

    await expect(new OpenAIContinuityAgent(unusedClient, "model", planningModel).run(approvedInput))
      .rejects.toThrow("exactly one edit");
    expect(planningModel.generate).toHaveBeenCalledTimes(2);
  });

  it.each(["WAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED", "REJECTED", "ROLLED_BACK"])(
    "rejects execution-implying status %s",
    async (status) => {
      const plan = validPlan();
      plan.actions[0] = { ...plan.actions[0]!, status } as ActionPlan["actions"][number];
      await expect(
        new OpenAIContinuityAgent(unusedClient, "model", mockModel(plan)).run(input),
      ).rejects.toThrow("pre-Policy, unexecuted proposals");
    },
  );

  it.each([null, undefined, ""])('distinguishes empty output %j', async (output) => {
    await expect(
      new OpenAIContinuityAgent(unusedClient, "model", mockModel(output)).run(input),
    ).rejects.toBeInstanceOf(ContinuityAgentEmptyResponseError);
  });

  it("sanitizes unexpected provider failures and preserves parse errors", async () => {
    const rawFailure: ContinuityPlanningModel = {
      generate: vi.fn().mockRejectedValue(new Error("provider-body-with-secret")),
    };
    const promise = new OpenAIContinuityAgent(unusedClient, "model", rawFailure).run(input);
    await expect(promise).rejects.toBeInstanceOf(ContinuityAgentRequestError);
    await expect(promise).rejects.not.toThrow("provider-body-with-secret");

    const parseFailure: ContinuityPlanningModel = {
      generate: vi.fn().mockRejectedValue(new ContinuityAgentParseError()),
    };
    await expect(
      new OpenAIContinuityAgent(unusedClient, "model", parseFailure).run(input),
    ).rejects.toBeInstanceOf(ContinuityAgentParseError);
  });

  it("does not mutate input and is deterministic for equivalent mocked responses", async () => {
    const snapshot = structuredClone(input);
    const agent = new OpenAIContinuityAgent(unusedClient, "model", mockModel(validPlan()));

    expect(await agent.run(input)).toEqual(await agent.run(input));
    expect(input).toEqual(snapshot);
  });

  it("only proposes SEND_EMAIL and never calls Policy or Tools", async () => {
    const evaluatePolicy = vi.fn();
    const executeTool = vi.fn();
    const result = await new OpenAIContinuityAgent(
      unusedClient,
      "model",
      mockModel(validPlan()),
    ).run(input);
    const email = result.actions.find(({ type }) => type === "SEND_EMAIL");

    expect(evaluatePolicy).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(email).toMatchObject({
      riskLevel: "HIGH",
      status: "POLICY_CHECKING",
      reversible: false,
    });
    expect(result).not.toHaveProperty("actionResults");
    expect(email).not.toHaveProperty("externalEffect");
    expect(CONTINUITY_AGENT_INSTRUCTIONS).toContain("riskLevel as permission");
    expect(CONTINUITY_AGENT_INSTRUCTIONS).toContain("Never send email automatically");
  });

  it("imports without OPENAI_API_KEY", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    try {
      await expect(import("./index.js")).resolves.toHaveProperty("OpenAIContinuityAgent");
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });
});

describe("OpenAIResponsesContinuityPlanningModel", () => {
  it("uses ActionPlan structured parsing without a real network request", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: validPlan() });
    const client = { responses: { parse } } as unknown as OpenAIClient;

    expect(
      await new OpenAIResponsesContinuityPlanningModel(client).generate({
        model: "continuity-model",
        instructions: "instructions",
        input: "sanitized-input",
      }),
    ).toEqual(validPlan());
    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0]).toMatchObject({
      model: "continuity-model",
      instructions: "instructions",
      input: "sanitized-input",
      store: false,
      text: { format: { type: "json_schema", name: "continuity_action_plan", strict: true } },
    });
  });

  it("distinguishes parse failures and sanitizes SDK request failures", async () => {
    const parse = vi.fn().mockRejectedValueOnce(new SyntaxError("raw model output"));
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const model = new OpenAIResponsesContinuityPlanningModel(client);
    const request = { model: "model", instructions: "instructions", input: "input" };

    await expect(model.generate(request)).rejects.toBeInstanceOf(ContinuityAgentParseError);
    parse.mockRejectedValueOnce(new Error("raw provider response"));
    await expect(model.generate(request)).rejects.toEqual(new ContinuityAgentRequestError());
  });

  it("uses config.continuityModel and never transmits the API key", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: validPlan() });
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const config: OpenAIConfig = {
      apiKey: "not-transmitted-by-agent",
      goalModel: "goal-model",
      continuityModel: "factory-continuity-model",
      recoveryModel: "recovery-model",
    };

    await createOpenAIContinuityAgent(config, client).run(input);

    expect(parse.mock.calls[0]?.[0].model).toBe("factory-continuity-model");
    expect(JSON.stringify(parse.mock.calls[0]?.[0])).not.toContain(config.apiKey);
  });
});
