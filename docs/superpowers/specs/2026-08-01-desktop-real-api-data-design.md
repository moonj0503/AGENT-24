# Desktop real API data design

## Scope

Replace desktop fixture reads for goal inference, Gap lifecycle, action approval, and recovery with the versioned Continuity API. This change uses the existing HTTP contracts and does not change server routes, database schemas, agent behavior, or the UI layout.

## Data flow

1. The desktop gathers the current local activity events and sends them to `POST /observations`.
2. It requests candidates from `POST /goal-inferences`, then confirms the user selection through `POST /goals/confirm`.
3. Before starting a Gap, it creates a checkpoint through `POST /checkpoints`; it then starts the Gap through `POST /gaps`.
4. An approval control posts `APPROVE` or `REJECT` to the scoped action approval route and replaces only that action in the current plan.
5. Ending a Gap first calls the end route, then runs recovery. The recovery response supplies both the updated action plan and the recovery brief.

The desktop keeps the identifiers returned at each step (work session, inference, confirmed goal, checkpoint, and Gap) in its React state. No identifiers are invented in the client.

## Client boundary

Feature API adapters use the existing `apiRequest` helper, which supplies the API base URL, JSON headers, idempotency keys for mutations, and sanitized user-facing errors. Adapters are typed with the contract package and construct only request bodies allowed by its schemas.

The goal adapter coordinates observation ingestion and inference. The Gap adapter owns checkpoint creation, Gap start, action approval, and Gap completion. The recovery adapter runs recovery with the persisted goal and checkpoint identifiers. Preview-only fixture helpers are removed or isolated so production UI paths cannot use them.

## UI behavior and errors

The existing busy and error surfaces remain the user-facing behavior. A failed request leaves the last successfully rendered state intact and presents the API error message. The one-shot Gap-start guard remains, preventing duplicate user confirmation from issuing repeated start requests.

When an action is approved or rejected, the client applies the returned action status to the current plan while retaining the current session. When recovery succeeds, the recovery brief becomes the Recovery screen data source.

## Configuration and verification

The desktop reads `VITE_API_BASE_URL`; a real run also requires the API service to have a valid `DATABASE_URL`. `VITE_USE_MOCKS` is no longer used by these production data flows.

Tests will first exercise the requested feature adapters with fetch mocked at the HTTP boundary: endpoint, request body, response propagation, approval replacement, and API-error handling. Existing desktop tests and type checking will run after the feature tests pass.
