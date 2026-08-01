import type { GoalCandidate, GoalInferenceResult } from "@continuity/contracts";
import type { ActivityEvent } from "@continuity/contracts";
import { apiRequest } from "../../lib/api";
import { invokeNative, isNativeOverlayAvailable } from "../../lib/tauri";

const WORK_SESSION_KEY = "continuity:work-session-id";

export async function fetchGoalInference(): Promise<GoalInferenceResult> {
  if (!isNativeOverlayAvailable()) throw new Error("The native activity observer is unavailable.");
  await invokeNative("get_current_activity");
  const events = await invokeNative("get_recent_activity_events", { limit: 20 }) as ActivityEvent[] | undefined;
  if (!events?.length) throw new Error("No recent activity is available for goal inference.");
  const workSessionId = window.localStorage.getItem(WORK_SESSION_KEY) ?? crypto.randomUUID();
  window.localStorage.setItem(WORK_SESSION_KEY, workSessionId);
  const observation = await apiRequest<{ acceptedEventIds: string[] }>("/observations", { method: "POST", body: JSON.stringify({ workSessionId, events }) });
  return apiRequest<GoalInferenceResult>("/goal-inferences", { method: "POST", body: JSON.stringify({ workSessionId, observationEventIds: observation.acceptedEventIds }) });
}

export function selectGoal(result: GoalInferenceResult, candidateId: string): GoalCandidate {
  const candidate = result.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("That goal candidate is no longer available.");
  return candidate;
}
