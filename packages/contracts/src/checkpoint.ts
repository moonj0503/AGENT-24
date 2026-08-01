import { z } from "zod";

export const CheckpointSchema = z.object({ checkpointId: z.string().min(1), goalId: z.string().min(1), currentState: z.string().min(1), completedSincePrevious: z.array(z.string()), openQuestions: z.array(z.string()), likelyNextActions: z.array(z.object({ title: z.string().min(1), estimatedMinutes: z.number().int().positive() })), relatedResources: z.array(z.object({ title: z.string().min(1), kind: z.string().min(1) })), confidence: z.number().min(0).max(1), createdAt: z.string().datetime() });
export type Checkpoint = z.infer<typeof CheckpointSchema>;
