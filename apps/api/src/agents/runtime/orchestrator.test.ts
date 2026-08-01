import { describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  ActionResultSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalSchema,
  RecoveryBriefSchema,
  type ActionPlan,
  type ActionResult,
  type PlannedAction,
} from "@continuity/contracts";
import type { ContinuityAgent } from "../continuity-agent/index.js";
import type { RecoveryContext, RecoveryGenerator } from "../recovery-generator/index.js";
import type { PolicyEngine, PolicyEvaluation } from "../../policy/index.js";
import { NO_EXTERNAL_EFFECT } from "../../tools/result.js";
import {
  FixtureRuntimeOrchestrator,
  RuntimeContextValidationError,
  RuntimeExecutionError,
} from "./index.js";
import type { RuntimeActionExecutor, RuntimeInput } from "./types.js";

const occurredAt = "2026-08-01T09:30:00.000Z";

const input: RuntimeInput = {
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
  occurredAt,
};

const actionPlan = ActionPlanSchema.parse({
  planId: "plan-test",
  gapId: "gap-001",
  continuityObjective: "Preserve the current work context.",
  actions: [
    {
      actionId: "action-one",
      type: "CREATE_TODO_DRAFT",
      title: "Draft the next task",
      reason: "Preserve the next step.",
      riskLevel: "LOW",
      reversible: true,
      status: "PLANNED",
    },
    {
      actionId: "action-two",
      type: "SEND_EMAIL",
      title: "Send an update",
      reason: "Keep collaborators informed.",
      riskLevel: "HIGH",
      reversible: false,
      status: "POLICY_CHECKING",
    },
  ],
});

const recoveryBrief = RecoveryBriefSchema.parse({
  briefId: "brief-test",
  gapId: "gap-001",
  goalBeforeGap: "Final Project > Report Writing > QR Factorization",
  completedActions: ["Drafted the next task"],
  pendingActions: ["Message draft awaiting approval"],
  externalEffects: [],
  recommendedNextAction: { title: "Review the outline", estimatedMinutes: 10 },
  createdAt: "2026-08-01T09:48:00.000Z",
});

function evaluationFor(action: PlannedAction): PolicyEvaluation {
  if (action.type === "SEND_EMAIL") {
    return {
      decision: "DOWNGRADE",
      canonicalRiskLevel: "HIGH",
      reason: "Only drafting is allowed.",
      replacementActionType: "CREATE_MESSAGE_DRAFT",
    };
  }
  return {
    decision: "AUTO_EXECUTE",
    canonicalRiskLevel: "LOW",
    reason: "Safe internal action.",
  };
}

function completed(action: PlannedAction): ActionResult {
  return ActionResultSchema.parse({
    actionId: action.actionId,
    status: "COMPLETED",
    summary: action.type === "SEND_EMAIL" ? "Message draft prepared." : "TODO draft created.",
    externalEffect: NO_EXTERNAL_EFFECT,
    occurredAt,
  });
}

function dependencies(plan: ActionPlan = actionPlan) {
  const calls: string[] = [];
  const continuityAgent: ContinuityAgent = {
    run: vi.fn(async () => {
      calls.push("continuity");
      return plan;
    }),
  };
  const policyEngine: PolicyEngine = {
    evaluate: vi.fn((action) => {
      calls.push(`policy:${action.actionId}`);
      return evaluationFor(action);
    }),
  };
  const toolExecutor: RuntimeActionExecutor = {
    execute: vi.fn(async (action) => {
      calls.push(`tool:${action.actionId}`);
      return completed(action);
    }),
  };
  const recoveryGenerator: RecoveryGenerator = {
    run: vi.fn(async () => {
      calls.push("recovery");
      return recoveryBrief;
    }),
  };
  return { calls, continuityAgent, policyEngine, toolExecutor, recoveryGenerator };
}

