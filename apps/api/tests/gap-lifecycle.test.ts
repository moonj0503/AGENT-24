import { expect, it } from "vitest";
import { GoalSchema } from "@continuity/contracts";
import { buildApp } from "../src/app.js";
import { InMemoryAgentEventBus } from "../src/features/workflow/event-bus.js";
import { InMemoryWorkflowRepository } from "../src/repositories/in-memory-workflow-repository.js";
import { createGapLifecycleService } from "../src/services/gap-lifecycle-service.js";

const goal = GoalSchema.parse({
  goalId: "goal-lifecycle-001",
  title: "Finish the lifecycle API",
  path: ["Demo", "Backend"],
  status: "IN_PROGRESS",
  source: "USER_CONFIRMED",
  confidence: 0.9,
});

it("persists a Checkpoint, starts and ends a Gap, and emits GAP_STARTED", async () => {
  const repository = new InMemoryWorkflowRepository({ goals: [goal] });
  const events = new InMemoryAgentEventBus();
  const received: string[] = [];
  events.subscribe(0, (record) => received.push(record.event.type));
  const service = createGapLifecycleService(repository, events, { now: () => "2026-08-02T12:00:00.000Z" });
  const app = buildApp({ gapLifecycleService: service, eventBus: events });

  const checkpoint = await app.inject({
    method: "POST",
    url: "/api/v1/checkpoints",
    headers: { "idempotency-key": "checkpoint-lifecycle-001" },
    payload: {
      goalId: goal.goalId,
      currentState: "Repository layer is complete.",
      completedSincePrevious: ["Created the migration"],
      openQuestions: [],
      likelyNextActions: [{ title: "Run the demo", estimatedMinutes: 10 }],
      relatedResources: [{ title: "API test", kind: "DOCUMENT" }],
      confidence: 0.9,
    },
  });
  expect(checkpoint.statusCode).toBe(201);
  const checkpointBody = checkpoint.json();

  const gap = await app.inject({
    method: "POST",
    url: "/api/v1/gaps",
    headers: { "idempotency-key": "gap-lifecycle-001" },
    payload: { workSessionId: "ws-lifecycle-001", goalId: goal.goalId, checkpointId: checkpointBody.checkpointId },
  });
  expect(gap.statusCode).toBe(201);
  const gapBody = gap.json();
  expect(gapBody.status).toBe("PLANNING");
  expect(received).toContain("GAP_STARTED");

  const ended = await app.inject({
    method: "POST",
    url: `/api/v1/gaps/${gapBody.gapId}/end`,
    headers: { "idempotency-key": "gap-end-lifecycle-001" },
    payload: { reason: "Demo completed." },
  });
  expect(ended.statusCode).toBe(200);
  expect(ended.json()).toMatchObject({ gapId: gapBody.gapId, status: "COMPLETED" });

  const endedAgain = await app.inject({
    method: "POST",
    url: `/api/v1/gaps/${gapBody.gapId}/end`,
    headers: { "idempotency-key": "gap-end-lifecycle-002" },
    payload: {},
  });
  expect(endedAgain.statusCode).toBe(409);
  await app.close();
});

it("records an approval decision for a persisted policy-checking action", async () => {
  const repository = new InMemoryWorkflowRepository({ goals: [goal] });
  const events = new InMemoryAgentEventBus();
  const service = createGapLifecycleService(repository, events, { now: () => "2026-08-02T12:00:00.000Z" });
  const checkpoint = await service.createCheckpoint({
    goalId: goal.goalId,
    currentState: "Waiting for approval.",
    completedSincePrevious: [],
    openQuestions: [],
    likelyNextActions: [],
    relatedResources: [],
    confidence: 0.8,
  });
  const gap = await service.startGap({ workSessionId: "ws-approval-001", goalId: goal.goalId, checkpointId: checkpoint.checkpointId });
  await repository.saveActionPlan({
    planId: "plan-approval-001",
    gapId: gap.gapId,
    continuityObjective: "Wait for the user decision.",
    actions: [{
      actionId: "action-approval-001",
      type: "SEND_EMAIL",
      title: "Send a team update",
      reason: "Requires a user decision.",
      riskLevel: "HIGH",
      reversible: false,
      status: "POLICY_CHECKING",
    }],
  });
  const app = buildApp({ gapLifecycleService: service, eventBus: events });

  const approved = await app.inject({
    method: "POST",
    url: `/api/v1/gaps/${gap.gapId}/actions/action-approval-001/approval`,
    headers: { "idempotency-key": "approval-001" },
    payload: { decision: "APPROVE" },
  });
  expect(approved.statusCode).toBe(200);
  expect(approved.json()).toMatchObject({ actionId: "action-approval-001", status: "COMPLETED" });
  const [stored] = await repository.listGapActions(gap.gapId);
  expect(stored?.result).toMatchObject({
    actionId: "action-approval-001",
    status: "COMPLETED",
    externalEffect: "NONE",
  });
  expect(stored?.result?.summary).toContain("draft");
  await app.close();
});

it("records rejection without executing an approval-gated action", async () => {
  const repository = new InMemoryWorkflowRepository({ goals: [goal] });
  const events = new InMemoryAgentEventBus();
  const service = createGapLifecycleService(repository, events, { now: () => "2026-08-02T12:00:00.000Z" });
  const checkpoint = await service.createCheckpoint({ goalId: goal.goalId, currentState: "Waiting.", completedSincePrevious: [], openQuestions: [], likelyNextActions: [], relatedResources: [], confidence: 0.8 });
  const gap = await service.startGap({ workSessionId: "ws-reject-001", goalId: goal.goalId, checkpointId: checkpoint.checkpointId });
  await repository.saveActionPlan({ planId: "plan-reject-001", gapId: gap.gapId, continuityObjective: "Wait.", actions: [{ actionId: "action-reject-001", type: "SEND_EMAIL", title: "Send update", reason: "User decides.", riskLevel: "HIGH", reversible: false, status: "WAITING_APPROVAL" }] });
  const app = buildApp({ gapLifecycleService: service, eventBus: events });
  const rejected = await app.inject({ method: "POST", url: `/api/v1/gaps/${gap.gapId}/actions/action-reject-001/approval`, headers: { "idempotency-key": "rejection-001" }, payload: { decision: "REJECT", reason: "Not now." } });
  expect(rejected.statusCode).toBe(200);
  expect(rejected.json()).toMatchObject({ status: "REJECTED" });
  const [stored] = await repository.listGapActions(gap.gapId);
  expect(stored?.result).toBeUndefined();
  await app.close();
});
