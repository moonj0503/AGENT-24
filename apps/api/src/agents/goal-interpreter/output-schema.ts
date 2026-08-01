import { GoalInferenceResultSchema } from "@continuity/contracts";

export { GoalInferenceResultSchema };

const evidence = {
  type: "object", additionalProperties: false,
  properties: { type: { type: "string", enum: ["RESOURCE", "ACTIVITY_SEQUENCE", "CALENDAR", "PREVIOUS_GOAL", "USER_PATTERN"] }, description: { type: "string", minLength: 1 } },
  required: ["type", "description"],
} as const;

export const goalInferenceJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    inferenceId: { type: "string", minLength: 1 },
    candidates: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, properties: { candidateId: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence: { type: "array", minItems: 1, items: evidence }, suggestedGoalPath: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } } }, required: ["candidateId", "title", "description", "confidence", "evidence", "suggestedGoalPath"] } },
    requiresConfirmation: { type: "boolean" }, inferenceSummary: { type: "string", minLength: 1 },
  },
  required: ["inferenceId", "candidates", "requiresConfirmation", "inferenceSummary"],
} as const;
