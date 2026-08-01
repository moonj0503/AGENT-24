# Desktop Real API Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace desktop goal, Gap, approval, and recovery fixtures with the existing versioned Continuity API.

**Architecture:** A small transport module performs typed JSON requests and presents sanitized errors. Feature adapters translate React/Tauri activity and persisted identifiers into existing contract requests; `App` holds the returned context required by later lifecycle calls. The API server and its contracts remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tauri 2 bridge, Fastify API, `@continuity/contracts`.

## Global Constraints

- Use `VITE_API_BASE_URL` for the desktop API origin; real API runs require `DATABASE_URL`.
- Do not change API routes, contracts, database schemas, agent behavior, or UI layout.
- Send only sanitized `ActivityEvent` objects returned by the existing Tauri command; do not create activity fixtures or raw observation data.
- Every state-changing request uses the existing idempotency header behavior.
- Keep the current error surface and one-shot Gap-start guard.
- Do not stage or overwrite unrelated user changes, including an existing untracked `apps/desktop/src/lib/api.ts`.

---

## File structure

- `apps/desktop/src/lib/api.ts`: typed HTTP transport and sanitized `ApiError`.
- `apps/desktop/src/features/activity/api.ts`: read sanitized events from the registered Tauri command.
- `apps/desktop/src/features/goals/api.ts`: ingest activity, infer candidates, and confirm a candidate.
- `apps/desktop/src/features/gap/api.ts`: checkpoint, Gap start/end, approval, and current `GapData` state translation.
- `apps/desktop/src/features/recovery/api.ts`: run recovery and expose its response.
- `apps/desktop/src/App.tsx` and overlay callers: retain returned IDs and invoke feature adapters in lifecycle order.
- `apps/desktop/src/**/api.test.ts`: HTTP-boundary tests for each adapter.
- `.env.example`: remove the obsolete mock toggle and retain real service configuration.

### Task 1: HTTP transport

**Files:**
- Create: `apps/desktop/src/lib/api.test.ts`
- Modify: `apps/desktop/src/lib/api.ts`

**Interfaces:**
- Produces: `apiRequest<T>(path: string, init?: RequestInit): Promise<T>` and `ApiError`.
- Consumed by: all feature API adapters.

- [ ] **Step 1: Write the failing tests**

```ts
it("sends JSON and an idempotency key for a mutation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ goalId: "goal-1" })));
  await apiRequest("/goals/confirm", { method: "POST", body: JSON.stringify({ inferenceId: "inf-1" }) });
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:4000/api/v1/goals/confirm",
    expect.objectContaining({ headers: expect.objectContaining({ accept: "application/json", "content-type": "application/json", "idempotency-key": expect.any(String) }) }),
  );
});

it("uses the API error message for a non-success response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Goal not found" }, 404)));
  await expect(apiRequest("/goals/missing")).rejects.toThrow("Goal not found");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/lib/api.test.ts`

Expected: FAIL because the transport test file and/or required behavior do not exist.

- [ ] **Step 3: Implement the minimal transport**

```ts
export class ApiError extends Error {}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: buildHeaders(init) });
  if (!response.ok) throw new ApiError((await response.json().catch(() => undefined))?.message ?? `The API request failed (${response.status}).`);
  return response.json() as Promise<T>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/lib/api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/lib/api.ts apps/desktop/src/lib/api.test.ts
git commit -m "feat(desktop): add API transport"
```

### Task 2: Sanitized activity and goal inference

**Files:**
- Create: `apps/desktop/src/features/activity/api.ts`
- Create: `apps/desktop/src/features/activity/api.test.ts`
- Modify: `apps/desktop/src/features/goals/api.ts`
- Create: `apps/desktop/src/features/goals/api.test.ts`

**Interfaces:**
- Consumes: `invokeNative("get_recent_activity_events", { limit: number })` and `apiRequest`.
- Produces: `readRecentActivityEvents(): Promise<ActivityEvent[]>`, `fetchGoalInference(workSessionId: string): Promise<GoalInferenceResult>`, `confirmGoal(inferenceId: string, candidateId: string): Promise<Goal>`.

- [ ] **Step 1: Write failing adapter tests**

```ts
it("reads only ActivityEvent values from the Tauri command", async () => {
  window.__TAURI__ = { core: { invoke: vi.fn().mockResolvedValue([activityEvent]) } };
  await expect(readRecentActivityEvents()).resolves.toEqual([activityEvent]);
  expect(window.__TAURI__.core?.invoke).toHaveBeenCalledWith("get_recent_activity_events", { limit: 50 });
});

it("ingests observed events before requesting a goal inference", async () => {
  mockFetch(observationResponse, inferenceResponse);
  await fetchGoalInference("work-1");
  expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("/observations"), expect.anything());
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/goal-inferences"), expect.anything());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/features/activity/api.test.ts src/features/goals/api.test.ts`

Expected: FAIL because the activity adapter and API-backed goal behavior are absent.

- [ ] **Step 3: Implement minimal adapters**

```ts
export async function readRecentActivityEvents(): Promise<ActivityEvent[]> {
  const result = await invokeNative("get_recent_activity_events", { limit: 50 });
  return ActivityEventSchema.array().parse(result);
}

export async function fetchGoalInference(workSessionId: string) {
  const events = await readRecentActivityEvents();
  const observation = await apiRequest<ObservationIngestionResult>("/observations", { method: "POST", body: JSON.stringify({ workSessionId, events }) });
  return apiRequest<GoalInferenceResult>("/goal-inferences", { method: "POST", body: JSON.stringify({ workSessionId, observationEventIds: observation.acceptedEventIds }) });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/features/activity/api.test.ts src/features/goals/api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/features/activity apps/desktop/src/features/goals/api.ts apps/desktop/src/features/goals/api.test.ts
git commit -m "feat(desktop): load goal inference from API"
```

