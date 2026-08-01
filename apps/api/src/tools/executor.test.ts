import { describe, expect, it } from "vitest";
import {
  ActionResultSchema,
  PlannedActionSchema,
  type ActionResult,
  type PlannedAction,
} from "@continuity/contracts";
import { DeterministicPolicyEngine, type PolicyEvaluation } from "../policy/index.js";
import { ToolExecutor } from "./executor.js";
import { DefaultToolRegistry } from "./registry.js";
import { NO_EXTERNAL_EFFECT } from "./result.js";
import type { AgentTool } from "./types.js";

const context = { occurredAt: "2026-08-01T09:30:00.000Z" } as const;

function action(type: PlannedAction["type"]): PlannedAction {
  return PlannedActionSchema.parse({
    actionId: "action-001",
    type,
    title: "Prepare team update",
    reason: "Preserve continuity during the gap.",
    riskLevel: type === "SEND_EMAIL" ? "HIGH" : "LOW",
    reversible: type !== "SEND_EMAIL",
    status: "POLICY_CHECKING",
  });
}

const approvalEvaluation: PolicyEvaluation = {
  decision: "REQUIRE_APPROVAL",
  canonicalRiskLevel: "HIGH",
  reason: "Explicit approval is required.",
};

const denyEvaluation: PolicyEvaluation = {
  decision: "DENY",
  canonicalRiskLevel: "PROHIBITED",
  reason: "This action is prohibited.",
};

describe("ToolExecutor", () => {
  it("AUTO_EXECUTE runs the intended Tool and validates its output", async () => {
    const input = action("CREATE_TODO_DRAFT");
    const result = await new ToolExecutor().execute(
      input,
      new DeterministicPolicyEngine().evaluate(input),
      context,
    );

    expect(ActionResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      actionId: input.actionId,
      status: "COMPLETED",
      externalEffect: NO_EXTERNAL_EFFECT,
      occurredAt: context.occurredAt,
    });
  });

  it("DOWNGRADE executes CREATE_MESSAGE_DRAFT instead of SEND_EMAIL", async () => {
    const input = action("SEND_EMAIL");
    const result = await new ToolExecutor().execute(
      input,
      new DeterministicPolicyEngine().evaluate(input),
      context,
    );

    expect(result).toMatchObject({
      actionId: input.actionId,
      status: "COMPLETED",
      externalEffect: NO_EXTERNAL_EFFECT,
    });
    expect(result.summary).toContain("Message draft prepared");
    expect(result.summary).not.toContain("Email sending is disabled");
  });

  it.each([
    ["REQUIRE_APPROVAL", approvalEvaluation],
    ["DENY", denyEvaluation],
  ] as const)("%s executes no Tool", async (_decision, evaluation) => {
    let calls = 0;
    const countingTool: AgentTool = {
      type: "CREATE_TODO_DRAFT",
      async execute(input) {
        calls += 1;
        return ActionResultSchema.parse({
          actionId: input.actionId,
          status: "COMPLETED",
          summary: "Should not execute.",
          externalEffect: NO_EXTERNAL_EFFECT,
          occurredAt: context.occurredAt,
        });
      },
    };
    const result = await new ToolExecutor(new DefaultToolRegistry([countingTool])).execute(
      action("CREATE_TODO_DRAFT"),
      evaluation,
      context,
    );

    expect(calls).toBe(0);
    expect(result.status).toBe("REJECTED");
    expect(result.externalEffect).toBe(NO_EXTERNAL_EFFECT);
  });

  it("converts invalid Tool output into a structured failed result", async () => {
    const invalidTool: AgentTool = {
      type: "CREATE_TODO_DRAFT",
      async execute() {
        return {} as ActionResult;
      },
    };
    const input = action("CREATE_TODO_DRAFT");
    const result = await new ToolExecutor(new DefaultToolRegistry([invalidTool])).execute(
      input,
      new DeterministicPolicyEngine().evaluate(input),
      context,
    );

    expect(ActionResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({ status: "FAILED", externalEffect: NO_EXTERNAL_EFFECT });
    expect(result.summary).toContain("invalid output");
  });

  it("converts a Tool exception into a structured failed result", async () => {
    const throwingTool: AgentTool = {
      type: "CREATE_TODO_DRAFT",
      async execute() {
        throw new Error("fixture failure");
      },
    };
    const input = action("CREATE_TODO_DRAFT");
    const result = await new ToolExecutor(new DefaultToolRegistry([throwingTool])).execute(
      input,
      new DeterministicPolicyEngine().evaluate(input),
      context,
    );

    expect(result.status).toBe("FAILED");
    expect(result.summary).toContain("fixture failure");
    expect(result.externalEffect).toBe(NO_EXTERNAL_EFFECT);
  });

  it("does not mutate the action and is deterministic for an injected time", async () => {
    const input = action("CREATE_CHECKPOINT");
    const snapshot = structuredClone(input);
    const evaluation = new DeterministicPolicyEngine().evaluate(input);
    const executor = new ToolExecutor();

    expect(await executor.execute(input, evaluation, context)).toEqual(
      await executor.execute(structuredClone(input), evaluation, context),
    );
    expect(input).toEqual(snapshot);
  });

  it("fails closed when the selected Tool is missing", async () => {
    const input = action("CREATE_CHECKPOINT");
    const result = await new ToolExecutor(new DefaultToolRegistry([])).execute(
      input,
      new DeterministicPolicyEngine().evaluate(input),
      context,
    );

    expect(result).toMatchObject({ status: "FAILED", externalEffect: NO_EXTERNAL_EFFECT });
  });
});
