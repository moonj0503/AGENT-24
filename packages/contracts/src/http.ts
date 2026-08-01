import { z } from "zod";
import { ActivityEventSchema } from "./activity.js";
import { ActionPlanSchema, ActionResultSchema } from "./action.js";
import { CheckpointSchema } from "./checkpoint.js";
import { GapSessionSchema } from "./gap.js";
import { GoalSchema } from "./goal.js";
import { RecoveryBriefSchema } from "./recovery.js";

const IdentifierSchema = z.string().min(1);

/** Header value required on state-changing requests. */
export const IdempotencyKeySchema = z.string().min(1).max(255);

/** POST /observations */
export const ObservationRequestSchema = z.object({
  workSessionId: IdentifierSchema,
  events: z.array(ActivityEventSchema).min(1),
});

/** Successful response for POST /observations. */
export const ObservationIngestionResultSchema = z.object({
  workSessionId: IdentifierSchema,
  acceptedEventIds: z.array(IdentifierSchema).min(1),
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

/** POST /checkpoints */
export const CreateCheckpointRequestSchema = z.object({
  goalId: IdentifierSchema,
  currentState: z.string().min(1),
  completedSincePrevious: z.array(z.string()),
  openQuestions: z.array(z.string()),
  likelyNextActions: z.array(z.object({
    title: z.string().min(1),
    estimatedMinutes: z.number().int().positive(),
  })),
  relatedResources: z.array(z.object({
    title: z.string().min(1),
    kind: z.string().min(1),
  })),
  confidence: z.number().min(0).max(1),
});

/** POST /gaps */
export const StartGapRequestSchema = z.object({
  workSessionId: IdentifierSchema,
  goalId: IdentifierSchema,
  checkpointId: IdentifierSchema,
});

export const StartGapResponseSchema = GapSessionSchema;

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

export const EndGapResponseSchema = GapSessionSchema;

/** GET /gaps query parameters. */
export const GapHistoryQuerySchema = z.object({
  status: z.enum(["PLANNING", "EXECUTING", "WAITING_APPROVAL", "RECOVERING", "COMPLETED", "FAILED"]).optional(),
});

/** GET /gaps/:gapId path parameters. */
export const GapHistoryParamsSchema = z.object({
  gapId: IdentifierSchema,
});

export const GapActionHistorySchema = z.object({
  action: ActionPlanSchema.shape.actions.element,
  decision: z.enum(["APPROVE", "REJECT"]).optional(),
  decisionReason: z.string().min(1).optional(),
  result: ActionResultSchema.optional(),
});

export const GapHistoryItemSchema = z.object({
  gapSession: GapSessionSchema,
  recoveryBrief: RecoveryBriefSchema.optional(),
});

export const GapHistoryListResponseSchema = z.object({
  items: z.array(GapHistoryItemSchema),
});

export const GapActionsResponseSchema = z.object({
  actions: z.array(GapActionHistorySchema),
});

export const GapHistoryDetailSchema = z.object({
  gapSession: GapSessionSchema,
  goal: GoalSchema,
  checkpoint: CheckpointSchema,
  recoveryBrief: RecoveryBriefSchema.optional(),
  actions: z.array(GapActionHistorySchema),
});

/** POST /gaps/:gapId/run (path contract) */
export const RunGapRecoveryParamsSchema = z.object({
  gapId: IdentifierSchema,
});

/** POST /gaps/:gapId/run */
export const RunGapRecoveryRequestSchema = z.object({
  goalId: IdentifierSchema,
  checkpointId: IdentifierSchema,
});

/** Successful response for POST /gaps/:gapId/run. */
export const RunGapRecoveryResponseSchema = z.object({
  actionPlan: ActionPlanSchema,
  actionResults: z.array(ActionResultSchema),
  recoveryBrief: RecoveryBriefSchema,
});

export type ObservationRequest = z.infer<typeof ObservationRequestSchema>;
export type ObservationIngestionResult = z.infer<typeof ObservationIngestionResultSchema>;
export type GoalInferenceRequest = z.infer<typeof GoalInferenceRequestSchema>;
export type ConfirmGoalRequest = z.infer<typeof ConfirmGoalRequestSchema>;
export type CreateCheckpointRequest = z.infer<typeof CreateCheckpointRequestSchema>;
export type StartGapRequest = z.infer<typeof StartGapRequestSchema>;
export type ActionApprovalParams = z.infer<typeof ActionApprovalParamsSchema>;
export type ActionApprovalRequest = z.infer<typeof ActionApprovalRequestSchema>;
export type EndGapParams = z.infer<typeof EndGapParamsSchema>;
export type EndGapRequest = z.infer<typeof EndGapRequestSchema>;
export type GapHistoryQuery = z.infer<typeof GapHistoryQuerySchema>;
export type GapHistoryParams = z.infer<typeof GapHistoryParamsSchema>;
export type GapActionHistory = z.infer<typeof GapActionHistorySchema>;
export type GapHistoryItem = z.infer<typeof GapHistoryItemSchema>;
export type GapHistoryListResponse = z.infer<typeof GapHistoryListResponseSchema>;
export type GapActionsResponse = z.infer<typeof GapActionsResponseSchema>;
export type GapHistoryDetail = z.infer<typeof GapHistoryDetailSchema>;
export type RunGapRecoveryParams = z.infer<typeof RunGapRecoveryParamsSchema>;
export type RunGapRecoveryRequest = z.infer<typeof RunGapRecoveryRequestSchema>;
export type RunGapRecoveryResponse = z.infer<typeof RunGapRecoveryResponseSchema>;
