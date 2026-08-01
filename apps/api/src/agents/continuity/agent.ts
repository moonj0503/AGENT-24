import { ActionPlanSchema, type ActionPlan, type Checkpoint, type GapSession, type Goal } from "@continuity/contracts";
import type { OpenAIResponsesClient } from "../shared/openai-client.js";
import { CONTINUITY_AGENT_INSTRUCTIONS } from "./instructions.js";
import { actionPlanJsonSchema } from "./output-schema.js";

export interface ContinuityAgentInput { readonly goal: Goal; readonly checkpoint: Checkpoint; readonly gap: GapSession; }

export class ContinuityAgent {
  constructor(private readonly client: OpenAIResponsesClient, private readonly model = process.env.OPENAI_CONTINUITY_MODEL || "gpt-5.1") {}
  async plan(input: ContinuityAgentInput): Promise<ActionPlan> {
    const output = await this.client.createStructuredResponse({ model: this.model, instructions: CONTINUITY_AGENT_INSTRUCTIONS, input: JSON.stringify(input), output: { name: "continuity_action_plan", schema: actionPlanJsonSchema } });
    return ActionPlanSchema.parse(output);
  }
}
