import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_STATE_TRANSITION",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "AGENT_FAILURE",
  "DATABASE_FAILURE",
  "INTERNAL_ERROR",
]);

export const ApiErrorDetailSchema = z.object({
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
  message: z.string().min(1),
});

export const ApiErrorDetailsSchema = z.object({
  fields: z.array(ApiErrorDetailSchema).min(1),
});

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1).optional(),
  details: ApiErrorDetailsSchema.optional(),
  retryable: z.boolean(),
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;
export type ApiErrorDetails = z.infer<typeof ApiErrorDetailsSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
