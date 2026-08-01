import { describe, expect, it } from "vitest";
import { ActionResultSchema, PlannedActionSchema, type PlannedAction } from "@continuity/contracts";
import {
  DefaultToolRegistry,
  DuplicateToolRegistrationError,
  ToolNotFoundError,
  defaultTools,
} from "./registry.js";
import { NO_EXTERNAL_EFFECT } from "./result.js";

const occurredAt = "2026-08-01T09:30:00.000Z";

function action(type: PlannedAction["type"]): PlannedAction {
  return PlannedActionSchema.parse({
    actionId: `action-${type.toLowerCase()}`,
    type,
    title: `Test ${type}`,
    reason: "Preserve the user's continuity context.",
    riskLevel: type === "SEND_EMAIL" ? "HIGH" : "LOW",
    reversible: type !== "SEND_EMAIL",
    status: "POLICY_CHECKING",
    ...(type === "EDIT_APPROVED_TEXT_FILE" ? { textEdit: { authorizationId: "authorization-test", find: "before", replace: "after" } } : {}),
  });
}

describe("DefaultToolRegistry", () => {
  it("resolves every safe supported Tool", () => {
    const registry = new DefaultToolRegistry();
    const safeTypes: readonly PlannedAction["type"][] = [
      "CREATE_CHECKPOINT",
      "CREATE_TODO_DRAFT",
      "CREATE_MESSAGE_DRAFT",
      "ORGANIZE_REFERENCES",
      "GENERATE_RECOVERY_BRIEF",
    ];

    for (const type of safeTypes) expect(registry.get(type).type).toBe(type);
  });

  it("rejects duplicate registration", () => {
    expect(() => new DefaultToolRegistry([defaultTools[0], defaultTools[0]])).toThrow(
      DuplicateToolRegistrationError,
    );
  });

  it("fails closed for a missing Tool", () => {
    expect(() => new DefaultToolRegistry([]).get("CREATE_CHECKPOINT")).toThrow(ToolNotFoundError);
    expect(() => new DefaultToolRegistry().get("UNKNOWN_TOOL")).toThrow(ToolNotFoundError);
  });

  it("returns contract-valid, action-linked, no-effect results from every safe Tool", async () => {
    const registry = new DefaultToolRegistry();
    for (const tool of defaultTools.filter((candidate) => candidate.type !== "SEND_EMAIL")) {
      const input = action(tool.type);
      const result = await tool.execute(input, { occurredAt });

      expect(ActionResultSchema.parse(result)).toEqual(result);
      expect(result.actionId).toBe(input.actionId);
      expect(result.externalEffect).toBe(NO_EXTERNAL_EFFECT);
    }
  });

  it("organizes references virtually without implying originals moved", async () => {
    const result = await new DefaultToolRegistry()
      .get("ORGANIZE_REFERENCES")
      .execute(action("ORGANIZE_REFERENCES"), { occurredAt });

    expect(result.summary).toContain("virtually organized");
    expect(result.summary).toContain("without moving originals");
    expect(result.externalEffect).toBe(NO_EXTERNAL_EFFECT);
  });

  it("keeps message drafting internal and rejects direct email sending", async () => {
    const registry = new DefaultToolRegistry();
    const draft = await registry
      .get("CREATE_MESSAGE_DRAFT")
      .execute(action("CREATE_MESSAGE_DRAFT"), { occurredAt });
    const send = await registry.get("SEND_EMAIL").execute(action("SEND_EMAIL"), { occurredAt });

    expect(draft).toMatchObject({ status: "COMPLETED", externalEffect: NO_EXTERNAL_EFFECT });
    expect(send).toMatchObject({ status: "REJECTED", externalEffect: NO_EXTERNAL_EFFECT });
  });

  it("has an explicit safe implementation or fail-closed placeholder for every action type", () => {
    const supportedTypes: readonly PlannedAction["type"][] = [
      "CREATE_CHECKPOINT",
      "CREATE_TODO_DRAFT",
      "CREATE_MESSAGE_DRAFT",
      "ORGANIZE_REFERENCES",
      "GENERATE_RECOVERY_BRIEF",
      "EDIT_APPROVED_TEXT_FILE",
      "SEND_EMAIL",
    ];

    expect(defaultTools.map((tool) => tool.type).sort()).toEqual([...supportedTypes].sort());
  });
});
