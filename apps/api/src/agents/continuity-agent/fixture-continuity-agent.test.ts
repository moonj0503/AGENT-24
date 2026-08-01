import { describe, expect, it } from "vitest";
import {
  ActionPlanSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalSchema,
} from "@continuity/contracts";
import { loadFrozenActionPlanFixture } from "./fixture-continuity-agent.js";
import { ContinuityAgentValidationError, FixtureContinuityAgent } from "./index.js";
import type { ContinuityContext } from "./types.js";

const input: ContinuityContext = {
  goal: GoalSchema.parse({
    goalId: "goal-001",
    title: "Write the final project report",
    path: ["Final Project", "Report Writing", "QR Factorization"],
    status: "IN_PROGRESS",
    source: "USER_CONFIRMED",
    confidence: 0.84,
  }),
  checkpoint: CheckpointSchema.parse({
    checkpointId: "checkpoint-001",
    goalId: "goal-001",
    currentState: "Drafting the QR factorization stability section.",
    completedSincePrevious: ["Collected numerical stability references"],
    openQuestions: ["Which example best demonstrates the stability difference?"],
    likelyNextActions: [{ title: "Outline the next paragraph", estimatedMinutes: 10 }],
    relatedResources: [{ title: "QR Factorization Stability", kind: "WEB_PAGE" }],
    confidence: 0.9,
    createdAt: "2026-08-01T09:05:00.000Z",
  }),
  gapSession: GapSessionSchema.parse({
    gapId: "gap-001",
    workSessionId: "work-session-001",
    goalId: "goal-001",
    checkpointId: "checkpoint-001",
    status: "PLANNING",
    startedAt: "2026-08-01T09:10:00.000Z",
  }),
};

describe("FixtureContinuityAgent", () => {
  it("returns the frozen contract-valid action plan", async () => {
    const result = await new FixtureContinuityAgent().run(input);
    const frozenFixture = ActionPlanSchema.parse(await loadFrozenActionPlanFixture());

    expect(ActionPlanSchema.parse(result)).toEqual(result);
    expect(result).toEqual(frozenFixture);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.gapId).toBe(frozenFixture.gapId);
    expect(result.continuityObjective).toBe(frozenFixture.continuityObjective);
    expect(result.actions).toEqual(frozenFixture.actions);
  });

  it("preserves the high-risk email action for later policy evaluation", async () => {
    const result = await new FixtureContinuityAgent().run(input);
    const emailAction = result.actions.find((action) => action.type === "SEND_EMAIL");

    expect(emailAction).toMatchObject({
      riskLevel: "HIGH",
      reversible: false,
      status: "POLICY_CHECKING",
    });
  });

  it("does not let caller mutation affect a later run", async () => {
    const interpreter = new FixtureContinuityAgent();
    const first = await interpreter.run(input);
    const originalTitle = first.actions[0]?.title;
    if (!first.actions[0]) throw new Error("Expected the frozen fixture to contain an action.");
    first.actions[0].title = "locally changed";

    const second = await interpreter.run(input);
    expect(second.actions[0]?.title).toBe(originalTitle);
  });

  it("rejects invalid fixture output with an identifiable validation error", async () => {
    const interpreter = new FixtureContinuityAgent(async () => ({ actions: [] }));

    await expect(interpreter.run(input)).rejects.toBeInstanceOf(ContinuityAgentValidationError);
  });

  it("returns equivalent output and does not mutate its input", async () => {
    const interpreter = new FixtureContinuityAgent();
    const inputSnapshot = structuredClone(input);

    expect(await interpreter.run(input)).toEqual(await interpreter.run(input));
    expect(input).toEqual(inputSnapshot);
  });
});
