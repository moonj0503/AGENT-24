import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionPlan, GapSession } from "@continuity/contracts";
import { startGap, updateAction, type GapData } from "./api";

const session: GapSession = { gapId: "gap-1", workSessionId: "work-1", goalId: "goal-1", checkpointId: "checkpoint-1", status: "PLANNING", startedAt: "2026-08-01T09:00:00.000Z" };
const plan: ActionPlan = { planId: "plan-1", gapId: "gap-1", continuityObjective: "Preserve context", actions: [{ actionId: "action-1", type: "CREATE_MESSAGE_DRAFT", title: "Draft", reason: "Preserve context", riskLevel: "MEDIUM", reversible: true, status: "WAITING_APPROVAL" }] };
const gap: GapData = { session, plan };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("Gap API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a checkpoint before it starts the Gap", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ checkpointId: "checkpoint-1", goalId: "goal-1", currentState: "Writing report", completedSincePrevious: [], openQuestions: [], likelyNextActions: [{ title: "Write next paragraph", estimatedMinutes: 10 }], relatedResources: [{ title: "Report.docx", kind: "DOCUMENT" }], confidence: 0.9, createdAt: "2026-08-01T09:00:00.000Z" }))
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(jsonResponse({ actionPlan: plan, actionResults: [], recoveryBrief: { briefId: "brief-1", gapId: "gap-1", goalBeforeGap: "Report", completedActions: [], pendingActions: [], externalEffects: [], recommendedNextAction: { title: "Resume", estimatedMinutes: 5 }, createdAt: "2026-08-01T09:31:00.000Z" } }));
    vi.stubGlobal("fetch", fetchMock);

    await startGap({ workSessionId: "work-1", goalId: "goal-1", currentState: "Writing report", completedSincePrevious: [], openQuestions: [], likelyNextActions: [{ title: "Write next paragraph", estimatedMinutes: 10 }], relatedResources: [{ title: "Report.docx", kind: "DOCUMENT" }], confidence: 0.9 } as never);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4000/api/v1/checkpoints", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:4000/api/v1/gaps/gap-1/run", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:4000/api/v1/gaps", expect.anything());
  });

  it("replaces only the action returned by the approval endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...plan.actions[0], status: "EXECUTING" }));
    vi.stubGlobal("fetch", fetchMock);

    const next = await updateAction(gap, "action-1", "APPROVE" as never);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/v1/gaps/gap-1/actions/action-1/approval", expect.anything());
    expect(next.plan.actions).toEqual([{ ...plan.actions[0], status: "EXECUTING" }]);
  });
});
