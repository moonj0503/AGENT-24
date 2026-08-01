import { z } from "zod";

export const GoalEvidenceSchema = z.object({ type: z.enum(["RESOURCE", "ACTIVITY_SEQUENCE", "CALENDAR", "PREVIOUS_GOAL", "USER_PATTERN"]), description: z.string().min(1) });
export const GoalCandidateSchema = z.object({ candidateId: z.string().min(1), title: z.string().min(1), description: z.string().min(1), confidence: z.number().min(0).max(1), evidence: z.array(GoalEvidenceSchema).min(1), suggestedGoalPath: z.array(z.string().min(1)).min(1) });
export const GoalInferenceResultSchema = z.object({ inferenceId: z.string().min(1), candidates: z.array(GoalCandidateSchema).min(1).max(3), requiresConfirmation: z.boolean(), inferenceSummary: z.string().min(1) });
export const GoalSchema = z.object({ goalId: z.string().min(1), title: z.string().min(1), path: z.array(z.string().min(1)).min(1), status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "PAUSED"]), source: z.enum(["USER_CONFIRMED", "USER_CREATED", "AI_INFERRED"]), confidence: z.number().min(0).max(1) });
export type GoalCandidate = z.infer<typeof GoalCandidateSchema>;
export type GoalInferenceResult = z.infer<typeof GoalInferenceResultSchema>;
export type Goal = z.infer<typeof GoalSchema>;
