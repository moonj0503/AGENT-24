import { describe, expect, it } from "vitest";
import { GoalInferenceResultSchema, type ActivityEvent } from "@continuity/contracts";
import { FixtureGoalInterpreter, GoalInterpreterValidationError } from "./index.js";
import { loadFrozenGoalFixture } from "./fixture-goal-interpreter.js";
import type { SanitizedGoalContext } from "./types.js";

const input: SanitizedGoalContext = {
  workSessionId: "ws-test",
  events: [] satisfies readonly ActivityEvent[],
};

describe("FixtureGoalInterpreter", () => {
  it("returns the frozen contract-valid goal inference result", async () => {
    const result = await new FixtureGoalInterpreter().run(input);
    const frozenFixture = GoalInferenceResultSchema.parse(await loadFrozenGoalFixture());

    expect(GoalInferenceResultSchema.parse(result)).toEqual(result);
    expect(result).toEqual(frozenFixture);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("preserves evidence and hierarchical paths for every candidate", async () => {
    const result = await new FixtureGoalInterpreter().run(input);

    for (const candidate of result.candidates) {
      expect(candidate.evidence.length).toBeGreaterThan(0);
      expect(candidate.suggestedGoalPath.length).toBeGreaterThan(0);
    }
  });

  it("does not mutate the frozen fixture between runs", async () => {
    const interpreter = new FixtureGoalInterpreter();
    const first = await interpreter.run(input);
    const originalTitle = first.candidates[0]?.title;
    if (!first.candidates[0]) throw new Error("Expected the frozen fixture to contain a candidate.");
    first.candidates[0].title = "locally changed";

    const second = await interpreter.run(input);
    expect(second.candidates[0]?.title).toBe(originalTitle);
  });

  it("rejects invalid fixture output with an identifiable validation error", async () => {
    const interpreter = new FixtureGoalInterpreter(async () => ({ candidates: [] }));

    await expect(interpreter.run(input)).rejects.toBeInstanceOf(GoalInterpreterValidationError);
  });

  it("returns equivalent output for repeated runs", async () => {
    const interpreter = new FixtureGoalInterpreter();

    expect(await interpreter.run(input)).toEqual(await interpreter.run(input));
  });
});
