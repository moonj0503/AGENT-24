import { ActionPlanSchema } from "@continuity/contracts";

export { ActionPlanSchema };

export const actionPlanJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    planId: { type: "string", minLength: 1 }, gapId: { type: "string", minLength: 1 }, continuityObjective: { type: "string", minLength: 1 },
    actions: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, properties: { actionId: { type: "string", minLength: 1 }, type: { type: "string", enum: ["CREATE_CHECKPOINT", "CREATE_TODO_DRAFT", "CREATE_MESSAGE_DRAFT", "ORGANIZE_REFERENCES", "GENERATE_RECOVERY_BRIEF", "SEND_EMAIL"] }, title: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 }, riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "PROHIBITED"] }, reversible: { type: "boolean" }, status: { type: "string", enum: ["PLANNED", "POLICY_CHECKING", "WAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED", "REJECTED", "ROLLED_BACK"] } }, required: ["actionId", "type", "title", "reason", "riskLevel", "reversible", "status"] } },
  },
  required: ["planId", "gapId", "continuityObjective", "actions"],
} as const;
