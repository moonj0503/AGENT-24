# HTTP and SSE Contract

Base path: `/api/v1`. `POST /observations`, `POST /goal-inferences`, `POST /goals/confirm`, `POST /gaps`, `POST /gaps/:gapId/actions/:actionId/approval`, and `POST /gaps/:gapId/end` all accept an `Idempotency-Key` header. Success bodies use the schemas in `@continuity/contracts`; malformed bodies return `{ "code": "VALIDATION_ERROR", "message": string }`.

Desktop clients subscribe to `GET /events`. Every event is an `AgentEvent` with a monotonic server sequence, and re-connection uses `Last-Event-ID`. Event order is `GOAL_INFERRED`, `GAP_STARTED`, zero or more `ACTION_UPDATED`, then `RECOVERY_READY`.

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
