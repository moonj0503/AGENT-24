import { describe, expect, it } from "vitest";
import { PlannedActionSchema, type PlannedAction } from "@continuity/contracts";
import { DeterministicPolicyEngine, evaluateActionType } from "./index.js";
import { evaluatePolicyRule } from "./engine.js";
import { policyRules, type SupportedActionType } from "./rules.js";

const safeActionTypes = [
  "CREATE_CHECKPOINT",
  "CREATE_TODO_DRAFT",
  "CREATE_MESSAGE_DRAFT",
  "ORGANIZE_REFERENCES",
  "GENERATE_RECOVERY_BRIEF",
] as const satisfies readonly SupportedActionType[];

function action(
  type: PlannedAction["type"],
  riskLevel: PlannedAction["riskLevel"] = "LOW",
): PlannedAction {
  return PlannedActionSchema.parse({
    actionId: `action-${type.toLowerCase()}`,
    type,
    title: `Test ${type}`,
    reason: "Policy test",
    riskLevel,
    reversible: type !== "SEND_EMAIL",
    status: "POLICY_CHECKING",
  });
}

describe("DeterministicPolicyEngine", () => {
  it.each(safeActionTypes)("auto-executes safe internal action %s", (type) => {
    const evaluation = new DeterministicPolicyEngine().evaluate(action(type, "HIGH"));

    expect(evaluation).toMatchObject({
      decision: "AUTO_EXECUTE",
      canonicalRiskLevel: "LOW",
    });
  });

  it("downgrades SEND_EMAIL to CREATE_MESSAGE_DRAFT and never auto-executes it", () => {
    const evaluation = new DeterministicPolicyEngine().evaluate(action("SEND_EMAIL", "LOW"));

    expect(evaluation).toMatchObject({
      decision: "DOWNGRADE",
      canonicalRiskLevel: "HIGH",
      replacementActionType: "CREATE_MESSAGE_DRAFT",
    });
    expect(evaluation.decision).not.toBe("AUTO_EXECUTE");
  });

  it("denies a canonical prohibited rule", () => {
    const evaluation = evaluatePolicyRule({
      canonicalRiskLevel: "PROHIBITED",
      decision: "AUTO_EXECUTE",
      reason: "This canonical action is prohibited.",
    });

    expect(evaluation.decision).toBe("DENY");
    expect(evaluation.canonicalRiskLevel).toBe("PROHIBITED");
  });

  it("fails closed for an unsupported runtime action type", () => {
    expect(evaluateActionType("UNKNOWN_ACTION")).toMatchObject({
      decision: "DENY",
      canonicalRiskLevel: "PROHIBITED",
    });
  });

  it("does not mutate input and returns equivalent deterministic evaluations", () => {
    const engine = new DeterministicPolicyEngine();
    const input = action("SEND_EMAIL", "LOW");
    const snapshot = structuredClone(input);

    expect(engine.evaluate(input)).toEqual(engine.evaluate(structuredClone(input)));
    expect(input).toEqual(snapshot);
  });

  it("defines an explicit rule for every currently supported action type", () => {
    const supportedTypes: readonly SupportedActionType[] = [
      "CREATE_CHECKPOINT",
      "CREATE_TODO_DRAFT",
      "CREATE_MESSAGE_DRAFT",
      "ORGANIZE_REFERENCES",
      "GENERATE_RECOVERY_BRIEF",
      "SEND_EMAIL",
    ];

    expect(Object.keys(policyRules).sort()).toEqual([...supportedTypes].sort());
    for (const type of supportedTypes) {
      expect(evaluateActionType(type).reason.length).toBeGreaterThan(0);
    }
  });
});