describe("FixtureRuntimeOrchestrator", () => {
  it("runs the actual fixture pipeline with safe internal results and a downgraded email", async () => {
    const orchestrator = new FixtureRuntimeOrchestrator();
    const result = await orchestrator.run(input);

    expect(result.actionPlan.actions.map((action) => action.type)).toEqual([
      "CREATE_TODO_DRAFT",
      "SEND_EMAIL",
    ]);
    expect(result.policyEvaluations).toHaveLength(2);
    expect(result.policyEvaluations.map((evaluation) => evaluation.decision)).toEqual([
      "AUTO_EXECUTE",
      "DOWNGRADE",
    ]);
    expect(result.actionResults).toHaveLength(2);
    expect(result.actionResults.map((resultItem) => resultItem.actionId)).toEqual([
      "act-001",
      "act-002",
    ]);
    expect(result.actionResults.map((resultItem) => resultItem.status)).toEqual([
      "COMPLETED",
      "COMPLETED",
    ]);
    expect(result.actionResults[1]?.summary).toContain("Message draft prepared");
    expect(result.actionResults.every((resultItem) => resultItem.externalEffect === NO_EXTERNAL_EFFECT)).toBe(true);
    expect(RecoveryBriefSchema.parse(result.recoveryBrief)).toEqual(result.recoveryBrief);
    expect(await orchestrator.run(input)).toEqual(result);
  });

  it("runs dependencies exactly once per stage and preserves sequential action order", async () => {
    const deps = dependencies();
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    const result = await orchestrator.run(input);

    expect(deps.calls).toEqual([
      "continuity",
      "policy:action-one",
      "tool:action-one",
      "policy:action-two",
      "tool:action-two",
      "recovery",
    ]);
    expect(deps.continuityAgent.run).toHaveBeenCalledOnce();
    expect(deps.policyEngine.evaluate).toHaveBeenCalledTimes(actionPlan.actions.length);
    expect(deps.toolExecutor.execute).toHaveBeenCalledTimes(actionPlan.actions.length);
    expect(deps.recoveryGenerator.run).toHaveBeenCalledOnce();
    expect(result.actionPlan).toBe(actionPlan);
    expect(result.policyEvaluations).toHaveLength(actionPlan.actions.length);
    expect(result.actionResults.map((item) => item.actionId)).toEqual(
      actionPlan.actions.map((action) => action.actionId),
    );
  });

  it("passes the generated plan and every ActionResult to Recovery", async () => {
    const deps = dependencies();
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    const result = await orchestrator.run(input);
    const recoveryContext = vi.mocked(deps.recoveryGenerator.run).mock.calls[0]?.[0];

    expect(recoveryContext).toMatchObject({
      goal: input.goal,
      gapSession: input.gapSession,
      actionPlan,
      actionResults: result.actionResults,
    } satisfies RecoveryContext);
  });

  it("does not mutate RuntimeInput or ActionPlan and is deterministic for the same time", async () => {
    const deps = dependencies();
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );
    const inputSnapshot = structuredClone(input);
    const planSnapshot = structuredClone(actionPlan);

    expect(await orchestrator.run(input)).toEqual(await orchestrator.run(input));
    expect(input).toEqual(inputSnapshot);
    expect(actionPlan).toEqual(planSnapshot);
  });

  it.each([
    ["Goal and Checkpoint", { checkpoint: { ...input.checkpoint, goalId: "other-goal" } }],
    ["Goal and GapSession", { gapSession: { ...input.gapSession, goalId: "other-goal" } }],
    ["Checkpoint and GapSession", { gapSession: { ...input.gapSession, checkpointId: "other-checkpoint" } }],
  ])("rejects mismatched %s identities before dependency execution", async (_label, change) => {
    const deps = dependencies();
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    await expect(orchestrator.run({ ...input, ...change })).rejects.toBeInstanceOf(
      RuntimeContextValidationError,
    );
    expect(deps.continuityAgent.run).not.toHaveBeenCalled();
  });

  it("rejects a mismatched ActionPlan gap before Policy or Tool execution", async () => {
    const deps = dependencies({ ...actionPlan, gapId: "other-gap" });
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    await expect(orchestrator.run(input)).rejects.toBeInstanceOf(RuntimeContextValidationError);
    expect(deps.policyEngine.evaluate).not.toHaveBeenCalled();
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
  });

  it("reports CONTINUITY and stops when the Continuity Agent fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.continuityAgent.run).mockRejectedValueOnce(new Error("continuity unavailable"));
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    await expect(orchestrator.run(input)).rejects.toMatchObject({
      name: "RuntimeExecutionError",
      stage: "CONTINUITY",
    });
    expect(deps.policyEngine.evaluate).not.toHaveBeenCalled();
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
  });

  it("reports POLICY and stops before Tool execution or Recovery", async () => {
    const deps = dependencies();
    vi.mocked(deps.policyEngine.evaluate).mockImplementationOnce(() => {
      throw new Error("policy unavailable");
    });
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    await expect(orchestrator.run(input)).rejects.toMatchObject({
      name: "RuntimeExecutionError",
      stage: "POLICY",
    });
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
    expect(deps.recoveryGenerator.run).not.toHaveBeenCalled();
  });

  it("allows structured failed Tool results to flow into Recovery", async () => {
    const deps = dependencies();
    vi.mocked(deps.toolExecutor.execute).mockImplementation(async (action) =>
      ActionResultSchema.parse({
        actionId: action.actionId,
        status: "FAILED",
        summary: "Structured Tool failure.",
        externalEffect: NO_EXTERNAL_EFFECT,
        occurredAt,
      }),
    );
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    const result = await orchestrator.run(input);

    expect(result.actionResults.every((item) => item.status === "FAILED")).toBe(true);
    expect(deps.recoveryGenerator.run).toHaveBeenCalledOnce();
  });

  it("reports TOOL for unexpected execution errors and mismatched result identities", async () => {
    const throwing = dependencies();
    vi.mocked(throwing.toolExecutor.execute).mockRejectedValueOnce(new Error("executor crashed"));
    const throwingRuntime = new FixtureRuntimeOrchestrator(
      throwing.continuityAgent,
      throwing.policyEngine,
      throwing.toolExecutor,
      throwing.recoveryGenerator,
    );
    await expect(throwingRuntime.run(input)).rejects.toMatchObject({ stage: "TOOL" });

    const mismatched = dependencies();
    vi.mocked(mismatched.toolExecutor.execute).mockResolvedValueOnce(
      ActionResultSchema.parse({
        actionId: "wrong-action",
        status: "COMPLETED",
        summary: "Wrong identity.",
        externalEffect: NO_EXTERNAL_EFFECT,
        occurredAt,
      }),
    );
    const mismatchedRuntime = new FixtureRuntimeOrchestrator(
      mismatched.continuityAgent,
      mismatched.policyEngine,
      mismatched.toolExecutor,
      mismatched.recoveryGenerator,
    );
    await expect(mismatchedRuntime.run(input)).rejects.toBeInstanceOf(RuntimeExecutionError);
    expect(mismatched.recoveryGenerator.run).not.toHaveBeenCalled();
  });

  it("reports RECOVERY when the Recovery Generator throws", async () => {
    const deps = dependencies();
    vi.mocked(deps.recoveryGenerator.run).mockRejectedValueOnce(new Error("recovery unavailable"));
    const orchestrator = new FixtureRuntimeOrchestrator(
      deps.continuityAgent,
      deps.policyEngine,
      deps.toolExecutor,
      deps.recoveryGenerator,
    );

    await expect(orchestrator.run(input)).rejects.toMatchObject({
      name: "RuntimeExecutionError",
      stage: "RECOVERY",
    });
  });
});
