import { ActivityEventSchema, type ActivityEvent } from "@continuity/contracts";
import { invokeNative } from "../../lib/tauri";

export async function readRecentActivityEvents(): Promise<ActivityEvent[]> {
  const result = await invokeNative("get_recent_activity_events", { limit: 50 });
  return ActivityEventSchema.array().parse(result);
}

