import type { ActionPlan, GapSession } from "@continuity/contracts";

export type GapData = { session: GapSession; plan: ActionPlan };

const gapData: GapData = {
  session: {
    gapId: "gap-001", workSessionId: "ws-001", goalId: "goal-001", checkpointId: "cp-001",
    status: "EXECUTING", startedAt: "2026-08-01T09:10:00.000Z",
  },
  plan: {
    planId: "plan-001", gapId: "gap-001",
    continuityObjective: "Preserve the report-writing workflow and minimize recovery cost.",
    actions: [
      { actionId: "act-001", type: "CREATE_TODO_DRAFT", title: "Draft next-paragraph outline", reason: "Preserve the next writing step.", riskLevel: "LOW", reversible: true, status: "COMPLETED" },
      { actionId: "act-002", type: "CREATE_MESSAGE_DRAFT", title: "Prepare team update", reason: "Keep teammates informed without sending a message.", riskLevel: "MEDIUM", reversible: true, status: "WAITING_APPROVAL" },
      { actionId: "act-003", type: "ORGANIZE_REFERENCES", title: "Organize QR references", reason: "Make relevant references easier to recover.", riskLevel: "LOW", reversible: true, status: "PLANNED" },
    ],
  },
};

/** Read-only fixture access for the development preview; it never starts a gap. */
export function getGapPreviewData(): GapData {
  return structuredClone(gapData);
}

export async function startGap(): Promise<GapData> {
  return structuredClone(gapData);
}

export async function updateAction(actionId: string, status: "COMPLETED" | "REJECTED"): Promise<GapData> {
  const next = structuredClone(gapData);
  const action = next.plan.actions.find((item) => item.actionId === actionId);
  if (!action) throw new Error("Action not found.");
  action.status = status;
  return next;
}
