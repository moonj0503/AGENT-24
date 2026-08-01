import type { PlannedAction } from "@continuity/contracts";
import type { PolicyRule } from "./types.js";

export type SupportedActionType = PlannedAction["type"];

export const policyRules = {
  CREATE_CHECKPOINT: {
    canonicalRiskLevel: "LOW",
    decision: "AUTO_EXECUTE",
    reason: "Creating an internal checkpoint is a reversible, low-risk action.",
  },
  CREATE_TODO_DRAFT: {
    canonicalRiskLevel: "LOW",
    decision: "AUTO_EXECUTE",
    reason: "Creating an internal TODO draft is a reversible, low-risk action.",
  },
  CREATE_MESSAGE_DRAFT: {
    canonicalRiskLevel: "LOW",
    decision: "AUTO_EXECUTE",
    reason: "Creating a message draft has no external effect.",
  },
  ORGANIZE_REFERENCES: {
    canonicalRiskLevel: "LOW",
    decision: "AUTO_EXECUTE",
    reason: "Organizing virtual references does not move or modify originals.",
  },
  GENERATE_RECOVERY_BRIEF: {
    canonicalRiskLevel: "LOW",
    decision: "AUTO_EXECUTE",
    reason: "Generating an internal recovery brief is a low-risk action.",
  },
  SEND_EMAIL: {
    canonicalRiskLevel: "HIGH",
    decision: "DOWNGRADE",
    reason: "Sending email has an external effect, so only a message draft is allowed.",
    replacementActionType: "CREATE_MESSAGE_DRAFT",
  },
} as const satisfies Readonly<Record<SupportedActionType, PolicyRule>>;

export function getPolicyRule(actionType: unknown): PolicyRule | undefined {
  if (typeof actionType !== "string" || !Object.prototype.hasOwnProperty.call(policyRules, actionType)) {
    return undefined;
  }
  return policyRules[actionType as SupportedActionType];
}
