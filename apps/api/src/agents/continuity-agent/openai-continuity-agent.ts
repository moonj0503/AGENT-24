import { ActionPlanSchema, OpenAIActionPlanSchema, type ActionPlan } from "@continuity/contracts";
import { zodTextFormat } from "openai/helpers/zod";
import {
  createOpenAIClient,
  type OpenAIClient,
  type OpenAIConfig,
} from "../openai/index.js";
import { ContinuityAgentValidationError } from "./fixture-continuity-agent.js";
import {
  CONTINUITY_AGENT_INSTRUCTIONS,
  serializeContinuityContext,
} from "./prompt.js";
import type { ContinuityAgent, ContinuityContext } from "./types.js";

export interface ContinuityPlanningModelRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
}

export interface ContinuityPlanningModel {
  generate(request: ContinuityPlanningModelRequest): Promise<unknown>;
}

export class ContinuityAgentRequestError extends Error {
  constructor() {
    super("The Continuity Agent request failed.");
    this.name = "ContinuityAgentRequestError";
  }
}

export class ContinuityAgentEmptyResponseError extends Error {
  constructor() {
    super("The Continuity Agent returned no structured output.");
    this.name = "ContinuityAgentEmptyResponseError";
  }
}

export class ContinuityAgentParseError extends Error {
  constructor() {
    super("The Continuity Agent could not parse the structured model output.");
    this.name = "ContinuityAgentParseError";
  }
}

function isStructuredParsingError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
}

export class OpenAIResponsesContinuityPlanningModel implements ContinuityPlanningModel {
  constructor(private readonly client: OpenAIClient) {}

  async generate(request: ContinuityPlanningModelRequest): Promise<unknown> {
    try {
      const response = await this.client.responses.parse({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        store: false,
        text: {
          format: zodTextFormat(OpenAIActionPlanSchema, "continuity_action_plan"),
        },
      });
      return response.output_parsed;
    } catch (error) {
      if (isStructuredParsingError(error)) throw new ContinuityAgentParseError();
      throw new ContinuityAgentRequestError();
    }
  }
}

function validatePlanSemantics(plan: ActionPlan, input: ContinuityContext): void {
  if (plan.gapId !== input.gapSession.gapId) {
    throw new ContinuityAgentValidationError(
      "OpenAI action plan must preserve the active GapSession gapId.",
    );
  }

  const actionIds = new Set<string>();
  for (const action of plan.actions) {
    if (actionIds.has(action.actionId)) {
      throw new ContinuityAgentValidationError(
        "OpenAI action plan must contain unique actionId values.",
      );
    }
    actionIds.add(action.actionId);

    if (action.type === "EDIT_APPROVED_TEXT_FILE") {
      const approved = input.approvedTextFile;
      if (!approved || !action.textEdit || action.textEdit.authorizationId !== approved.authorizationId) {
        throw new ContinuityAgentValidationError("OpenAI text edits must preserve the supplied file authorizationId.");
      }
      if (approved.content.split(action.textEdit.find).length - 1 !== 1) {
        throw new ContinuityAgentValidationError("OpenAI text edits must target text that occurs exactly once.");
      }
    }
    if (action.type !== "EDIT_APPROVED_TEXT_FILE" && action.textEdit) throw new ContinuityAgentValidationError("Only approved text-edit actions may contain textEdit data.");

    if (action.status !== "PLANNED" && action.status !== "POLICY_CHECKING") {
      throw new ContinuityAgentValidationError(
        "OpenAI action plan statuses must describe pre-Policy, unexecuted proposals.",
      );
    }
  }
}

export class OpenAIContinuityAgent implements ContinuityAgent {
  private readonly planningModel: ContinuityPlanningModel;

  constructor(
    client: OpenAIClient,
    private readonly model: string,
    planningModel?: ContinuityPlanningModel,
  ) {
    this.planningModel = planningModel ?? new OpenAIResponsesContinuityPlanningModel(client);
  }

  async run(input: ContinuityContext): Promise<ActionPlan> {
    let output: unknown;
    try {
      output = await this.planningModel.generate({
        model: this.model,
        instructions: CONTINUITY_AGENT_INSTRUCTIONS,
        input: serializeContinuityContext(input),
      });
    } catch (error) {
      if (
        error instanceof ContinuityAgentRequestError ||
        error instanceof ContinuityAgentParseError
      ) {
        throw error;
      }
      throw new ContinuityAgentRequestError();
    }

    if (output === null || output === undefined || output === "") {
      throw new ContinuityAgentEmptyResponseError();
    }

    const result = ActionPlanSchema.safeParse(output);
    if (!result.success) {
      throw new ContinuityAgentValidationError(
        "OpenAI action-plan output failed contract validation.",
      );
    }

    validatePlanSemantics(result.data, input);
    return result.data;
  }
}

export function createOpenAIContinuityAgent(
  config: OpenAIConfig,
  client: OpenAIClient = createOpenAIClient(config),
): OpenAIContinuityAgent {
  return new OpenAIContinuityAgent(client, config.continuityModel);
}
