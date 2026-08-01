import { afterEach, expect, it, vi } from "vitest";
import { GapSessionSchema, GoalSchema } from "@continuity/contracts";
import { createCheckpoint, createGapSession, decideGapAction, endGapSession, runGap } from "./api";

afterEach(() => vi.unstubAllGlobals());
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });

it("propagates backend IDs and uses contract approval decisions with idempotent mutations", async () => {
  const goal = GoalSchema.parse({ goalId: "goal-backend", title: "Integrate", path: ["Project", "Integrate"], status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.9 });
  const checkpoint = { checkpointId: "checkpoint-backend", goalId: goal.goalId, currentState: "Ready", completedSincePrevious: [], openQuestions: [], likelyNextActions: [], relatedResources: [], confidence: 0.9, createdAt: "2026-08-02T00:00:00.000Z" };
  const gap = GapSessionSchema.parse({ gapId: "gap-backend", workSessionId: "session-backend", goalId: goal.goalId, checkpointId: checkpoint.checkpointId, status: "PLANNING", startedAt: "2026-08-02T00:01:00.000Z" });
  const action = { actionId: "action-backend", type: "CREATE_TODO_DRAFT", title: "Draft", reason: "Preserve", riskLevel: "LOW", reversible: true, status: "REJECTED" };
  const plan = { planId: "plan-backend", gapId: gap.gapId, continuityObjective: "Preserve", actions: [action] };
  const brief = { briefId: "brief-backend", gapId: gap.gapId, goalBeforeGap: "Project / Integrate", completedActions: [], pendingActions: [], externalEffects: [], recommendedNextAction: { title: "Resume", estimatedMinutes: 5 }, createdAt: "2026-08-02T00:02:00.000Z" };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(checkpoint)).mockResolvedValueOnce(json(gap))
    .mockResolvedValueOnce(json({ actionPlan: plan, actionResults: [], recoveryBrief: brief }))
    .mockResolvedValueOnce(json(action)).mockResolvedValueOnce(json({ ...gap, status: "COMPLETED", endedAt: "2026-08-02T00:03:00.000Z" }));
  vi.stubGlobal("fetch", fetchMock);
  const returnedCheckpoint = await createCheckpoint(goal);
  const returnedGap = await createGapSession("session-backend", goal.goalId, returnedCheckpoint.checkpointId);
  await runGap(returnedGap);
  await decideGapAction(returnedGap.gapId, "action-backend", "REJECT", "User rejected the action.");
  await endGapSession(returnedGap.gapId);
  const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
  expect(calls.map(([url]) => url)).toEqual(expect.arrayContaining([expect.stringContaining("/gaps/gap-backend/run"), expect.stringContaining("/actions/action-backend/approval"), expect.stringContaining("/gaps/gap-backend/end")]));
  expect(JSON.parse(String(calls[1]?.[1].body))).toEqual({ workSessionId: "session-backend", goalId: "goal-backend", checkpointId: "checkpoint-backend" });
  expect(JSON.parse(String(calls[3]?.[1].body))).toMatchObject({ decision: "REJECT" });
  for (const [, init] of calls) expect(new Headers(init.headers).get("idempotency-key")).toBeTruthy();
});
