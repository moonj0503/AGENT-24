import { z } from "zod";
import { ActivityEventSchema } from "./activity.js";

const IdentifierSchema = z.string().min(1);

/** Header value required on state-changing requests. */
export const IdempotencyKeySchema = z.string().min(1).max(255);

/** POST /observations */
export const ObservationRequestSchema = z.object({
  workSessionId: IdentifierSchema,
  events: z.array(ActivityEventSchema).min(1),
});

/** POST /goal-inferences */
export const GoalInferenceRequestSchema = z.object({
  workSessionId: IdentifierSchema,
  observationEventIds: z.array(IdentifierSchema).min(1),
  previousGoalId: IdentifierSchema.optional(),
});

const CandidateGoalSelectionSchema = z.object({
  type: z.literal("CANDIDATE"),
  candidateId: IdentifierSchema,
});

const ManualGoalSelectionSchema = z.object({
  type: z.literal("MANUAL"),
  title: z.string().min(1),
  path: z.array(z.string().min(1)).min(1),
});

/** POST /goals/confirm */
export const ConfirmGoalRequestSchema = z.object({
  inferenceId: IdentifierSchema,
  selection: z.discriminatedUnion("type", [
    CandidateGoalSelectionSchema,
    ManualGoalSelectionSchema,
  ]),
});

/** POST /gaps */
export const StartGapRequestSchema = z.object({
  workSessionId: IdentifierSchema,
  goalId: IdentifierSchema,
  checkpointId: IdentifierSchema,
});

/** POST /gaps/:gapId/actions/:actionId/approval (path contract) */
export const ActionApprovalParamsSchema = z.object({
  gapId: IdentifierSchema,
  actionId: IdentifierSchema,
});

/** POST /gaps/:gapId/actions/:actionId/approval (body contract) */
export const ActionApprovalRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "REJECT" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason is required.",
      });
    }
  });

/** POST /gaps/:gapId/end (path contract) */
export const EndGapParamsSchema = z.object({
  gapId: IdentifierSchema,
});

/** POST /gaps/:gapId/end (body contract) */
export const EndGapRequestSchema = z.object({
  reason: z.string().min(1).optional(),
});

export type ObservationRequest = z.infer<typeof ObservationRequestSchema>;
export type GoalInferenceRequest = z.infer<typeof GoalInferenceRequestSchema>;
export type ConfirmGoalRequest = z.infer<typeof ConfirmGoalRequestSchema>;
export type StartGapRequest = z.infer<typeof StartGapRequestSchema>;
export type ActionApprovalParams = z.infer<typeof ActionApprovalParamsSchema>;
export type ActionApprovalRequest = z.infer<typeof ActionApprovalRequestSchema>;
export type EndGapParams = z.infer<typeof EndGapParamsSchema>;
export type EndGapRequest = z.infer<typeof EndGapRequestSchema>;
