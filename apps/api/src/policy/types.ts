import type { PlannedAction, PolicyDecision } from "@continuity/contracts";

export interface PolicyEvaluation {
  readonly decision: PolicyDecision;
  readonly canonicalRiskLevel: PlannedAction["riskLevel"];
  readonly reason: string;
  readonly replacementActionType?: PlannedAction["type"];
}

export interface PolicyEngine {
  evaluate(action: PlannedAction): PolicyEvaluation;
}

export interface PolicyRule {
  readonly canonicalRiskLevel: PlannedAction["riskLevel"];
  readonly decision: PolicyDecision;
  readonly reason: string;
  readonly replacementActionType?: PlannedAction["type"];
}
