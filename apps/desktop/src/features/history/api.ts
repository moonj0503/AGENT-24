import { GapHistoryDetailSchema, GapHistoryListResponseSchema } from "@continuity/contracts";
import { apiRequest } from "../../lib/api";
export async function fetchGapHistory() { return GapHistoryListResponseSchema.parse(await apiRequest("/gaps")); }
export async function fetchGapHistoryDetail(gapId: string) { return GapHistoryDetailSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(gapId)}`)); }
