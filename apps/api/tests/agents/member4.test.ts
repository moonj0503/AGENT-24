import { describe, expect, it } from "vitest";
import { ActivityEventSchema, CheckpointSchema, GapSessionSchema, GoalSchema, type ActionPlan, type GoalInferenceResult } from "@continuity/contracts";
import { runGoalInterpreter } from "../../src/agents/goal-interpreter/run.js";
import { runContinuityAgent } from "../../src/agents/continuity/run.js";
import { OpenAIResponsesClient } from "../../src/agents/shared/openai-client.js";
import { evaluatePolicy } from "../../src/policy/policy-engine.js";
import { listRegisteredTools } from "../../src/tools/registry.js";

function clientWithOutput(output: GoalInferenceResult | ActionPlan): OpenAIResponsesClient {
  return new OpenAIResponsesClient({ apiKey: "test", fetch: async () => new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200, headers: { "Content-Type": "application/json" } }) });
}

const events = [ActivityEventSchema.parse({ eventId: "evt-001", type: "ACTIVE_WINDOW_CHANGED", occurredAt: "2026-08-01T09:00:00.000Z", application: { name: "Word", category: "DOCUMENT" }, resource: { title: "Report.docx", kind: "DOCUMENT" }, metadata: { idleSeconds: 0 } })];
const goal = GoalSchema.parse({ goalId: "goal-001", title: "Write report", path: ["Project", "Report"], status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 1 });
const checkpoint = CheckpointSchema.parse({ checkpointId: "cp-001", goalId: goal.goalId, currentState: "Writing the stability section", completedSincePrevious: [], openQuestions: [], likelyNextActions: [{ title: "Outline the next paragraph", estimatedMinutes: 10 }], relatedResources: [{ title: "QR Stability", kind: "WEB_PAGE" }], confidence: 1, createdAt: "2026-08-01T09:05:00.000Z" });
const gap = GapSessionSchema.parse({ gapId: "gap-001", workSessionId: "ws-001", goalId: goal.goalId, checkpointId: checkpoint.checkpointId, status: "PLANNING", startedAt: "2026-08-01T09:10:00.000Z" });

describe("Member 4 agent engine", () => {
  it("validates stable goal output and falls back when OpenAI fails", async () => {
    const result = await runGoalInterpreter(events, new OpenAIResponsesClient());
    expect(result.candidates).toHaveLength(2);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("calls at least three tools from the continuity fixture fallback", async () => {
    const result = await runContinuityAgent({ goal, checkpoint, gap }, new OpenAIResponsesClient());
    expect(result.executions.filter((execution) => execution.result?.status === "SUCCESS")).toHaveLength(4);
    expect(listRegisteredTools()).toHaveLength(5);
  });

  it("downgrades sending email to a reversible message draft", () => {
    const decision = evaluatePolicy({ actionId: "send-1", type: "SEND_EMAIL", title: "Send update", reason: "Inform team", riskLevel: "HIGH", reversible: false, status: "POLICY_CHECKING" });
    expect(decision.decision).toBe("DOWNGRADE");
    expect(decision.allowedAction?.type).toBe("CREATE_MESSAGE_DRAFT");
  });

  it("denies actions declared prohibited", () => {
    const decision = evaluatePolicy({ actionId: "blocked-1", type: "CREATE_TODO_DRAFT", title: "Unsafe action", reason: "Model marked this prohibited", riskLevel: "PROHIBITED", reversible: false, status: "POLICY_CHECKING" });
    expect(decision.decision).toBe("DENY");
  });

  it("validates model output before returning it", async () => {
    const output: GoalInferenceResult = { inferenceId: "inf-test", requiresConfirmation: true, inferenceSummary: "Observed a report document.", candidates: [{ candidateId: "candidate-test", title: "Write report", description: "Continue report work", confidence: 0.6, evidence: [{ type: "RESOURCE", description: "Report.docx" }], suggestedGoalPath: ["Project", "Report"] }] };
    expect((await runGoalInterpreter(events, clientWithOutput(output))).inferenceId).toBe("inf-test");
  });
});
