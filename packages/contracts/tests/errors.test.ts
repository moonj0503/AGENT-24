import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema } from "../src/index.js";

const fixture = (name: string) => JSON.parse(readFileSync(
  resolve(import.meta.dirname, `../src/fixtures/${name}`),
  "utf8",
));

describe("API error contracts", () => {
  it("validates representative error fixtures", () => {
    const fixtures = [
      "error-validation.json",
      "error-not-found.json",
      "error-agent-failure.json",
      "error-invalid-state.json",
    ];

    for (const name of fixtures) {
      expect(ApiErrorSchema.safeParse(fixture(name)).success).toBe(true);
    }
  });

  it("supports field-level validation details", () => {
    const result = ApiErrorSchema.safeParse(fixture("error-validation.json"));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.details?.fields[0]?.path).toEqual(["reason"]);
    }
  });

  it("rejects unknown codes and incomplete errors", () => {
    expect(ApiErrorSchema.safeParse({
      code: "UNKNOWN_ERROR",
      message: "Unknown",
      retryable: false,
    }).success).toBe(false);

    expect(ApiErrorSchema.safeParse({
      code: "INTERNAL_ERROR",
      message: "",
      retryable: false,
    }).success).toBe(false);

    expect(ApiErrorSchema.safeParse({
      code: "INTERNAL_ERROR",
      message: "Internal error",
    }).success).toBe(false);
  });
});
