# HTTP and SSE Contract

Base path: `/api/v1`. `POST /observations`, `POST /goal-inferences`, `POST /goals/confirm`, `POST /gaps`, `POST /gaps/:gapId/actions/:actionId/approval`, and `POST /gaps/:gapId/end` all accept an `Idempotency-Key` header. Success bodies use the schemas in `@continuity/contracts`; malformed bodies return an `ApiError` with `code: "VALIDATION_ERROR"`.

Desktop clients subscribe to `GET /events`. Every event is an `AgentEvent` with a monotonic server sequence, and re-connection uses `Last-Event-ID`. Event order is `GOAL_INFERRED`, `GAP_STARTED`, zero or more `ACTION_UPDATED`, then `RECOVERY_READY`.

## Common error response

All REST API errors use `ApiErrorSchema` from `@continuity/contracts`. The response body has a stable machine-readable `code`, a human-readable `message`, an optional `requestId` for log correlation, optional field-level `details`, and a `retryable` flag.

The Fastify adapter is implemented in `apps/api/src/plugins/error-handler.ts`. Application services should throw `ApiHttpError` for expected failures; the adapter converts those errors, Fastify validation errors, unknown routes, and unexpected exceptions into the public `ApiError` response without exposing internal details.

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request body is invalid.",
  "requestId": "req-001",
  "details": {
    "fields": [
      {
        "path": ["reason"],
        "message": "A rejection reason is required."
      }
    ]
  },
  "retryable": false
}
```

The `code` is for program logic and must remain stable. The `message` is for people and may be improved without changing client behavior. Internal stack traces, SQL statements, API keys, raw provider errors, and sensitive user content must never be returned.

### Error code and HTTP status mapping

| Code | Meaning | HTTP status | Retryable by default |
|---|---|---:|---:|
| `VALIDATION_ERROR` | Request body or parameter is invalid | 400 | No |
| `NOT_FOUND` | Requested resource does not exist | 404 | No |
| `CONFLICT` | Request conflicts with the current resource state | 409 | No |
| `INVALID_STATE_TRANSITION` | Requested state change is not allowed | 409 | No |
| `IDEMPOTENCY_KEY_REQUIRED` | Required idempotency header is missing | 400 | No |
| `IDEMPOTENCY_KEY_REUSED` | A key was reused with a different request | 409 | No |
| `AGENT_FAILURE` | Agent or model execution failed | 502/503 | Yes |
| `DATABASE_FAILURE` | Database operation failed | 500/503 | Depends on operation |
| `INTERNAL_ERROR` | Unexpected server failure | 500 | No |

### Idempotency behavior

State-changing endpoints require a non-empty `Idempotency-Key` header.

```text
same key + same request       → return the original response
same key + different request  → IDEMPOTENCY_KEY_REUSED
missing key                    → IDEMPOTENCY_KEY_REQUIRED
```

Policy decisions such as `DENY` or `DOWNGRADE` are normally represented in the action result and audit log, not as a transport-level API error. The API should use an error response only when the request itself cannot be processed.

### Idempotency implementation

`apps/api/src/plugins/idempotency.ts` enforces this behavior for all state-changing API routes (`POST`, `PUT`, `PATCH`, and `DELETE`). It fingerprints the HTTP method, URL, and body for each `Idempotency-Key`.

| Situation | Result |
|---|---|
| Header missing or empty | `400 IDEMPOTENCY_KEY_REQUIRED` |
| First request with a new key | Route executes and its response is recorded |
| Same key and same fingerprint after completion | Original status and payload are replayed with `Idempotency-Replayed: true` |
| Same key and same fingerprint while running | The duplicate request waits for and receives the original response |
| Same key and different fingerprint | `409 IDEMPOTENCY_KEY_REUSED` |

The test default is intentionally in-memory for the mock-first MVP. The production `apps/api/src/server.ts` now wires the PostgreSQL-backed `DrizzleIdempotencyStore`. The database store uses an expiry timestamp and waits briefly for an in-progress record to complete. A scheduled cleanup job is still required for long-running deployments.

## Implementation status

The common error contract is implemented and connected to the Fastify application.

| Area | Status | Location |
|---|---|---|
| Public error schema | Complete | `packages/contracts/src/errors.ts` |
| Error fixtures | Complete | `packages/contracts/src/fixtures/error-*.json` |
| Contract tests | Complete | `packages/contracts/tests/errors.test.ts` |
| Fastify error conversion | Complete | `apps/api/src/plugins/error-handler.ts` |
| Global application registration | Complete | `apps/api/src/app.ts` |
| Error integration tests | Added | `apps/api/tests/error-handler.test.ts` |
| Idempotency pre-handler | Complete (DB + in-memory test double) | `apps/api/src/plugins/idempotency.ts` |
| First API vertical slice | Complete (service/repository split) | `apps/api/src/features/workflow/` |
| Drizzle database schema | Added | `packages/db/src/schema.ts` |
| SQL migration | Added | `packages/db/migrations/0001_workflow.sql` |
| Migration runner | Added | `packages/db/src/migrate.ts` |
| Workflow Repository interface | Complete | `apps/api/src/repositories/workflow-repository.ts` |
| PostgreSQL Workflow Repository | Complete | `apps/api/src/repositories/drizzle-workflow-repository.ts` |
| Workflow Service layer | Complete | `apps/api/src/services/workflow-service.ts` |
| PostgreSQL Repository integration test | Added (requires `DATABASE_URL`) | `apps/api/tests/postgres-workflow.integration.test.ts` |
| Production DB wiring | Complete | `apps/api/src/server.ts` |

The Fastify handler currently converts validation errors, typed `ApiHttpError` failures, unknown routes, conflicts, and unexpected exceptions. Unexpected exceptions return a generic `INTERNAL_ERROR` message so internal details are not exposed.

## Implemented API flow

The first end-to-end API flow is available with the existing frozen Goal Interpreter fixture.

```text
POST /observations
  → save sanitized ActivityEvent objects by work session
