import { describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  ActionResultSchema,
  GapSessionSchema,
  GoalSchema,
  RecoveryBriefSchema,
} from "@continuity/contracts";
import {
  FixtureRecoveryGenerator,
  RecoveryGeneratorValidationError,
} from "./index.js";
import { loadFrozenRecoveryBriefFixture } from "./fixture-recovery-generator.js";
import type { RecoveryContext } from "./types.js";

const input: RecoveryContext = {
  goal: GoalSchema.parse({
    goalId: "goal-001",
    title: "Write the final project report",
    path: ["Final Project", "Report Writing", "QR Factorization"],
    status: "IN_PROGRESS",
    source: "USER_CONFIRMED",
    confidence: 0.84,
  }),
  gapSession: GapSessionSchema.parse({
    gapId: "gap-001",
    workSessionId: "work-session-001",
    goalId: "goal-001",
    checkpointId: "checkpoint-001",
    status: "RECOVERING",
    startedAt: "2026-08-01T09:10:00.000Z",
  }),
  actionPlan: ActionPlanSchema.parse({
    planId: "plan-001",
    gapId: "gap-001",
    continuityObjective: "Preserve progress during the gap.",
    actions: [
      {
        actionId: "action-001",
        type: "CREATE_CHECKPOINT",
        title: "Create a checkpoint",
        reason: "Preserve current progress.",
        riskLevel: "LOW",
        reversible: true,
        status: "COMPLETED",
      },
    ],
  }),
  actionResults: [
    ActionResultSchema.parse({
      actionId: "action-001",
      status: "COMPLETED",
      summary: "Created an internal checkpoint.",
      externalEffect: "NONE",
      occurredAt: "2026-08-01T09:20:00.000Z",
    }),
  ],
};

describe("FixtureRecoveryGenerator", () => {
  it("returns a contract-valid recovery brief contextualized to the current Gap", async () => {
    const result = await new FixtureRecoveryGenerator().run(input);
    const frozenFixture = RecoveryBriefSchema.parse(await loadFrozenRecoveryBriefFixture());

    expect(RecoveryBriefSchema.parse(result)).toEqual(result);
    expect(result).toEqual({
      ...frozenFixture,
      briefId: `brief-${input.gapSession.gapId}`,
      gapId: input.gapSession.gapId,
      goalBeforeGap: input.goal.path.join(" → "),
    });
    expect(result.briefId).toBe(`brief-${input.gapSession.gapId}`);
    expect(result.gapId).toBe(input.gapSession.gapId);
    expect(result.goalBeforeGap).toBe(input.goal.path.join(" → "));
    expect(result.completedActions).toEqual(frozenFixture.completedActions);
    expect(result.pendingActions).toEqual(frozenFixture.pendingActions);
    expect(result.externalEffects).toEqual([]);
    expect(result.recommendedNextAction).toEqual(frozenFixture.recommendedNextAction);
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
  });

  it("does not reuse the fixture Gap identifier for another GapSession", async () => {
    const otherGapId = "gap-runtime-002";
    const result = await new FixtureRecoveryGenerator().run({
      ...input,
      gapSession: { ...input.gapSession, gapId: otherGapId },
    });

    expect(result).toMatchObject({
      briefId: `brief-${otherGapId}`,
      gapId: otherGapId,
    });
  });

  it("returns fresh data so caller mutation does not affect a later run", async () => {
    const generator = new FixtureRecoveryGenerator();
    const first = await generator.run(input);
    const originalCompletedAction = first.completedActions[0];
    first.completedActions[0] = "locally changed";
    first.recommendedNextAction.title = "locally changed";

    const second = await generator.run(input);
    expect(second.completedActions[0]).toBe(originalCompletedAction);
    expect(second.recommendedNextAction.title).toBe("Review the QR stability outline");
  });

  it("rejects invalid fixture output with an identifiable validation error and cause", async () => {
    const generator = new FixtureRecoveryGenerator(async () => ({ completedActions: [] }));

    await expect(generator.run(input)).rejects.toMatchObject({
      name: "RecoveryGeneratorValidationError",
      cause: expect.any(Error),
    });
    await expect(generator.run(input)).rejects.toBeInstanceOf(RecoveryGeneratorValidationError);
  });

  it("returns equivalent output for repeated runs without mutating the input context", async () => {
    const generator = new FixtureRecoveryGenerator();
    const inputSnapshot = structuredClone(input);

    expect(await generator.run(input)).toEqual(await generator.run(input));
    expect(input).toEqual(inputSnapshot);
  });

  it("loads the recovery fixture and reads only the context needed to assign identifiers", async () => {
    const fixture = await loadFrozenRecoveryBriefFixture();
    const loadFixture = vi.fn(async () => fixture);
    const generator = new FixtureRecoveryGenerator(loadFixture);
    const guardedInput = new Proxy(input, {
      get(target, property) {
        if (property === "goal" || property === "gapSession") {
          return Reflect.get(target, property);
        }
        throw new Error("The fixture generator must not orchestrate context dependencies.");
      },
    });

    await expect(generator.run(guardedInput)).resolves.toEqual({
      ...RecoveryBriefSchema.parse(fixture),
      briefId: `brief-${input.gapSession.gapId}`,
      gapId: input.gapSession.gapId,
      goalBeforeGap: input.goal.path.join(" → "),
    });

    expect(loadFixture).toHaveBeenCalledOnce();
    expect(loadFixture).toHaveBeenCalledWith();
  });
});
