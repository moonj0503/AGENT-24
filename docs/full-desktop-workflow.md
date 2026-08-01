# Full desktop workflow

The production desktop composes the existing components in this order:

`Start Gap Mode → Windows activity → observation upload → Goal inference → explicit Goal confirmation → Checkpoint → GapSession → Runtime → Policy → Tools/approval → Gap end → Recovery → History`

The initial desktop action creates only a local pending Gap intent. Observation for Goal identification starts at that point, clears stale queued inference for the intent, and continues until the Gap ends. No backend GapSession and no continuity action exist before explicit Goal confirmation. Cancelling confirmation stops the pending observation. This preserves the existing backend lifecycle and contracts while making Gap Mode the user-facing entry point.

The desktop workflow controller is the authoritative owner of backend-returned IDs and lifecycle objects. The observation session remains responsible for inference scheduling and persistence. Direct HTTP responses are authoritative for user-triggered mutations; broad SSE synchronization is deferred because the current lifecycle is synchronous and does not require it.

## Environment

Copy `.env.example` to `.env`, configure `DATABASE_URL`, and keep `VITE_API_BASE_URL=http://localhost:4000/api/v1` for local development. Use `AGENT_PROVIDER=fixture` for deterministic local verification. For OpenAI-backed agents, set `AGENT_PROVIDER=openai`, `OPENAI_API_KEY`, and the three documented model variables. OpenAI is called only by the API through the shared client.

Run database migrations according to `packages/db`, then start the API and desktop:

```text
pnpm --filter @continuity/api dev
pnpm --filter @continuity/desktop dev
```

## Manual fixture-provider checklist

1. Start the database and API with `AGENT_PROVIDER=fixture`.
2. Start the Tauri desktop and verify sanitized activity reaches observation ingestion.
3. Start Gap Mode and continue working while the desktop identifies a stable Goal.
4. Confirm the Goal overlay, then verify the returned Checkpoint, GapSession, and ActionPlan IDs in the API/database.
5. Approve or reject any approval-gated action and verify the action/result state refreshes from History.
6. End the Gap and verify the same real RecoveryBrief appears in the native overlay and main Recovery screen.
7. Open History and verify the completed Gap.
8. Restart the desktop and verify observation preferences and confirmed Goal restoration.

## Production and preview boundaries

The normal application never imports preview fixtures. `/overlay-preview` is development-only and uses `features/preview/data.ts` solely for visual inspection. Automated fixture-provider tests exercise real routes, services, runtime, policy, tools, repositories, and contracts without network access.

## Known limitations

- The Runtime currently returns the RecoveryBrief during `/run`; the UI reveals that persisted brief only after the Gap is ended.
- Direct HTTP responses drive the workflow. SSE remains available for future asynchronous synchronization but is not required for correctness.
- `SEND_EMAIL` is deterministically downgraded to a local message draft and never creates an email-sent external effect.
- Native manual verification requires Windows, Tauri prerequisites, a reachable database, and an active API. Automated tests mock native boundaries.
