import type { PlannedAction } from "@continuity/contracts";
import { getPolicyRule } from "./rules.js";
import type { PolicyEngine, PolicyEvaluation, PolicyRule } from "./types.js";

export function evaluatePolicyRule(rule: PolicyRule | undefined): PolicyEvaluation {
  if (!rule) {
    return {
      decision: "DENY",
      canonicalRiskLevel: "PROHIBITED",
      reason: "Unsupported action types fail closed.",
    };
  }

  if (rule.canonicalRiskLevel === "PROHIBITED") {
    return {
      decision: "DENY",
      canonicalRiskLevel: "PROHIBITED",
      reason: rule.reason,
    };
  }

  return {
    decision: rule.decision,
    canonicalRiskLevel: rule.canonicalRiskLevel,
    reason: rule.reason,
    ...(rule.replacementActionType
      ? { replacementActionType: rule.replacementActionType }
      : {}),
  };
}

export function evaluateActionType(actionType: unknown): PolicyEvaluation {
  return evaluatePolicyRule(getPolicyRule(actionType));
}

export class DeterministicPolicyEngine implements PolicyEngine {
  evaluate(action: PlannedAction): PolicyEvaluation {
    return evaluateActionType(action.type);
  }
}
