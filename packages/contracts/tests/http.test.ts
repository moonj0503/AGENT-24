import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ActionApprovalParamsSchema,
  ActionApprovalRequestSchema,
  ConfirmGoalRequestSchema,
  CreateCheckpointRequestSchema,
  EndGapParamsSchema,
  EndGapRequestSchema,
  GoalInferenceRequestSchema,
  IdempotencyKeySchema,
  ObservationIngestionResultSchema,
  ObservationRequestSchema,
  StartGapRequestSchema,
  RunGapRecoveryParamsSchema,
  RunGapRecoveryRequestSchema,
  RunGapRecoveryResponseSchema,
  StartGapResponseSchema,
  EndGapResponseSchema,
  ActionPlanSchema,
  ActionResultSchema,
  RecoveryBriefSchema,
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

  it("validates server-generated Checkpoints and Gap lifecycle responses", () => {
    expect(CreateCheckpointRequestSchema.safeParse({
      goalId: "goal-001",
      currentState: "Writing the report.",
      completedSincePrevious: [],
      openQuestions: [],
      likelyNextActions: [{ title: "Review the draft", estimatedMinutes: 10 }],
      relatedResources: [{ title: "Report.docx", kind: "DOCUMENT" }],
      confidence: 0.8,
    }).success).toBe(true);
    const gap = {
      gapId: "gap-001",
      workSessionId: "ws-001",
      goalId: "goal-001",
      checkpointId: "checkpoint-001",
      status: "PLANNING",
      startedAt: "2026-08-01T09:10:00.000Z",
    };
    expect(StartGapResponseSchema.safeParse(gap).success).toBe(true);
    expect(EndGapResponseSchema.safeParse({
      ...gap,
      status: "COMPLETED",
      endedAt: "2026-08-01T09:20:00.000Z",
    }).success).toBe(true);
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

  it("validates the confirmed-gap runtime request and response", () => {
    expect(RunGapRecoveryParamsSchema.safeParse({ gapId: "gap-001" }).success).toBe(true);
    expect(RunGapRecoveryRequestSchema.safeParse({
      goalId: "goal-001",
      checkpointId: "checkpoint-001",
    }).success).toBe(true);
    expect(RunGapRecoveryRequestSchema.safeParse({ goalId: "goal-001" }).success).toBe(false);
    expect(RunGapRecoveryResponseSchema.safeParse({
      actionPlan: ActionPlanSchema.parse(fixture("action-plan.json")),
      actionResults: [ActionResultSchema.parse({
        actionId: "act-001",
        status: "COMPLETED",
        summary: "TODO draft created.",
        externalEffect: "NONE",
        occurredAt: "2026-08-01T09:30:00.000Z",
      })],
      recoveryBrief: RecoveryBriefSchema.parse(fixture("recovery-brief.json")),
    }).success).toBe(true);
  });
});
