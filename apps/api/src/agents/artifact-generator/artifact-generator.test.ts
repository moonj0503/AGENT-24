import { describe, expect, it, vi } from "vitest";
import {
  ActionPlanSchema,
  CheckpointSchema,
  GapSessionSchema,
  GoalSchema,
} from "@continuity/contracts";
import { FixtureArtifactGenerator } from "./fixture-artifact-generator.js";
import {
  ArtifactGeneratorError,
  OpenAIArtifactGenerator,
  type ArtifactModel,
} from "./openai-artifact-generator.js";
import type { ArtifactGenerationContext } from "./types.js";
import type { OpenAIClient } from "../openai/index.js";

const occurredAt = "2026-08-01T09:30:00.000Z";
const context: ArtifactGenerationContext = {
  goal: GoalSchema.parse({
    goalId: "goal-1", title: "Write the project report", path: ["Project", "Report"],
    status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.9,
  }),
  checkpoint: CheckpointSchema.parse({
    checkpointId: "checkpoint-1", goalId: "goal-1", currentState: "Writing the results section.",
    completedSincePrevious: ["Collected references"], openQuestions: ["Which chart is clearest?"],
    likelyNextActions: [{ title: "Draft the conclusion", estimatedMinutes: 15 }],
    relatedResources: [{ title: "Results notes", kind: "DOCUMENT" }], confidence: 0.9,
    createdAt: "2026-08-01T09:00:00.000Z",
  }),
  gapSession: GapSessionSchema.parse({
    gapId: "gap-1", workSessionId: "session-1", goalId: "goal-1",
    checkpointId: "checkpoint-1", status: "PLANNING", startedAt: "2026-08-01T09:10:00.000Z",
  }),
  actionPlan: ActionPlanSchema.parse({
    planId: "plan-1", gapId: "gap-1", continuityObjective: "Preserve report progress.",
    actions: [
      { actionId: "todo-1", type: "CREATE_TODO_DRAFT", title: "Finish report", reason: "Keep momentum.", riskLevel: "LOW", reversible: true, status: "PLANNED" },
      { actionId: "email-1", type: "SEND_EMAIL", title: "Update the team", reason: "Prepare an update.", riskLevel: "HIGH", reversible: false, status: "PLANNED" },
    ],
  }),
  actionResults: [
    { actionId: "todo-1", status: "COMPLETED", summary: "TODO draft created.", externalEffect: "NONE", occurredAt },
    { actionId: "email-1", status: "COMPLETED", summary: "Message draft prepared instead of sending.", externalEffect: "NONE", occurredAt },
  ],
};

const unusedClient = {} as OpenAIClient;

describe("artifact generators", () => {
  it("keeps fixture generation deterministic and downgrades SEND_EMAIL to a message artifact", async () => {
    const artifacts = await new FixtureArtifactGenerator().run(context);
    expect(artifacts.map(({ type }) => type)).toEqual(["TODO", "MESSAGE"]);
    expect(artifacts[1]).toMatchObject({ actionId: "email-1", status: "ACTIVE" });
  });

  it("uses model content while retaining all application-controlled fields", async () => {
    const generate = vi.fn(async (_request: Parameters<ArtifactModel["generate"]>[0]) => ({ artifacts: [
      { actionId: "todo-1", content: "- [ ] Draft the conclusion\n- [ ] Choose a chart" },
      { actionId: "email-1", content: "Subject: Report update\n\nDraft for review." },
    ] }));
    const generator = new OpenAIArtifactGenerator(unusedClient, "recovery-model", { generate });
    const artifacts = await generator.run(context);

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ model: "recovery-model" }));
    expect(JSON.parse(generate.mock.calls[0]?.[0].input ?? "{}")).toMatchObject({
      goal: { goalId: "goal-1" }, checkpoint: { checkpointId: "checkpoint-1" },
    });
    expect(artifacts).toMatchObject([
      { artifactId: "artifact-gap-1-todo-1", type: "TODO", title: "Finish report", createdAt: occurredAt },
      { artifactId: "artifact-gap-1-email-1", type: "MESSAGE", title: "Update the team", createdAt: occurredAt },
    ]);
  });

  it.each([
    { artifacts: [{ actionId: "todo-1", content: "draft" }] },
    { artifacts: [{ actionId: "todo-1", content: "draft" }, { actionId: "todo-1", content: "duplicate" }] },
    { artifacts: [{ actionId: "todo-1", content: "draft" }, { actionId: "unknown", content: "invented" }] },
  ])("rejects missing, duplicate, or ungrounded action outputs", async (output) => {
    const model: ArtifactModel = { generate: vi.fn(async () => output) };
    await expect(new OpenAIArtifactGenerator(unusedClient, "model", model).run(context))
      .rejects.toBeInstanceOf(ArtifactGeneratorError);
  });

  it("does not call the model when no completed action can produce an artifact", async () => {
    const generate = vi.fn();
    const input = { ...context, actionResults: context.actionResults.map((result) => ({ ...result, status: "FAILED" as const })) };
    await expect(new OpenAIArtifactGenerator(unusedClient, "model", { generate }).run(input)).resolves.toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
