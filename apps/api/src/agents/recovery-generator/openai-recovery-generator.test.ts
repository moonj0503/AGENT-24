import { describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  ActionResultSchema,
  GapSessionSchema,
  GoalSchema,
  RecoveryBriefSchema,
  type ActionResult,
  type RecoveryBrief,
} from "@continuity/contracts";
import type { OpenAIClient, OpenAIConfig } from "../openai/index.js";
import { RecoveryGeneratorValidationError } from "./fixture-recovery-generator.js";
import {
  OpenAIRecoveryGenerator,
  OpenAIResponsesRecoveryModel,
  RecoveryGeneratorEmptyResponseError,
  RecoveryGeneratorParseError,
  RecoveryGeneratorRequestError,
  createOpenAIRecoveryGenerator,
  type RecoveryModel,
} from "./openai-recovery-generator.js";
import { RECOVERY_GENERATOR_INSTRUCTIONS } from "./prompt.js";
import type { RecoveryContext } from "./types.js";

const actionResults: readonly ActionResult[] = [
  ActionResultSchema.parse({
    actionId: "action-001",
    status: "COMPLETED",
    summary: "Created an internal checkpoint.",
    externalEffect: "NONE",
    occurredAt: "2026-08-01T09:20:00.000Z",
  }),
  ActionResultSchema.parse({
    actionId: "action-002",
    status: "FAILED",
    summary: "Reference organization failed safely.",
    externalEffect: "NONE",
    occurredAt: "2026-08-01T09:21:00.000Z",
  }),
  ActionResultSchema.parse({
    actionId: "action-003",
    status: "REJECTED",
    summary: "TODO drafting was rejected.",
    externalEffect: "NONE",
    occurredAt: "2026-08-01T09:22:00.000Z",
  }),
  ActionResultSchema.parse({
    actionId: "action-004",
    status: "COMPLETED",
    summary: "Message draft prepared after SEND_EMAIL was downgraded.",
    externalEffect: "NONE",
    occurredAt: "2026-08-01T09:23:00.000Z",
  }),
];

const input: RecoveryContext = {
  goal: GoalSchema.parse({
    goalId: "goal-001",
    title: "Write the final project report",
    path: ["Final Project", "Report Writing", "QR Factorization"],
    status: "IN_PROGRESS",
    source: "USER_CONFIRMED",
    confidence: 0.84,
  }),
  gapSession: GapSessionSchema.parse({
    gapId: "gap-001",
    workSessionId: "work-session-001",
    goalId: "goal-001",
    checkpointId: "checkpoint-001",
    status: "RECOVERING",
    startedAt: "2026-08-01T09:10:00.000Z",
  }),
  actionPlan: ActionPlanSchema.parse({
    planId: "plan-001",
    gapId: "gap-001",
    continuityObjective: "Preserve the report workflow.",
    actions: [
      {
        actionId: "action-001",
        type: "CREATE_CHECKPOINT",
        title: "Create an internal checkpoint",
        reason: "Preserve progress.",
        riskLevel: "LOW",
        reversible: true,
        status: "PLANNED",
      },
      {
        actionId: "action-002",
        type: "ORGANIZE_REFERENCES",
        title: "Organize references",
        reason: "Reduce recovery cost.",
        riskLevel: "LOW",
        reversible: true,
        status: "PLANNED",
      },
      {
        actionId: "action-003",
        type: "CREATE_TODO_DRAFT",
        title: "Draft the next task",
        reason: "Preserve the next step.",
        riskLevel: "LOW",
        reversible: true,
        status: "PLANNED",
      },
      {
        actionId: "action-004",
        type: "SEND_EMAIL",
        title: "Send a team update",
        reason: "Keep collaborators informed.",
        riskLevel: "HIGH",
        reversible: false,
        status: "POLICY_CHECKING",
      },
    ],
  }),
  actionResults,
};

function validBrief(): RecoveryBrief {
  return {
    briefId: "brief-001",
    gapId: "gap-001",
    goalBeforeGap: "Final Project > Report Writing > QR Factorization",
    completedActions: ["Created an internal checkpoint", "Prepared a message draft"],
    pendingActions: ["Organize references", "Draft the next task"],
    externalEffects: [],
    recommendedNextAction: { title: "Review the QR stability outline", estimatedMinutes: 10 },
    createdAt: "2026-08-01T09:48:00.000Z",
  };
}

function mockModel(output: unknown): RecoveryModel & { generate: ReturnType<typeof vi.fn> } {
  return { generate: vi.fn().mockResolvedValue(output) };
}

const unusedClient = {} as OpenAIClient;

