import { ArtifactSchema, type Artifact, type ArtifactType } from "@continuity/contracts";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAIClient, type OpenAIClient, type OpenAIConfig } from "../openai/index.js";
import { ARTIFACT_GENERATOR_INSTRUCTIONS, serializeArtifactContext } from "./prompt.js";
import type { ArtifactGenerationContext, ArtifactGenerator } from "./types.js";

const GeneratedArtifactSetSchema = z.object({
  artifacts: z.array(z.object({
    actionId: z.string().min(1),
    content: z.string().min(1).max(20_000),
  })),
});

type GeneratedArtifactSet = z.infer<typeof GeneratedArtifactSetSchema>;

const artifactTypes: Readonly<Partial<Record<ArtifactGenerationContext["actionPlan"]["actions"][number]["type"], ArtifactType>>> = {
  CREATE_TODO_DRAFT: "TODO",
  CREATE_MESSAGE_DRAFT: "MESSAGE",
  ORGANIZE_REFERENCES: "REFERENCES",
  SEND_EMAIL: "MESSAGE",
};

export interface ArtifactModelRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
}

export interface ArtifactModel {
  generate(request: ArtifactModelRequest): Promise<unknown>;
}

export class ArtifactGeneratorError extends Error {
  constructor(message = "The Artifact Generator failed.") {
    super(message);
    this.name = "ArtifactGeneratorError";
  }
}

export class OpenAIResponsesArtifactModel implements ArtifactModel {
  constructor(private readonly client: OpenAIClient) {}

  async generate(request: ArtifactModelRequest): Promise<unknown> {
    try {
      const response = await this.client.responses.parse({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        store: false,
        text: { format: zodTextFormat(GeneratedArtifactSetSchema, "artifact_set") },
      });
      return response.output_parsed;
    } catch {
      throw new ArtifactGeneratorError("The Artifact Generator request failed.");
    }
  }
}

function eligibleActions(input: ArtifactGenerationContext) {
  const completed = new Set(
    input.actionResults.filter(({ status }) => status === "COMPLETED").map(({ actionId }) => actionId),
  );
  return input.actionPlan.actions.filter(
    ({ actionId, type }) => completed.has(actionId) && artifactTypes[type] !== undefined,
  );
}

function validateOutput(output: unknown, expectedActionIds: ReadonlySet<string>): GeneratedArtifactSet {
  const parsed = GeneratedArtifactSetSchema.safeParse(output);
  if (!parsed.success) throw new ArtifactGeneratorError("Artifact output failed validation.");
  const actualIds = parsed.data.artifacts.map(({ actionId }) => actionId);
  if (
    actualIds.length !== expectedActionIds.size ||
    new Set(actualIds).size !== actualIds.length ||
    actualIds.some((actionId) => !expectedActionIds.has(actionId))
  ) {
    throw new ArtifactGeneratorError("Artifact output did not match the completed actions.");
  }
  return parsed.data;
}

export class OpenAIArtifactGenerator implements ArtifactGenerator {
  private readonly artifactModel: ArtifactModel;

  constructor(client: OpenAIClient, private readonly model: string, artifactModel?: ArtifactModel) {
    this.artifactModel = artifactModel ?? new OpenAIResponsesArtifactModel(client);
  }

  async run(input: ArtifactGenerationContext): Promise<readonly Artifact[]> {
    const actions = eligibleActions(input);
    if (actions.length === 0) return [];
    const actionIds = new Set(actions.map(({ actionId }) => actionId));
    let output: unknown;
    try {
      output = await this.artifactModel.generate({
        model: this.model,
        instructions: ARTIFACT_GENERATOR_INSTRUCTIONS,
        input: serializeArtifactContext(input, actionIds),
      });
    } catch (cause) {
      if (cause instanceof ArtifactGeneratorError) throw cause;
      throw new ArtifactGeneratorError("The Artifact Generator request failed.");
    }
    const generated = validateOutput(output, actionIds);
    const contentByActionId = new Map(generated.artifacts.map((item) => [item.actionId, item.content]));
    const resultByActionId = new Map(input.actionResults.map((result) => [result.actionId, result]));
    return actions.map((action) => {
      const occurredAt = resultByActionId.get(action.actionId)?.occurredAt;
      const type = artifactTypes[action.type];
      if (!occurredAt || !type) throw new ArtifactGeneratorError("Artifact context was incomplete.");
      return ArtifactSchema.parse({
        artifactId: `artifact-${input.gapSession.gapId}-${action.actionId}`,
        gapId: input.gapSession.gapId,
        actionId: action.actionId,
        type,
        title: action.title,
        content: contentByActionId.get(action.actionId),
        status: "ACTIVE",
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
    });
  }
}

export function createOpenAIArtifactGenerator(
  config: OpenAIConfig,
  client: OpenAIClient = createOpenAIClient(config),
): OpenAIArtifactGenerator {
  return new OpenAIArtifactGenerator(client, config.recoveryModel);
}
