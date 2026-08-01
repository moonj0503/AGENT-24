import { describe, expect, it } from "vitest";
import { ActivityEventSchema, GoalInferenceResultSchema } from "../src/index.js";

describe("shared contracts", () => {
  it("accepts a sanitized activity event and rejects an invalid timestamp", () => {
    const event = {
      eventId: "evt-001",
      type: "ACTIVE_WINDOW_CHANGED",
      occurredAt: "2026-08-01T09:00:00.000Z",
      application: { name: "Microsoft Word", category: "DOCUMENT" },
      metadata: { idleSeconds: 0 },
    };

    expect(ActivityEventSchema.safeParse(event).success).toBe(true);
    expect(ActivityEventSchema.safeParse({ ...event, occurredAt: 1 }).success).toBe(false);
  });

  it("requires one to three ranked goal candidates", () => {
    const candidate = {
      candidateId: "goal-001",
      title: "Write the final project report",
      description: "Draft the QR factorization stability section.",
      confidence: 0.84,
      evidence: [{ type: "RESOURCE", description: "Final Project Report.docx" }],
      suggestedGoalPath: ["Final Project", "Report Writing"],
    };

    expect(GoalInferenceResultSchema.safeParse({
      inferenceId: "inf-001", candidates: [candidate], requiresConfirmation: true, inferenceSummary: "Report work detected.",
    }).success).toBe(true);
    expect(GoalInferenceResultSchema.safeParse({
      inferenceId: "inf-001", candidates: [], requiresConfirmation: true, inferenceSummary: "Report work detected.",
    }).success).toBe(false);
  });
});
