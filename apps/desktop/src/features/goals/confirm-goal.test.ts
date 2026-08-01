import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmGoal } from "./api";

describe("confirmGoal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("confirms the selected candidate through the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      goalId: "goal-1", title: "Write report", path: ["Report"], status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.9,
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(confirmGoal("inf-1", "candidate-1")).resolves.toMatchObject({ goalId: "goal-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/goals/confirm",
      expect.objectContaining({ body: JSON.stringify({ inferenceId: "inf-1", selection: { type: "CANDIDATE", candidateId: "candidate-1" } }) }),
    );
  });
});
