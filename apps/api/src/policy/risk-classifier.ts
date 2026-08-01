import type { PlannedAction } from "@continuity/contracts";

const riskByType: Readonly<Record<PlannedAction["type"], PlannedAction["riskLevel"]>> = {
  CREATE_CHECKPOINT: "LOW",
  CREATE_TODO_DRAFT: "LOW",
  CREATE_MESSAGE_DRAFT: "LOW",
  ORGANIZE_REFERENCES: "LOW",
  GENERATE_RECOVERY_BRIEF: "LOW",
  SEND_EMAIL: "HIGH",
};

export function classifyRisk(action: Pick<PlannedAction, "type">): PlannedAction["riskLevel"] {
  return riskByType[action.type];
}
