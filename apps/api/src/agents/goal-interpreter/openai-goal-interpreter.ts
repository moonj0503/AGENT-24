import { GoalInferenceResultSchema, type GoalInferenceResult } from "@continuity/contracts";
import { zodTextFormat } from "openai/helpers/zod";
import {
  createOpenAIClient,
  type OpenAIClient,
  type OpenAIConfig,
} from "../openai/index.js";
import { GoalInterpreterValidationError } from "./fixture-goal-interpreter.js";
import {
  GOAL_INTERPRETER_INSTRUCTIONS,
  serializeSanitizedGoalContext,
} from "./prompt.js";
import type { GoalInterpreter, SanitizedGoalContext } from "./types.js";

export interface GoalInferenceModelRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
}

export interface GoalInferenceModel {
  generate(request: GoalInferenceModelRequest): Promise<unknown>;
}

export class GoalInterpreterRequestError extends Error {
  constructor() {
    super("The Goal Interpreter request failed.");
    this.name = "GoalInterpreterRequestError";
  }
}

export class GoalInterpreterEmptyResponseError extends Error {
  constructor() {
    super("The Goal Interpreter returned no structured output.");
    this.name = "GoalInterpreterEmptyResponseError";
  }
}

export class GoalInterpreterStructuredOutputError extends Error {
  constructor() {
    super("The Goal Interpreter could not parse the structured model output.");
    this.name = "GoalInterpreterStructuredOutputError";
  }
}

function isStructuredParsingError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
}

export class OpenAIResponsesGoalInferenceModel implements GoalInferenceModel {
  constructor(private readonly client: OpenAIClient) {}

  async generate(request: GoalInferenceModelRequest): Promise<unknown> {
    try {
      const response = await this.client.responses.parse({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        store: false,
        text: {
          format: zodTextFormat(GoalInferenceResultSchema, "goal_inference_result"),
        },
      });
      return response.output_parsed;
    } catch (error) {
      if (isStructuredParsingError(error)) {
        throw new GoalInterpreterStructuredOutputError();
      }
      throw new GoalInterpreterRequestError();
    }
  }
}

export class OpenAIGoalInterpreter implements GoalInterpreter {
  private readonly inferenceModel: GoalInferenceModel;

  constructor(
    client: OpenAIClient,
    private readonly model: string,
    inferenceModel?: GoalInferenceModel,
  ) {
    this.inferenceModel = inferenceModel ?? new OpenAIResponsesGoalInferenceModel(client);
  }

  async run(input: SanitizedGoalContext): Promise<GoalInferenceResult> {
    let output: unknown;
    try {
      output = await this.inferenceModel.generate({
        model: this.model,
        instructions: GOAL_INTERPRETER_INSTRUCTIONS,
        input: serializeSanitizedGoalContext(input),
      });
    } catch (error) {
      if (
        error instanceof GoalInterpreterRequestError ||
        error instanceof GoalInterpreterStructuredOutputError
      ) {
        throw error;
      }
      throw new GoalInterpreterRequestError();
    }

    if (output === null || output === undefined || output === "") {
      throw new GoalInterpreterEmptyResponseError();
    }

    const result = GoalInferenceResultSchema.safeParse(output);
    if (!result.success) {
      throw new GoalInterpreterValidationError(
        "OpenAI goal-inference output failed contract validation.",
      );
    }

    if (!result.data.requiresConfirmation) {
      throw new GoalInterpreterValidationError(
        "OpenAI goal-inference output must require user confirmation.",
      );
    }

    return result.data;
  }
}

export function createOpenAIGoalInterpreter(
  config: OpenAIConfig,
  client: OpenAIClient = createOpenAIClient(config),
): OpenAIGoalInterpreter {
  return new OpenAIGoalInterpreter(client, config.goalModel);
}
