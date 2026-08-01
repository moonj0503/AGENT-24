import { RecoveryBriefSchema, type RecoveryBrief } from "@continuity/contracts";
import { zodTextFormat } from "openai/helpers/zod";
import {
  createOpenAIClient,
  type OpenAIClient,
  type OpenAIConfig,
} from "../openai/index.js";
import { RecoveryGeneratorValidationError } from "./fixture-recovery-generator.js";
import {
  RECOVERY_GENERATOR_INSTRUCTIONS,
  serializeRecoveryContext,
} from "./prompt.js";
import type { RecoveryContext, RecoveryGenerator } from "./types.js";

export interface RecoveryModelRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
}

export interface RecoveryModel {
  generate(request: RecoveryModelRequest): Promise<unknown>;
}

export class RecoveryGeneratorRequestError extends Error {
  constructor() {
    super("The Recovery Generator request failed.");
    this.name = "RecoveryGeneratorRequestError";
  }
}

export class RecoveryGeneratorEmptyResponseError extends Error {
  constructor() {
    super("The Recovery Generator returned no structured output.");
    this.name = "RecoveryGeneratorEmptyResponseError";
  }
}

export class RecoveryGeneratorParseError extends Error {
  constructor() {
    super("The Recovery Generator could not parse the structured model output.");
    this.name = "RecoveryGeneratorParseError";
  }
}

function isStructuredParsingError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
}

export class OpenAIResponsesRecoveryModel implements RecoveryModel {
  constructor(private readonly client: OpenAIClient) {}

  async generate(request: RecoveryModelRequest): Promise<unknown> {
    try {
      const response = await this.client.responses.parse({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        store: false,
        text: {
          format: zodTextFormat(RecoveryBriefSchema, "recovery_brief"),
        },
      });
      return response.output_parsed;
    } catch (error) {
      if (isStructuredParsingError(error)) throw new RecoveryGeneratorParseError();
      throw new RecoveryGeneratorRequestError();
    }
  }
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isGoalGrounded(brief: RecoveryBrief, input: RecoveryContext): boolean {
  const renderedGoal = normalized(brief.goalBeforeGap);
  return [input.goal.title, ...input.goal.path]
    .map(normalized)
    .some((part) => part.length > 0 && renderedGoal.includes(part));
}

function validateRecoveryGrounding(brief: RecoveryBrief, input: RecoveryContext): void {
  if (brief.gapId !== input.gapSession.gapId) {
    throw new RecoveryGeneratorValidationError(
      "OpenAI recovery brief must preserve the active GapSession gapId.",
    );
  }

  if (!isGoalGrounded(brief, input)) {
    throw new RecoveryGeneratorValidationError(
      "OpenAI recovery brief goalBeforeGap is not grounded in the confirmed Goal.",
    );
  }

  const plannedActionIds = new Set(input.actionPlan.actions.map(({ actionId }) => actionId));
  const completedActionIds = new Set(
    input.actionResults
      .filter(({ actionId, status }) => status === "COMPLETED" && plannedActionIds.has(actionId))
      .map(({ actionId }) => actionId),
  );
  if (brief.completedActions.length > completedActionIds.size) {
    throw new RecoveryGeneratorValidationError(
      "OpenAI recovery brief contains ungrounded completed-action claims.",
    );
  }

  const pendingActionCount = input.actionPlan.actions.filter(
    ({ actionId }) => !completedActionIds.has(actionId),
  ).length;
  if (brief.pendingActions.length > pendingActionCount) {
    throw new RecoveryGeneratorValidationError(
      "OpenAI recovery brief contains ungrounded pending-action claims.",
    );
  }

  const completedClaims = new Set(brief.completedActions.map(normalized));
  if (brief.pendingActions.some((claim) => completedClaims.has(normalized(claim)))) {
    throw new RecoveryGeneratorValidationError(
      "OpenAI recovery brief cannot present the same action as completed and pending.",
    );
  }

  const groundedExternalEffectCount = input.actionResults.filter(
    ({ externalEffect }) => {
      const effect = externalEffect.trim();
      return effect.length > 0 && effect.toLocaleUpperCase() !== "NONE";
    },
  ).length;
  if (brief.externalEffects.length > groundedExternalEffectCount) {
    throw new RecoveryGeneratorValidationError(
      "OpenAI recovery brief contains ungrounded external-effect claims.",
    );
  }

  if (groundedExternalEffectCount === 0) {
    const communicationEffectPattern =
      /\b(?:email|message)\b.*\b(?:sent|delivered)\b|\b(?:sent|delivered)\b.*\b(?:email|message)\b/i;
    if (brief.completedActions.some((claim) => communicationEffectPattern.test(claim))) {
      throw new RecoveryGeneratorValidationError(
        "OpenAI recovery brief implies external communication without an explicit effect.",
      );
    }
  }
}

export class OpenAIRecoveryGenerator implements RecoveryGenerator {
  private readonly recoveryModel: RecoveryModel;

  constructor(
    client: OpenAIClient,
    private readonly model: string,
    recoveryModel?: RecoveryModel,
  ) {
    this.recoveryModel = recoveryModel ?? new OpenAIResponsesRecoveryModel(client);
  }

  async run(input: RecoveryContext): Promise<RecoveryBrief> {
    let output: unknown;
    try {
      output = await this.recoveryModel.generate({
        model: this.model,
        instructions: RECOVERY_GENERATOR_INSTRUCTIONS,
        input: serializeRecoveryContext(input),
      });
    } catch (error) {
      if (
        error instanceof RecoveryGeneratorRequestError ||
        error instanceof RecoveryGeneratorParseError
      ) {
        throw error;
      }
      throw new RecoveryGeneratorRequestError();
    }

    if (output === null || output === undefined || output === "") {
      throw new RecoveryGeneratorEmptyResponseError();
    }

    const result = RecoveryBriefSchema.safeParse(output);
    if (!result.success) {
      throw new RecoveryGeneratorValidationError(
        "OpenAI recovery-brief output failed contract validation.",
      );
    }

    validateRecoveryGrounding(result.data, input);
    return result.data;
  }
}

export function createOpenAIRecoveryGenerator(
  config: OpenAIConfig,
  client: OpenAIClient = createOpenAIClient(config),
): OpenAIRecoveryGenerator {
  return new OpenAIRecoveryGenerator(client, config.recoveryModel);
}
