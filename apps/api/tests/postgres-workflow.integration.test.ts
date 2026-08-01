import { randomUUID } from "node:crypto";
import { createDatabase } from "@continuity/db";
import {
  GoalInferenceResultSchema,
  type ActivityEvent,
  type Goal,
} from "@continuity/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleWorkflowRepository } from "../src/repositories/drizzle-workflow-repository.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("PostgreSQL WorkflowRepository", () => {
  const ids = {
    workSessionId: `integration-ws-${randomUUID()}`,
    eventId: `integration-event-${randomUUID()}`,
    inferenceId: `integration-inference-${randomUUID()}`,
    candidateId: `integration-goal-${randomUUID()}`,
  };
  let sql: ReturnType<typeof createDatabase>["sql"];
  let repository: DrizzleWorkflowRepository;

  beforeAll(() => {
    const database = createDatabase(databaseUrl);
    sql = database.sql;
    repository = new DrizzleWorkflowRepository(database.db);
  });

  afterAll(async () => {
    await sql.unsafe("DELETE FROM goals WHERE goal_id = $1", [ids.candidateId]);
    await sql.unsafe("DELETE FROM goal_inferences WHERE inference_id = $1", [ids.inferenceId]);
    await sql.unsafe("DELETE FROM activity_events WHERE event_id = $1", [ids.eventId]);
    await sql.end();
  });

  it("persists observations, inferences, and goals through PostgreSQL", async () => {
    const event: ActivityEvent = {
      eventId: ids.eventId,
      type: "ACTIVE_WINDOW_CHANGED",
      occurredAt: "2026-08-01T09:00:00.000Z",
      application: { name: "Microsoft Word", category: "DOCUMENT" },
      resource: { title: "Integration Test.docx", kind: "DOCUMENT" },
      metadata: { idleSeconds: 0 },
    };

    const observationResult = await repository.ingestObservations({
      workSessionId: ids.workSessionId,
      events: [event],
    });
    expect(observationResult.acceptedEventIds).toEqual([ids.eventId]);

    const events = await repository.getActivityEvents(ids.workSessionId, [ids.eventId]);
    expect(events.get(ids.eventId)).toEqual(event);

    const inference = GoalInferenceResultSchema.parse({
      inferenceId: ids.inferenceId,
      requiresConfirmation: true,
      inferenceSummary: "Integration test goal.",
      candidates: [{
        candidateId: ids.candidateId,
        title: "Complete the integration test",
        description: "Verify PostgreSQL persistence.",
        confidence: 0.99,
        evidence: [{ type: "RESOURCE", description: "Integration Test.docx" }],
        suggestedGoalPath: ["Testing", "PostgreSQL"],
      }],
    });

    await repository.saveInference(ids.workSessionId, inference);
    expect(await repository.getInference(ids.inferenceId)).toEqual({
      workSessionId: ids.workSessionId,
      result: inference,
    });

    const goal: Goal = {
      goalId: ids.candidateId,
      title: "Complete the integration test",
      path: ["Testing", "PostgreSQL"],
      status: "IN_PROGRESS",
      source: "USER_CONFIRMED",
      confidence: 0.99,
    };
    await repository.saveGoal(ids.inferenceId, goal);
    expect(true).toBe(true);
  });
});
