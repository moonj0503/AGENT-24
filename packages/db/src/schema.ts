import { integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

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
  idempotencyRecords,
};