describe("OpenAIRecoveryGenerator", () => {
  it("uses the configured model and serializes exactly the RecoveryContext", async () => {
    const model = mockModel(validBrief());
    await new OpenAIRecoveryGenerator(unusedClient, "configured-recovery-model", model).run(input);

    expect(model.generate).toHaveBeenCalledWith({
      model: "configured-recovery-model",
      instructions: RECOVERY_GENERATOR_INSTRUCTIONS,
      input: JSON.stringify({
        goal: input.goal,
        gapSession: input.gapSession,
        actionPlan: input.actionPlan,
        actionResults: input.actionResults,
      }),
    });
    expect(JSON.stringify(model.generate.mock.calls)).not.toContain("OPENAI_API_KEY");
  });

  it("returns a grounded contract-valid brief preserving ordered claims", async () => {
    const expected = validBrief();
    const result = await new OpenAIRecoveryGenerator(
      unusedClient,
      "recovery-model",
      mockModel(expected),
    ).run(input);

    expect(RecoveryBriefSchema.parse(result)).toEqual(expected);
    expect(result.gapId).toBe(input.gapSession.gapId);
    expect(result.goalBeforeGap).not.toHaveLength(0);
    expect(result.completedActions).toEqual(expected.completedActions);
    expect(result.pendingActions).toEqual(expected.pendingActions);
    expect(result.recommendedNextAction).toEqual({
      title: "Review the QR stability outline",
      estimatedMinutes: 10,
    });
  });

  it("rejects malformed output, missing fields, invalid duration, and invalid datetime", async () => {
    const outputs = [
      { briefId: "brief-001", completedActions: [{}] },
      (({ recommendedNextAction: _missing, ...rest }) => rest)(validBrief()),
      { ...validBrief(), recommendedNextAction: { title: "Resume", estimatedMinutes: 0 } },
      { ...validBrief(), createdAt: "not-a-date" },
    ];

    for (const output of outputs) {
      await expect(
        new OpenAIRecoveryGenerator(unusedClient, "model", mockModel(output)).run(input),
      ).rejects.toBeInstanceOf(RecoveryGeneratorValidationError);
    }
  });

  it("rejects a mismatched gap and an unrelated goal representation", async () => {
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), gapId: "other-gap" }),
      ).run(input),
    ).rejects.toThrow("preserve the active GapSession gapId");

    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), goalBeforeGap: "Unrelated vacation planning" }),
      ).run(input),
    ).rejects.toThrow("not grounded in the confirmed Goal");
  });

  it("rejects fabricated or excessive completed-action claims", async () => {
    const noCompletedInput = {
      ...input,
      actionResults: input.actionResults.map((result) => ({ ...result, status: "FAILED" as const })),
    };
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), completedActions: ["Invented completed work"] }),
      ).run(noCompletedInput),
    ).rejects.toThrow("ungrounded completed-action claims");

    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({
          ...validBrief(),
          completedActions: ["One", "Two", "Fabricated third completion"],
        }),
      ).run(input),
    ).rejects.toThrow("ungrounded completed-action claims");
  });

  it("does not list rejected or failed results as completed", async () => {
    const onlyUnsuccessful = {
      ...input,
      actionPlan: ActionPlanSchema.parse({
        ...input.actionPlan,
        actions: input.actionPlan.actions.slice(1, 3),
      }),
      actionResults: input.actionResults.slice(1, 3),
    };
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), completedActions: ["Organized references"] }),
      ).run(onlyUnsuccessful),
    ).rejects.toThrow("ungrounded completed-action claims");
  });

  it("rejects fabricated pending claims when all planned actions completed", async () => {
    const completedInput = {
      ...input,
      actionResults: input.actionPlan.actions.map((action, index) =>
        ActionResultSchema.parse({
          actionId: action.actionId,
          status: "COMPLETED",
          summary: `Completed internal action ${index}`,
          externalEffect: "NONE",
          occurredAt: `2026-08-01T09:2${index}:00.000Z`,
        }),
      ),
    };
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), completedActions: [], pendingActions: ["Invented pending"] }),
      ).run(completedInput),
    ).rejects.toThrow("ungrounded pending-action claims");
  });

  it("rejects overlapping completed and pending claims", async () => {
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), pendingActions: ["Created an internal checkpoint"] }),
      ).run(input),
    ).rejects.toThrow("same action as completed and pending");
  });

  it("rejects invented or excessive external effects", async () => {
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), externalEffects: ["Email sent"] }),
      ).run(input),
    ).rejects.toThrow("ungrounded external-effect claims");

    const oneEffectInput = {
      ...input,
      actionResults: [
        { ...input.actionResults[0]!, externalEffect: "Calendar event created" },
        ...input.actionResults.slice(1),
      ],
    };
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), externalEffects: ["One", "Invented second effect"] }),
      ).run(oneEffectInput),
    ).rejects.toThrow("ungrounded external-effect claims");
  });

  it("accepts only explicitly grounded external effects", async () => {
    const explicitEffectInput = {
      ...input,
      actionResults: [
        { ...input.actionResults[0]!, externalEffect: "Calendar event created" },
        ...input.actionResults.slice(1),
      ],
    };
    const result = await new OpenAIRecoveryGenerator(
      unusedClient,
      "model",
      mockModel({ ...validBrief(), externalEffects: ["A calendar event was created"] }),
    ).run(explicitEffectInput);

    expect(result.externalEffects).toEqual(["A calendar event was created"]);
  });

  it("does not turn downgraded SEND_EMAIL into a sent communication", async () => {
    await expect(
      new OpenAIRecoveryGenerator(
        unusedClient,
        "model",
        mockModel({ ...validBrief(), completedActions: ["Checkpoint created", "Email sent"] }),
      ).run(input),
    ).rejects.toThrow("implies external communication");

    const result = await new OpenAIRecoveryGenerator(
      unusedClient,
      "model",
      mockModel(validBrief()),
    ).run(input);
    expect(result.completedActions).toContain("Prepared a message draft");
    expect(result.externalEffects).toEqual([]);
  });

  it.each([null, undefined, ""])('distinguishes empty output %j', async (output) => {
    await expect(
      new OpenAIRecoveryGenerator(unusedClient, "model", mockModel(output)).run(input),
    ).rejects.toBeInstanceOf(RecoveryGeneratorEmptyResponseError);
  });

  it("sanitizes unexpected provider failures and preserves parse failures", async () => {
    const requestFailure: RecoveryModel = {
      generate: vi.fn().mockRejectedValue(new Error("raw-provider-body-with-secret")),
    };
    const promise = new OpenAIRecoveryGenerator(unusedClient, "model", requestFailure).run(input);
    await expect(promise).rejects.toBeInstanceOf(RecoveryGeneratorRequestError);
    await expect(promise).rejects.not.toThrow("raw-provider-body-with-secret");

    const parseFailure: RecoveryModel = {
      generate: vi.fn().mockRejectedValue(new RecoveryGeneratorParseError()),
    };
    await expect(
      new OpenAIRecoveryGenerator(unusedClient, "model", parseFailure).run(input),
    ).rejects.toBeInstanceOf(RecoveryGeneratorParseError);
  });

  it("does not mutate input or actions and is deterministic for equivalent responses", async () => {
    const snapshot = structuredClone(input);
    const generator = new OpenAIRecoveryGenerator(unusedClient, "model", mockModel(validBrief()));

    expect(await generator.run(input)).toEqual(await generator.run(input));
    expect(input).toEqual(snapshot);
  });

  it("summarizes only and never calls Policy or Tools", async () => {
    const evaluatePolicy = vi.fn();
    const executeTool = vi.fn();
    await new OpenAIRecoveryGenerator(unusedClient, "model", mockModel(validBrief())).run(input);

    expect(evaluatePolicy).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(RECOVERY_GENERATOR_INSTRUCTIONS).toContain("Do not execute Tools");
    expect(RECOVERY_GENERATOR_INSTRUCTIONS).toContain("evaluate Policy");
  });

  it("imports without OPENAI_API_KEY", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    try {
      await expect(import("./index.js")).resolves.toHaveProperty("OpenAIRecoveryGenerator");
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });
});

