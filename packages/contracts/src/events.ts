import { z } from "zod";

export const AgentEventSchema = z.object({ eventId: z.string().min(1), type: z.enum(["GOAL_INFERRED", "GAP_STARTED", "ACTION_UPDATED", "RECOVERY_READY"]), gapId: z.string().min(1).optional(), occurredAt: z.string().datetime(), payload: z.record(z.string(), z.unknown()) });
export type AgentEvent = z.infer<typeof AgentEventSchema>;
