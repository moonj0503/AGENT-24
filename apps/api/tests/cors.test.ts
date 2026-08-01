import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("desktop API CORS", () => {
  it.each(["http://tauri.localhost", "tauri://localhost", "http://localhost:5173"])(
    "accepts preflight from %s",
    async (origin) => {
      const app = buildApp();
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/observations",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,idempotency-key",
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-headers"]).toContain("idempotency-key");
      await app.close();
    },
  );

  it("rejects preflight from an unrelated web origin", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "OPTIONS", url: "/api/v1/observations", headers: { origin: "https://example.com", "access-control-request-method": "POST" } });
    expect(response.statusCode).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});
