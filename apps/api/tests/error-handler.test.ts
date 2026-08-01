import { expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { ApiHttpError } from "../src/plugins/error-handler.js";

it("converts Fastify validation errors to ApiError responses", async () => {
  const app = buildApp();
  app.post("/api/v1/test/validation", {
    schema: {
      body: {
        type: "object",
        required: ["goalId"],
        properties: { goalId: { type: "string" } },
      },
    },
  }, async () => ({ ok: true }));

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/test/validation",
    payload: {},
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({
    code: "VALIDATION_ERROR",
    retryable: false,
    details: {
      fields: [{ path: ["goalId"] }],
    },
  });
  expect(response.json().requestId).toEqual(expect.any(String));
  await app.close();
});

it("converts a typed application error to an ApiError response", async () => {
  const app = buildApp();
  app.get("/api/v1/test/not-found", async () => {
    throw new ApiHttpError("NOT_FOUND", "Goal goal-001 was not found.");
  });

  const response = await app.inject({ method: "GET", url: "/api/v1/test/not-found" });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({
    code: "NOT_FOUND",
    message: "Goal goal-001 was not found.",
    retryable: false,
  });
  await app.close();
});

it("hides unexpected internal error details", async () => {
  const app = buildApp();
  app.get("/api/v1/test/internal", async () => {
    throw new Error("database password=do-not-expose");
  });

  const response = await app.inject({ method: "GET", url: "/api/v1/test/internal" });

  expect(response.statusCode).toBe(500);
  expect(response.json()).toMatchObject({
    code: "INTERNAL_ERROR",
    message: "Internal server error.",
    retryable: false,
  });
  expect(response.body).not.toContain("do-not-expose");
  await app.close();
});

it("converts an unknown route to a not-found ApiError", async () => {
  const app = buildApp();

  const response = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({
    code: "NOT_FOUND",
    retryable: false,
  });
  await app.close();
});
