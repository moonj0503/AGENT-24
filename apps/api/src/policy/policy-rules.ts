import type { PlannedAction } from "@continuity/contracts";

export const downgradeRules: Readonly<Partial<Record<PlannedAction["type"], PlannedAction["type"]>>> = {
  SEND_EMAIL: "CREATE_MESSAGE_DRAFT",
};
