import { z } from "zod";

export const RecoveryBriefSchema = z.object({ briefId: z.string().min(1), gapId: z.string().min(1), goalBeforeGap: z.string().min(1), completedActions: z.array(z.string()), pendingActions: z.array(z.string()), externalEffects: z.array(z.string()), recommendedNextAction: z.object({ title: z.string().min(1), estimatedMinutes: z.number().int().positive() }), createdAt: z.string().datetime() });
export type RecoveryBrief = z.infer<typeof RecoveryBriefSchema>;
