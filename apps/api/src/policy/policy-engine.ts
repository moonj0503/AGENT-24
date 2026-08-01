import type { PlannedAction, PolicyDecision } from "@continuity/contracts";
import { defaultPermissionProfile, type PermissionProfile } from "./permission-profile.js";
import { classifyRisk } from "./risk-classifier.js";
import { downgradeRules } from "./policy-rules.js";

export interface PolicyEvaluation {
  readonly decision: PolicyDecision;
  readonly reason: string;
  readonly allowedAction?: PlannedAction;
}

export function evaluatePolicy(action: PlannedAction, profile: PermissionProfile = defaultPermissionProfile): PolicyEvaluation {
  const classifiedRisk = classifyRisk(action);
  const permission = profile.rules[action.type];
  const downgradedType = downgradeRules[action.type];

  if (action.riskLevel === "PROHIBITED") return { decision: "DENY", reason: `${action.type} was classified as prohibited and cannot execute.` };
  if (downgradedType) {
    return { decision: "DOWNGRADE", reason: `${action.type} is not permitted automatically; a reversible draft is allowed.`, allowedAction: { ...action, type: downgradedType, title: `Draft: ${action.title}`, riskLevel: classifyRisk({ type: downgradedType }), reversible: true, status: "PLANNED" } };
  }
  if (permission === "NEVER") return { decision: "DENY", reason: `${action.type} is prohibited by the permission profile.` };
  if (action.riskLevel === "HIGH" || classifiedRisk === "HIGH" || permission === "ASK") return { decision: "REQUIRE_APPROVAL", reason: `${action.type} requires explicit user approval.` };
  return { decision: "AUTO_EXECUTE", reason: `${action.type} is a reversible ${classifiedRisk.toLowerCase()}-risk action.`, allowedAction: action };
}
