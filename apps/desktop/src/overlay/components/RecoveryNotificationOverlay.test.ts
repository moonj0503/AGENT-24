import { describe, expect, it } from "vitest";
import type { RecoveryBrief } from "@continuity/contracts";
import { recoveryNotificationSummary } from "./RecoveryNotificationOverlay";

const brief: RecoveryBrief = {
  briefId: "brief-test", gapId: "gap-test", goalBeforeGap: "Write the report", completedActions: ["Outline"], pendingActions: [], externalEffects: [], recommendedNextAction: { title: "Review outline", estimatedMinutes: 10 }, createdAt: "2026-08-01T09:48:00.000Z",
};

describe("recovery notification", () => {
  it("summarizes recovery state for the short overlay", () => {
    expect(recoveryNotificationSummary(brief)).toEqual({ completed: 1, hasExternalEffects: false, nextAction: "Review outline" });
  });
});
