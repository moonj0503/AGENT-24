import { z } from "zod";

export const ActivityEventTypeSchema = z.enum([
  "ACTIVE_WINDOW_CHANGED", "APPLICATION_OPENED", "APPLICATION_CLOSED", "DOCUMENT_SAVED",
  "BROWSER_TAB_CHANGED", "USER_ACTIVITY", "USER_IDLE", "CALENDAR_EVENT_APPROACHING", "MANUAL_CHECKPOINT",
]);
export const ActivityEventSchema = z.object({
  eventId: z.string().min(1),
  type: ActivityEventTypeSchema,
  occurredAt: z.string().datetime(),
  application: z.object({ name: z.string().min(1), category: z.enum(["DOCUMENT", "BROWSER", "COMMUNICATION", "OTHER"]) }),
  resource: z.object({ title: z.string().min(1), kind: z.enum(["DOCUMENT", "WEB_PAGE", "CHAT", "OTHER"]) }).optional(),
  metadata: z.object({ idleSeconds: z.number().nonnegative() }),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
