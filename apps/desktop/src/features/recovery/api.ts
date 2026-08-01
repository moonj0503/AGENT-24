import { RecoveryBriefSchema, type RecoveryBrief } from "@continuity/contracts";
import { apiRequest } from "../../lib/api";
export async function fetchRecoveryBrief(gapId: string): Promise<RecoveryBrief> {
  return RecoveryBriefSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(gapId)}/recovery-brief`));
}
