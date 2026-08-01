import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends JSON and an idempotency key for a mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ goalId: "goal-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/goals/confirm", { method: "POST", body: JSON.stringify({ inferenceId: "inf-1" }) });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/goals\/confirm$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        }),
      }),
    );
  });

  it("uses the API error message for a non-success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Goal not found" }, 404)));

    await expect(apiRequest("/goals/missing")).rejects.toEqual(expect.objectContaining({
      message: "Goal not found",
    }));
    await expect(apiRequest("/goals/missing")).rejects.toBeInstanceOf(ApiError);
  });

  it("uses an explicit idempotency key without changing the mutation default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/observations", { method: "POST", body: "{}" }, "observation:stable");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": "observation:stable" });
  });
});
