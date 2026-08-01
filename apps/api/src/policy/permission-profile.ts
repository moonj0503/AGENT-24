import type { PlannedAction } from "@continuity/contracts";

export type PermissionDecision = "AUTO" | "ASK" | "NEVER";
export type ActionType = PlannedAction["type"];

export interface PermissionProfile { readonly rules: Readonly<Record<ActionType, PermissionDecision>>; }

export const defaultPermissionProfile: PermissionProfile = {
  rules: {
    CREATE_CHECKPOINT: "AUTO",
    CREATE_TODO_DRAFT: "AUTO",
    CREATE_MESSAGE_DRAFT: "AUTO",
    ORGANIZE_REFERENCES: "AUTO",
    GENERATE_RECOVERY_BRIEF: "AUTO",
    SEND_EMAIL: "NEVER",
  },
};
