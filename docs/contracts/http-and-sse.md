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

The Fastify handler currently converts validation errors, typed `ApiHttpError` failures, unknown routes, conflicts, and unexpected exceptions. Unexpected exceptions return a generic `INTERNAL_ERROR` message so internal details are not exposed.

## Next implementation steps

1. Install dependencies and run the API contract tests and typecheck.
2. Add the Fastify `Idempotency-Key` pre-handler and return `IDEMPOTENCY_KEY_REQUIRED` or `IDEMPOTENCY_KEY_REUSED` according to the documented rules.
3. Add the first real API vertical slice: observations → goal inference → goal confirmation.
4. Add repository and service errors that throw `ApiHttpError` instead of returning ad hoc error objects.
5. Implement the remaining REST routes for checkpoints, gaps, actions, and recovery.
6. Connect the SSE publisher and verify event ordering and reconnection behavior.
7. Add end-to-end tests for the complete demo flow and failure scenarios.

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