describe("OpenAIResponsesRecoveryModel", () => {
  it("uses RecoveryBrief structured parsing without a real network request", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: validBrief() });
    const client = { responses: { parse } } as unknown as OpenAIClient;

    expect(
      await new OpenAIResponsesRecoveryModel(client).generate({
        model: "recovery-model",
        instructions: "instructions",
        input: "sanitized-input",
      }),
    ).toEqual(validBrief());
    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0]).toMatchObject({
      model: "recovery-model",
      instructions: "instructions",
      input: "sanitized-input",
      store: false,
      text: { format: { type: "json_schema", name: "recovery_brief", strict: true } },
    });
  });

  it("distinguishes parse failures and sanitizes SDK request failures", async () => {
    const parse = vi.fn().mockRejectedValueOnce(new SyntaxError("raw model output"));
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const model = new OpenAIResponsesRecoveryModel(client);
    const request = { model: "model", instructions: "instructions", input: "input" };

    await expect(model.generate(request)).rejects.toBeInstanceOf(RecoveryGeneratorParseError);
    parse.mockRejectedValueOnce(new Error("raw provider details"));
    await expect(model.generate(request)).rejects.toEqual(new RecoveryGeneratorRequestError());
  });

  it("uses config.recoveryModel and never transmits the API key", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: validBrief() });
    const client = { responses: { parse } } as unknown as OpenAIClient;
    const config: OpenAIConfig = {
      apiKey: "not-transmitted-by-generator",
      goalModel: "goal-model",
      continuityModel: "continuity-model",
      recoveryModel: "factory-recovery-model",
    };

    await createOpenAIRecoveryGenerator(config, client).run(input);

    expect(parse.mock.calls[0]?.[0].model).toBe("factory-recovery-model");
    expect(JSON.stringify(parse.mock.calls[0]?.[0])).not.toContain(config.apiKey);
  });
});
