import { ActivityEventSchema, type ActivityEvent } from "@continuity/contracts";
import { invokeNative } from "../../lib/tauri";

export async function collectSanitizedActivity(): Promise<ActivityEvent | null> {
  const value = await invokeNative("get_current_activity");
  if (value === undefined || value === null) return null;
  return ActivityEventSchema.parse(value);
}
