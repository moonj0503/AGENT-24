import { afterEach, describe, expect, it, vi } from "vitest";
import type { GapData } from "../gap/api";
import { endGap } from "../gap/api";

const gap = {
  session: { gapId: "gap-1", workSessionId: "work-1", goalId: "goal-1", checkpointId: "checkpoint-1", status: "COMPLETED", startedAt: "2026-08-01T09:00:00.000Z", endedAt: "2026-08-01T09:30:00.000Z" },
  plan: { planId: "plan-1", gapId: "gap-1", continuityObjective: "Preserve context", actions: [{ actionId: "action-1", type: "CREATE_TODO_DRAFT", title: "Draft", reason: "Preserve", riskLevel: "LOW", reversible: true, status: "COMPLETED" }] },
  recoveryBrief: { briefId: "brief-1", gapId: "gap-1", goalBeforeGap: "Report", completedActions: [], pendingActions: [], externalEffects: [], recommendedNextAction: { title: "Resume", estimatedMinutes: 5 }, createdAt: "2026-08-01T09:31:00.000Z" },
} as GapData;

describe("endGap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ends the Gap without generating a second recovery result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(gap.session), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await endGap(gap);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/v1/gaps/gap-1/end", expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
