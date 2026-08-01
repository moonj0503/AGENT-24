import { expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const observationPayload = {
  workSessionId: "ws-001",
  events: [
    {
      eventId: "evt-001",
      type: "ACTIVE_WINDOW_CHANGED",
      occurredAt: "2026-08-01T09:00:00.000Z",
      application: { name: "Microsoft Word", category: "DOCUMENT" },
      resource: { title: "Final Project Report.docx", kind: "DOCUMENT" },
      metadata: { idleSeconds: 0 },
    },
    {
      eventId: "evt-002",
      type: "BROWSER_TAB_CHANGED",
      occurredAt: "2026-08-01T09:04:00.000Z",
      application: { name: "Google Chrome", category: "BROWSER" },
      resource: { title: "QR Factorization Stability", kind: "WEB_PAGE" },
      metadata: { idleSeconds: 0 },
    },
  ],
};

it("runs observations through goal inference and goal confirmation", async () => {
  const app = buildApp();

  const observation = await app.inject({
    method: "POST",
    url: "/api/v1/observations",
    headers: { "idempotency-key": "observations-001" },
    payload: observationPayload,
  });
  expect(observation.statusCode).toBe(201);
  expect(observation.json()).toEqual({
    workSessionId: "ws-001",
    acceptedEventIds: ["evt-001", "evt-002"],
  });

  const inference = await app.inject({
    method: "POST",
    url: "/api/v1/goal-inferences",
    headers: { "idempotency-key": "goal-inference-001" },
    payload: {
      workSessionId: "ws-001",
      observationEventIds: ["evt-001", "evt-002"],
    },
  });
  expect(inference.statusCode).toBe(200);
  expect(inference.json()).toMatchObject({
    inferenceId: "inf-001",
    requiresConfirmation: true,
  });

  const goal = await app.inject({
    method: "POST",
    url: "/api/v1/goals/confirm",
    headers: { "idempotency-key": "goal-confirm-001" },
    payload: {
      inferenceId: "inf-001",
      selection: { type: "CANDIDATE", candidateId: "goal-001" },
    },
  });
  expect(goal.statusCode).toBe(201);
  expect(goal.json()).toMatchObject({
    goalId: "goal-001",
    status: "IN_PROGRESS",
    source: "USER_CONFIRMED",
  });

  await app.close();
});

it("requires an Idempotency-Key for state-changing requests", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/observations",
    payload: observationPayload,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({
    code: "IDEMPOTENCY_KEY_REQUIRED",
    retryable: false,
  });
  await app.close();
});

it("replays the original response for the same key and request", async () => {
  const app = buildApp();
  const request = {
    method: "POST" as const,
    url: "/api/v1/observations",
    headers: { "idempotency-key": "observations-replay-001" },
    payload: observationPayload,
  };

  const first = await app.inject(request);
  const replay = await app.inject(request);

  expect(first.statusCode).toBe(201);
  expect(replay.statusCode).toBe(201);
  expect(replay.headers["idempotency-replayed"]).toBe("true");
  expect(replay.body).toBe(first.body);
  await app.close();
});

it("rejects a reused key with a different request body", async () => {
  const app = buildApp();
  const headers = { "idempotency-key": "observations-conflict-001" };

  await app.inject({ method: "POST", url: "/api/v1/observations", headers, payload: observationPayload });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/observations",
    headers,
    payload: {
      ...observationPayload,
      workSessionId: "ws-002",
    },
  });

  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({
    code: "IDEMPOTENCY_KEY_REUSED",
    retryable: false,
  });
  await app.close();
});
