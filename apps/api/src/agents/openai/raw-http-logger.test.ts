import { describe, expect, it, vi } from "vitest";
import { createRawLoggingFetch } from "./raw-http-logger.js";

describe("raw OpenAI HTTP logger", () => {
  it("prints raw request and response bodies without printing authorization", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const transport = vi.fn(async () =>
      new Response('{"output":"raw response"}', {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "request-1" },
      }),
    );
    const loggedFetch = createRawLoggingFetch(transport as typeof fetch);

    const response = await loggedFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: '{"input":"raw request"}',
    });
    await response.text();
    await vi.waitFor(() => {
      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      expect(output).toContain('{"input":"raw request"}');
      expect(output).toContain('{"output":"raw response"}');
      expect(output).toContain("x-request-id");
      expect(output).not.toContain("Bearer secret");
      expect(output).not.toContain('"authorization"');
    });
  });
});
