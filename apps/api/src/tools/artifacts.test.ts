import { describe, expect, it } from "vitest";
import { ActionPlanSchema } from "@continuity/contracts";
import { createActionArtifacts } from "./artifacts.js";

describe("action artifacts", () => {
  it("creates full internal content only for completed artifact-producing actions", () => {
    const plan = ActionPlanSchema.parse({
      planId: "plan-1", gapId: "gap-1", continuityObjective: "Preserve work",
      actions: [
        { actionId: "todo-1", type: "CREATE_TODO_DRAFT", title: "Study plan", reason: "Prepare a weekly plan.", riskLevel: "LOW", reversible: true, status: "PLANNED" },
        { actionId: "checkpoint-1", type: "CREATE_CHECKPOINT", title: "Checkpoint", reason: "Preserve state.", riskLevel: "LOW", reversible: true, status: "PLANNED" },
      ],
    });
    const artifacts = createActionArtifacts("gap-1", plan, [
      { actionId: "todo-1", status: "COMPLETED", summary: "Done", externalEffect: "NONE", occurredAt: "2026-08-02T00:00:00.000Z" },
      { actionId: "checkpoint-1", status: "COMPLETED", summary: "Done", externalEffect: "NONE", occurredAt: "2026-08-02T00:00:00.000Z" },
    ]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ type: "TODO", title: "Study plan", status: "ACTIVE" });
    expect(artifacts[0]?.content).toContain("## Tasks");
  });
});
