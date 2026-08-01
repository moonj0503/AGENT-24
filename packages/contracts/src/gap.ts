import { z } from "zod";

export const GapSessionSchema = z.object({ gapId: z.string().min(1), workSessionId: z.string().min(1), goalId: z.string().min(1), checkpointId: z.string().min(1), status: z.enum(["PLANNING", "EXECUTING", "WAITING_APPROVAL", "RECOVERING", "COMPLETED", "FAILED"]), startedAt: z.string().datetime(), endedAt: z.string().datetime().optional() });
export type GapSession = z.infer<typeof GapSessionSchema>;