### Task 3: Gap lifecycle and recovery adapters

**Files:**
- Modify: `apps/desktop/src/features/gap/api.ts`
- Create: `apps/desktop/src/features/gap/api.test.ts`
- Modify: `apps/desktop/src/features/recovery/api.ts`
- Create: `apps/desktop/src/features/recovery/api.test.ts`
- Modify: `apps/desktop/src/overlay/actions.ts`
- Modify: `apps/desktop/src/overlay/actions.test.ts`

**Interfaces:**
- Consumes: confirmed `Goal`, `workSessionId`, `Checkpoint`, `GapSession`, and `apiRequest`.
- Produces: `startGap(context: GapStartContext): Promise<GapData>`, `updateAction(gap: GapData, actionId: string, decision: "APPROVE" | "REJECT"): Promise<GapData>`, `finishGap(gap: GapData): Promise<RunGapRecoveryResponse>`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it("creates a checkpoint before creating the Gap session", async () => {
  mockFetch(checkpoint, gapSession);
  await startGap(context);
  expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("/checkpoints"), expect.anything());
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/gaps"), expect.anything());
});

it("replaces only the approved action with the API result", async () => {
  mockFetch({ ...waitingAction, status: "EXECUTING" });
  const next = await updateAction(gapData, "act-2", "APPROVE");
  expect(next.plan.actions.find((action) => action.actionId === "act-2")?.status).toBe("EXECUTING");
});

it("ends the Gap before running recovery", async () => {
  mockFetch(completedGap, recoveryResponse);
  await finishGap(gapData);
  expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining(`/gaps/${gapData.session.gapId}/end`), expect.anything());
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining(`/gaps/${gapData.session.gapId}/run`), expect.anything());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/features/gap/api.test.ts src/features/recovery/api.test.ts src/overlay/actions.test.ts`

Expected: FAIL because fixture-based Gap and recovery behavior does not issue lifecycle requests.

- [ ] **Step 3: Implement the minimal lifecycle methods**

```ts
const checkpoint = await apiRequest<Checkpoint>("/checkpoints", { method: "POST", body: JSON.stringify(checkpointRequest) });
const session = await apiRequest<GapSession>("/gaps", { method: "POST", body: JSON.stringify({ workSessionId, goalId, checkpointId: checkpoint.checkpointId }) });
const updated = await apiRequest<PlannedAction>(`/gaps/${gapId}/actions/${actionId}/approval`, { method: "POST", body: JSON.stringify({ decision }) });
const recovery = await apiRequest<RunGapRecoveryResponse>(`/gaps/${gapId}/run`, { method: "POST", body: JSON.stringify({ goalId, checkpointId }) });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/features/gap/api.test.ts src/features/recovery/api.test.ts src/overlay/actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/features/gap apps/desktop/src/features/recovery apps/desktop/src/overlay/actions.ts apps/desktop/src/overlay/actions.test.ts
git commit -m "feat(desktop): run Gap lifecycle through API"
```

### Task 4: Wire the application state and configuration

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/overlay/OverlayApp.tsx`
- Modify: `apps/desktop/src/OverlayPreview.tsx`
- Modify: `apps/desktop/src/vite-env.d.ts`
- Modify: `.env.example`
- Create: `apps/desktop/src/App.test.tsx`

**Interfaces:**
- Consumes: `fetchGoalInference(workSessionId)`, `confirmGoal(inferenceId, candidateId)`, `startGap(context)`, and `finishGap(gap)`.
- Produces: API-backed goal confirmation, Gap start, approval, and recovery screen transitions with no fixture fallback.

- [ ] **Step 1: Write failing app-flow tests**

```tsx
it("confirms a selected candidate before it enables API-backed Gap start", async () => {
  render(<App />);
  await user.click(await screen.findByRole("button", { name: /review goal candidates/i }));
  await user.click(screen.getByRole("button", { name: /write the final project report/i }));
  await user.click(screen.getByRole("button", { name: /^confirm this goal$/i }));
  expect(confirmGoal).toHaveBeenCalledWith("inf-1", "goal-1");
});

it("shows the returned recovery brief after ending a Gap", async () => {
  render(<App />);
  await user.click(await screen.findByRole("button", { name: /end gap/i }));
  expect(await screen.findByText(recoveryBrief.recommendedNextAction.title)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/App.test.tsx`

Expected: FAIL because selection currently does not confirm through the API and finishing a Gap reads a fixture.

- [ ] **Step 3: Implement the minimal state wiring**

```ts
const [workSessionId] = useState(() => crypto.randomUUID());
const [confirmedGoal, setConfirmedGoal] = useState<Goal>();
// Confirm selection with confirmGoal(inference.inferenceId, candidate.candidateId).
// Pass { workSessionId, goal: confirmedGoal } to startGap and the returned GapData to finishGap.
```

Remove preview fixture imports and make preview display real loading/error results rather than manufacturing gap/recovery data. Remove `VITE_USE_MOCKS` from `.env.example` and its type declaration.

- [ ] **Step 4: Run tests, typecheck, and full desktop suite**

Run: `corepack.cmd pnpm --filter @continuity/desktop test -- src/App.test.tsx`

Expected: PASS.

Run: `corepack.cmd pnpm --filter @continuity/desktop test`

Expected: PASS.

Run: `corepack.cmd pnpm --filter @continuity/desktop typecheck`

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/overlay/OverlayApp.tsx apps/desktop/src/OverlayPreview.tsx apps/desktop/src/vite-env.d.ts .env.example
git commit -m "feat(desktop): use live workflow data"
```
