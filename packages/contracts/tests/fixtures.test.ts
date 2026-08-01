import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { GoalInferenceResultSchema } from "../src/index.js";

it("validates the frozen goal-candidates fixture", () => {
  const fixturePath = resolve(import.meta.dirname, "../src/fixtures/goal-candidates.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  expect(GoalInferenceResultSchema.safeParse(fixture).success).toBe(true);
});
