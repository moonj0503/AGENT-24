import { describe, expect, it } from "vitest";
import { ExponentialBackoff } from "./backoff";
describe("exponential backoff", () => {
  it("increases, caps, enters slow mode, and resets", () => {
    const value = new ExponentialBackoff({ initialDelayMs: 2, multiplier: 2, maximumDelayMs: 8, maximumAttempts: 3, slowModeIntervalMs: 20 });
    expect([value.fail(0), value.fail(0), value.fail(0), value.fail(0)]).toEqual([2, 4, 8, 20]);
    value.reset(); expect(value.fail(0)).toBe(2);
  });
});
