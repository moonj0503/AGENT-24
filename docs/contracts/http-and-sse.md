# Frozen HTTP and SSE Contract

Base path: `/api/v1`. `POST /observations`, `POST /goal-inferences`, `POST /goals/:goalId/confirm`, `POST /gaps`, `POST /gaps/:gapId/actions/:actionId/approval`, and `POST /gaps/:gapId/end` all accept an `Idempotency-Key` header. Success bodies use the schemas in `@continuity/contracts`; malformed bodies return `{ "code": "VALIDATION_ERROR", "message": string }`.

Desktop clients subscribe to `GET /events`. Every event is an `AgentEvent` with a monotonic server sequence, and re-connection uses `Last-Event-ID`. Event order is `GOAL_INFERRED`, `GAP_STARTED`, zero or more `ACTION_UPDATED`, then `RECOVERY_READY`.
