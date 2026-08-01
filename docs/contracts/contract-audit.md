# Shared Contract and Fixture Audit

Date: 2026-08-01  
Scope: `packages/contracts/src` and `packages/contracts/src/fixtures`  
Owner: Member 3 — Backend & Data

## Purpose

This audit compares the currently defined Zod schemas with the available JSON fixtures before the shared contracts are frozen.

The goal is to distinguish three different situations:

1. A fixture exists and matches a schema.
2. A schema exists but has no fixture coverage.
3. A fixture is structurally valid, but the contract is still too ambiguous for HTTP/SSE integration.

This document records findings only. It does not change the existing shared schemas.

## Follow-up after the audit

The API request schemas described in the audit have now been added in `packages/contracts/src/http.ts` and exported from `packages/contracts/src/index.ts`. Request examples were added to `packages/contracts/src/fixtures`, and schema tests were added to `packages/contracts/tests/http.test.ts`.

## Existing schema-to-fixture coverage

| Schema | Fixture | Result | Notes |
|---|---|---|---|
| `ActivityEventSchema` | `activity-events.json` | Covered | Contains two sanitized activity events. Both use valid event types, application categories, resource kinds, non-negative idle times, and ISO timestamps. |
| `GoalInferenceResultSchema` | `goal-candidates.json` | Covered | Contains two candidates, within the required one-to-three range. Each candidate has evidence, confidence, and a goal path. |
| `GapSessionSchema` | `gap-session.json` | Covered | Contains the required session, goal, checkpoint, status, and start time fields. |
| `ActionPlanSchema` | `action-plan.json` | Covered | Contains a continuity objective and two valid planned actions. The `SEND_EMAIL` action is represented as `HIGH` risk and `POLICY_CHECKING`. |
| `RecoveryBriefSchema` | `recovery-brief.json` | Covered | Contains completed/pending actions, external effects, and a recommended next action. |
| `CheckpointSchema` | None | Missing fixture | The schema exists, but the checkpoint object used by the gap flow has no standalone fixture. |
| `GoalSchema` | None | Missing fixture | Goal candidates are covered, but the confirmed/persisted goal returned by the API is not. |
| `ActionResultSchema` | None | Missing fixture | Planned actions are covered, but execution results are not. |
| `AgentEventSchema` | None | Missing fixture | SSE event shape is defined, but no event examples are available for the desktop client. |
| `PolicyDecisionSchema` | None | Missing fixture | Only the decision enum exists. There is no fixture containing the decision, reason, or downgrade target. |

## Findings

### 1. Existing fixtures are structurally aligned

The five existing fixtures correspond to their representative schemas and do not show an obvious required-field, enum, range, or timestamp mismatch from manual comparison.

The repository's automated tests currently validate an activity event and a goal inference fixture. The other three covered fixtures should also be validated by tests before the contract is announced as frozen.

### 2. Fixture coverage is incomplete for the end-to-end flow

The current demo flow requires more than inference and planning. It also needs:

```text
confirmed Goal
→ Checkpoint
→ ActionResult
→ SSE AgentEvent
→ Policy evaluation result
```

Without these fixtures, Member 2 and Member 4 will have to invent response shapes independently, which creates integration risk.

### 3. API request contracts are now represented

The request body schemas are now defined for:

- `POST /observations`
- `POST /goal-inferences`
- `POST /goals/confirm`
- `POST /gaps`
- `POST /gaps/:gapId/actions/:actionId/approval`
- `POST /gaps/:gapId/end`

The exact request examples are documented in `docs/contracts/http-and-sse.md`. Goal confirmation now uses `POST /goals/confirm`, so both inferred and manually entered goals can be represented by the request body alone.

### 4. SSE payload is under-specified

`AgentEventSchema.payload` is currently an unrestricted record. The event type tells the client what happened, but does not tell it which payload schema to expect.

The contract should eventually map events as follows:

```text
GOAL_INFERRED  → GoalInferenceResult
GAP_STARTED    → GapSession
ACTION_UPDATED → PlannedAction or ActionResult
RECOVERY_READY → RecoveryBrief
```

### 5. Policy decisions need a result object

`PolicyDecisionSchema` currently defines only four enum values:

```text
AUTO_EXECUTE, REQUIRE_APPROVAL, DOWNGRADE, DENY
```

The integration flow also needs the reason, the requested action, and—when downgraded—the safer replacement action. Those fields are not currently represented by a shared schema.

### 6. State transitions are documented but not encoded

`GapSessionSchema` and `PlannedActionSchema` restrict the allowed status values, but they do not restrict which status can follow which.

For example, the application service—not the JSON schema alone—must decide whether:

```text
PLANNING → EXECUTING → WAITING_APPROVAL → RECOVERING → COMPLETED
```

is valid and whether a completed gap can be started again.

### 7. Confirmation mapping needs an explicit rule

An inferred candidate uses `candidateId`, while a persisted goal uses `goalId`. The confirm endpoint must explicitly define how the selected candidate becomes a stored goal.

Recommended rule:

```text
ConfirmGoalRequest.candidateId
→ create Goal.goalId
→ Goal.source = USER_CONFIRMED
```

## Recommended next contract tasks

These are the next tasks after this audit, in priority order:

1. Add a common error schema.
2. Add missing fixtures for `Goal`, `Checkpoint`, `ActionResult`, and `AgentEvent`.
3. Add a policy evaluation result schema and fixture.
4. Make SSE payloads event-specific or define a documented payload mapping.
5. Add schema tests for all existing and new fixtures.
6. Update `docs/contracts/http-and-sse.md` with exact request/response examples.
7. Announce the frozen contract and route all later changes through `chore/contracts-v2`.

## Audit conclusion

The current contract package is a useful domain-model foundation, and the five existing fixtures are consistent with the schemas they represent. It is not yet a complete integration contract because request bodies, missing lifecycle fixtures, policy results, and typed SSE payloads remain unspecified.

Therefore the appropriate status is:

```text
Domain schemas: mostly established
Fixture examples: partially covered
HTTP/SSE integration contract: not yet frozen
```
