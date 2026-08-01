import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalInferenceResultSchema } from "@continuity/contracts";
import { ApiError } from "../../lib/api";
import { confirmGoal } from "./api";

const inference = GoalInferenceResultSchema.parse({
  inferenceId: "inference-1",
  candidates: [{ candidateId: "candidate-1", title: "Write report", description: "Report work", confidence: 0.9, evidence: [{ type: "RESOURCE", description: "Report" }], suggestedGoalPath: ["Project", "Report"] }],
  requiresConfirmation: true,
  inferenceSummary: "Report work may be active.",
});
const goal = {
  goalId: "candidate-1", title: "Write report", path: ["Project", "Report"],
  status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.9,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("confirmGoal", () => {
  it("sends the exact candidate confirmation contract with shared idempotency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(goal, 201));
    vi.stubGlobal("fetch", fetchMock);
    await expect(confirmGoal(inference, "candidate-1")).resolves.toEqual(goal);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toEqual({
      inferenceId: "inference-1",
      selection: { type: "CANDIDATE", candidateId: "candidate-1" },
    });
    expect(init.headers).toMatchObject({ "idempotency-key": expect.any(String) });
  });

  it("rejects malformed responses and surfaces API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ goalId: "invalid" }, 201)));
    await expect(confirmGoal(inference, "candidate-1")).rejects.toMatchObject({ name: "ZodError" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ message: "Inference expired" }, 404)));
    await expect(confirmGoal(inference, "candidate-1")).rejects.toBeInstanceOf(ApiError);
  });
});
