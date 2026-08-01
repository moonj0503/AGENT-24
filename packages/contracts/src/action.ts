import { z } from "zod";

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "PROHIBITED"]);
export const PolicyDecisionSchema = z.enum(["AUTO_EXECUTE", "REQUIRE_APPROVAL", "DOWNGRADE", "DENY"]);
export const TextEditProposalSchema = z.object({
  authorizationId: z.string().min(1),
  find: z.string().min(1).max(65_536),
  replace: z.string().max(65_536),
});
export const PlannedActionSchema = z.object({ actionId: z.string().min(1), type: z.enum(["CREATE_CHECKPOINT", "CREATE_TODO_DRAFT", "CREATE_MESSAGE_DRAFT", "ORGANIZE_REFERENCES", "GENERATE_RECOVERY_BRIEF", "EDIT_APPROVED_TEXT_FILE", "SEND_EMAIL"]), title: z.string().min(1), reason: z.string().min(1), riskLevel: RiskLevelSchema, reversible: z.boolean(), status: z.enum(["PLANNED", "POLICY_CHECKING", "WAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED", "REJECTED", "ROLLED_BACK"]), textEdit: TextEditProposalSchema.nullish() });
export const ActionPlanSchema = z.object({ planId: z.string().min(1), gapId: z.string().min(1), continuityObjective: z.string().min(1), actions: z.array(PlannedActionSchema).min(1) });
/** Strict structured-output shape; nullable fields are normalized by ActionPlanSchema afterward. */
export const OpenAIActionPlanSchema = ActionPlanSchema.extend({ actions: z.array(PlannedActionSchema.extend({ textEdit: TextEditProposalSchema.nullable() })).min(1) });
export const FileEditAuditSchema = z.object({ path: z.string().min(1), backupPath: z.string().min(1), before: z.string(), after: z.string() });
export const ActionResultSchema = z.object({ actionId: z.string().min(1), status: z.enum(["COMPLETED", "FAILED", "REJECTED"]), summary: z.string().min(1), externalEffect: z.string(), occurredAt: z.string().datetime(), fileEditAudit: FileEditAuditSchema.optional() });
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;
