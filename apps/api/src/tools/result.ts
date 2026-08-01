import { ActionResultSchema, type ActionResult, type PlannedAction } from "@continuity/contracts";
import type { ToolExecutionContext } from "./types.js";

export const NO_EXTERNAL_EFFECT = "NONE";

export function completedResult(
  action: PlannedAction,
  context: ToolExecutionContext,
  summary: string,
): ActionResult {
  return ActionResultSchema.parse({
    actionId: action.actionId,
    status: "COMPLETED",
    summary,
    externalEffect: NO_EXTERNAL_EFFECT,
    occurredAt: context.occurredAt,
  });
}

export function rejectedResult(
  action: PlannedAction,
  context: ToolExecutionContext,
  summary: string,
): ActionResult {
  return ActionResultSchema.parse({
    actionId: action.actionId,
    status: "REJECTED",
    summary,
    externalEffect: NO_EXTERNAL_EFFECT,
    occurredAt: context.occurredAt,
  });
}

export function failedResult(
  action: PlannedAction,
  context: ToolExecutionContext,
  summary: string,
): ActionResult {
  return ActionResultSchema.parse({
    actionId: action.actionId,
    status: "FAILED",
    summary,
    externalEffect: NO_EXTERNAL_EFFECT,
    occurredAt: context.occurredAt,
  });
}
