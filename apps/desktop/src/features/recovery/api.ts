import type { RecoveryBrief } from "@continuity/contracts";

const recoveryBrief: RecoveryBrief & { gapDurationSeconds: number } = {
  briefId: "brief-001", gapId: "gap-001",
  gapDurationSeconds: 2280,
  goalBeforeGap: "Final Project / Report Writing / QR Factorization",
  completedActions: ["Created an outline for the next paragraph", "Organized 3 references"],
  pendingActions: ["Message draft awaiting approval"], externalEffects: [],
  recommendedNextAction: { title: "Review the QR stability outline", estimatedMinutes: 10 },
  createdAt: "2026-08-01T09:48:00.000Z",
};

export async function fetchRecoveryBrief(): Promise<RecoveryBrief> {
  return structuredClone(recoveryBrief);
}
