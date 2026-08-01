import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ActionApprovalParamsSchema,
  ActionApprovalRequestSchema,
  ConfirmGoalRequestSchema,
  EndGapParamsSchema,
  EndGapRequestSchema,
  GoalInferenceRequestSchema,
  IdempotencyKeySchema,
  ObservationIngestionResultSchema,
  ObservationRequestSchema,
  StartGapRequestSchema,
} from "../src/index.js";

const fixture = (name: string) => JSON.parse(readFileSync(
  resolve(import.meta.dirname, `../src/fixtures/${name}`),
  "utf8",
));

describe("HTTP request contracts", () => {
  it("accepts the observation and goal inference request fixtures", () => {
    expect(ObservationRequestSchema.safeParse(fixture("observation-request.json")).success).toBe(true);
    expect(ObservationIngestionResultSchema.safeParse(fixture("observation-result.json")).success).toBe(true);
    expect(GoalInferenceRequestSchema.safeParse(fixture("goal-inference-request.json")).success).toBe(true);
  });

  it("supports selecting an inferred goal or entering a manual correction", () => {
    expect(ConfirmGoalRequestSchema.safeParse(fixture("confirm-goal-candidate-request.json")).success).toBe(true);
    expect(ConfirmGoalRequestSchema.safeParse(fixture("confirm-goal-manual-request.json")).success).toBe(true);
  });

  it("accepts gap start, approval, and gap end requests", () => {
    expect(StartGapRequestSchema.safeParse(fixture("start-gap-request.json")).success).toBe(true);
    expect(ActionApprovalRequestSchema.safeParse(fixture("action-approval-request.json")).success).toBe(true);
    expect(ActionApprovalRequestSchema.safeParse(fixture("action-rejection-request.json")).success).toBe(true);
    expect(EndGapRequestSchema.safeParse(fixture("end-gap-request.json")).success).toBe(true);
  });

  it("requires a reason when an action is rejected", () => {
    expect(ActionApprovalRequestSchema.safeParse({ decision: "REJECT" }).success).toBe(false);
  });

  it("validates path parameters and idempotency keys", () => {
    expect(ActionApprovalParamsSchema.safeParse({ gapId: "gap-001", actionId: "act-002" }).success).toBe(true);
    expect(EndGapParamsSchema.safeParse({ gapId: "gap-001" }).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("demo-request-001").success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("").success).toBe(false);
  });
});