POST /goal-inferences
  → load the requested events and run FixtureGoalInterpreter
POST /goals/confirm
  → store a confirmed candidate or a manually entered goal
```

| Endpoint | Success status | Response |
|---|---:|---|
| `POST /observations` | 201 | `ObservationIngestionResult` |
| `POST /goal-inferences` | 200 | `GoalInferenceResult` |
| `POST /goals/confirm` | 201 | `Goal` |

Routes now perform request parsing and response formatting only. Business rules live in `WorkflowService`, while persistence lives behind `WorkflowRepository`.

```text
Route
  → WorkflowService
    → WorkflowRepository
      → InMemoryWorkflowRepository (tests)
      → DrizzleWorkflowRepository (production)
        → PostgreSQL
```

`buildApp()` uses the in-memory repository by default so API tests do not need a running database. The real `server.ts` requires `DATABASE_URL` and wires `DrizzleWorkflowRepository` and `DrizzleIdempotencyStore`.

## Next implementation steps

1. Provide a real PostgreSQL `DATABASE_URL`, then run:

   ```powershell
   $env:DATABASE_URL = "postgresql://user:password@localhost:5432/continuity"
   corepack.cmd pnpm --filter @continuity/db migrate
   ```

2. Start the production-wired API with `corepack.cmd pnpm --filter @continuity/api dev` and verify `/health` plus the workflow flow.
3. Run `corepack.cmd pnpm --filter @continuity/api test`; the PostgreSQL Repository test runs when `DATABASE_URL` is set and skips otherwise.
4. Add idempotency TTL cleanup scheduling and make migration execution part of the deployment pipeline.
5. Implement checkpoints, Gap start/end, action approval, and recovery brief REST routes.
6. Connect the SSE publisher and verify event ordering and `Last-Event-ID` reconnection behavior.
7. Replace the fixture Goal Interpreter through its interface with the real Member 4 agent implementation and preserve a fixture fallback.
8. Add end-to-end tests for the complete demo flow, concurrent duplicate requests, process restart behavior, and failure scenarios.

## Request body contracts

The request schemas are exported from `@continuity/contracts` in `src/http.ts`.

| Endpoint | Request schema | Example fixture |
|---|---|---|
| `POST /observations` | `ObservationRequestSchema` | `observation-request.json` |
| `POST /goal-inferences` | `GoalInferenceRequestSchema` | `goal-inference-request.json` |
| `POST /goals/confirm` | `ConfirmGoalRequestSchema` | `confirm-goal-candidate-request.json`, `confirm-goal-manual-request.json` |
| `POST /gaps` | `StartGapRequestSchema` | `start-gap-request.json` |
| `POST /gaps/:gapId/actions/:actionId/approval` | `ActionApprovalRequestSchema` | `action-approval-request.json`, `action-rejection-request.json` |
| `POST /gaps/:gapId/end` | `EndGapRequestSchema` | `end-gap-request.json` |

Path parameters have separate schemas: `ActionApprovalParamsSchema` and `EndGapParamsSchema`.

All state-changing endpoints require a non-empty `Idempotency-Key` header. The reusable header value validator is `IdempotencyKeySchema`.

## Request examples

### Observation ingestion

```json
{
  "workSessionId": "ws-001",
  "events": [
    {
      "eventId": "evt-001",
      "type": "ACTIVE_WINDOW_CHANGED",
      "occurredAt": "2026-08-01T09:00:00.000Z",
      "application": { "name": "Microsoft Word", "category": "DOCUMENT" },
      "resource": { "title": "Final Project Report.docx", "kind": "DOCUMENT" },
      "metadata": { "idleSeconds": 0 }
    }
  ]
}
```

### Goal inference

```json
{
  "workSessionId": "ws-001",
  "observationEventIds": ["evt-001", "evt-002"],
  "previousGoalId": "goal-previous"
}
```

### Goal confirmation

The body supports both selecting an inferred candidate and entering a manual correction.

```json
{
  "inferenceId": "inf-001",
  "selection": {
    "type": "CANDIDATE",
    "candidateId": "goal-001"
  }
}
```

```json
{
  "inferenceId": "inf-001",
  "selection": {
    "type": "MANUAL",
    "title": "Finish the numerical stability section",
    "path": ["Final Project", "Report Writing", "QR Factorization"]
  }
}
```

### Gap start, approval, and end

`POST /gaps`

```json
{
  "workSessionId": "ws-001",
  "goalId": "goal-001",
  "checkpointId": "cp-001"
}
```

`POST /gaps/:gapId/actions/:actionId/approval`

```json
{
  "decision": "APPROVE"
}
```

`POST /gaps/:gapId/end`

```json
{
  "reason": "The user returned and is ready to review the recovery brief."
}
```

## Goal confirmation decision

Goal confirmation uses `POST /goals/confirm` and the request body is the only source of selection data. This supports both selecting an inferred candidate and entering a manual correction without requiring a goal ID that does not exist yet.
