import { expect, it } from "vitest";
import { buildApp } from "../src/app.js";

it("waits for and replays an in-progress request with the same key and body", async () => {
  const app = buildApp();
  let executions = 0;
  app.post("/api/v1/test/delayed", async () => {
    executions += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    return { execution: executions };
  });

  const request = {
    method: "POST" as const,
    url: "/api/v1/test/delayed",
    headers: { "idempotency-key": "in-progress-001" },
    payload: { value: "same" },
  };

  const [first, duplicate] = await Promise.all([
    app.inject(request),
    app.inject(request),
  ]);

  expect(executions).toBe(1);
  expect(first.statusCode).toBe(200);
  expect(duplicate.statusCode).toBe(200);
  expect([first.headers["idempotency-replayed"], duplicate.headers["idempotency-replayed"]]).toContain("true");
  expect(first.body).toBe(duplicate.body);
  await app.close();
});
