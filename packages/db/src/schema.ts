import { integer, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";

export const activityEvents = pgTable("activity_events", {
  eventId: text("event_id").primaryKey(),
  workSessionId: text("work_session_id").notNull(),
  eventData: jsonb("event_data").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const goalInferences = pgTable("goal_inferences", {
  inferenceId: text("inference_id").primaryKey(),
  workSessionId: text("work_session_id").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const goals = pgTable("goals", {
  goalId: text("goal_id").primaryKey(),
  inferenceId: text("inference_id"),
  title: text("title").notNull(),
  path: jsonb("path").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  confidence: real("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const checkpoints = pgTable("checkpoints", {
  checkpointId: text("checkpoint_id").primaryKey(),
  goalId: text("goal_id").notNull(),
  checkpointData: jsonb("checkpoint_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gapSessions = pgTable("gap_sessions", {
  gapId: text("gap_id").primaryKey(),
  workSessionId: text("work_session_id").notNull(),
  goalId: text("goal_id").notNull(),
  checkpointId: text("checkpoint_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const actionPlans = pgTable("action_plans", {
  planId: text("plan_id").primaryKey(),
  gapId: text("gap_id").notNull(),
  planData: jsonb("plan_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gapActions = pgTable("gap_actions", {
  gapId: text("gap_id").notNull(),
  actionId: text("action_id").notNull(),
  actionData: jsonb("action_data").notNull(),
  status: text("status").notNull(),
  decision: text("decision"),
  decisionReason: text("decision_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.gapId, table.actionId] })]);

export const recoveryBriefs = pgTable("recovery_briefs", {
  briefId: text("brief_id").primaryKey(),
  gapId: text("gap_id").notNull(),
  briefData: jsonb("brief_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const actionResults = pgTable("action_results", {
  gapId: text("gap_id").notNull(),
  actionId: text("action_id").notNull(),
  resultData: jsonb("result_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.gapId, table.actionId] })]);

export const idempotencyRecords = pgTable("idempotency_records", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  state: text("state").notNull(),
  statusCode: integer("status_code"),
  payload: text("payload"),
  contentType: text("content_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const dbSchema = {
  activityEvents,
  goalInferences,
  goals,
  checkpoints,
  gapSessions,
  actionPlans,
  gapActions,
  recoveryBriefs,
  actionResults,
  idempotencyRecords,
};
