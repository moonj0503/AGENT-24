import type { ActivityEvent, GoalInferenceResult } from "@continuity/contracts";
import { GOAL_INTERPRETER_INSTRUCTIONS } from "./instructions.js";
import { goalInferenceJsonSchema, GoalInferenceResultSchema } from "./output-schema.js";
import type { OpenAIResponsesClient } from "../shared/openai-client.js";

export interface GoalInterpreterInput { readonly events: readonly ActivityEvent[]; }

export class GoalInterpreter {
  constructor(private readonly client: OpenAIResponsesClient, private readonly model = process.env.OPENAI_GOAL_MODEL || "gpt-5-mini") {}

  async interpret(input: GoalInterpreterInput): Promise<GoalInferenceResult> {
    const output = await this.client.createStructuredResponse({ model: this.model, instructions: GOAL_INTERPRETER_INSTRUCTIONS, input: JSON.stringify(input), output: { name: "goal_inference_result", schema: goalInferenceJsonSchema } });
    return GoalInferenceResultSchema.parse(output);
  }
}
