import { z } from "zod";

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "PROHIBITED"]);
export const PolicyDecisionSchema = z.enum(["AUTO_EXECUTE", "REQUIRE_APPROVAL", "DOWNGRADE", "DENY"]);
export const PlannedActionSchema = z.object({ actionId: z.string().min(1), type: z.enum(["CREATE_CHECKPOINT", "CREATE_TODO_DRAFT", "CREATE_MESSAGE_DRAFT", "ORGANIZE_REFERENCES", "GENERATE_RECOVERY_BRIEF", "SEND_EMAIL"]), title: z.string().min(1), reason: z.string().min(1), riskLevel: RiskLevelSchema, reversible: z.boolean(), status: z.enum(["PLANNED", "POLICY_CHECKING", "WAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED", "REJECTED", "ROLLED_BACK"]) });
export const ActionPlanSchema = z.object({ planId: z.string().min(1), gapId: z.string().min(1), continuityObjective: z.string().min(1), actions: z.array(PlannedActionSchema).min(1) });
export const ActionResultSchema = z.object({ actionId: z.string().min(1), status: z.enum(["COMPLETED", "FAILED", "REJECTED"]), summary: z.string().min(1), externalEffect: z.string(), occurredAt: z.string().datetime() });
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;
