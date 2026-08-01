import { describe, expect, it, vi } from "vitest";
import { MemoryObservationPersistence, PersistenceCoordinator, WORK_SESSION_MAX_AGE_MS, createDefaultObservationState, localDate, migratePersistedObservationState, restoreObservationState } from "./persistence";

const id1 = "00000000-0000-4000-8000-000000000001";
const id2 = "00000000-0000-4000-8000-000000000002";

describe("observation persistence", () => {
  it("validates version one and rejects unknown, malformed, or extra sensitive fields", () => {
    const valid = createDefaultObservationState(10, id1);
    expect(migratePersistedObservationState(valid)).toEqual(valid);
    expect(migratePersistedObservationState({ ...valid, version: 2 })).toBeUndefined();
    expect(migratePersistedObservationState({ ...valid, rawWindowTitle: "secret" })).toBeUndefined();
    expect(migratePersistedObservationState({ ...valid, confirmedGoal: { nope: true } })?.confirmedGoal).toBeUndefined();
  });

  it("restores a session once and rotates expired or malformed IDs", () => {
    expect(restoreObservationState(createDefaultObservationState(0, id1), 100, () => id2).workSessionId).toBe(id1);
    expect(restoreObservationState(createDefaultObservationState(0, id1), WORK_SESSION_MAX_AGE_MS, () => id2).workSessionId).toBe(id2);
    expect(restoreObservationState({ workSessionId: "bad" }, 5, () => id2).workSessionId).toBe(id2);
  });

  it("expires snooze and ignored signatures by local date", () => {
    const now = new Date(2026, 7, 2, 0, 1).getTime();
    const state = { ...createDefaultObservationState(now, id1), snoozedUntil: now - 1, ignoredCandidates: [{ signature: "old", ignoredOn: localDate(now - 86_400_000) }, { signature: "today", ignoredOn: localDate(now) }] };
    expect(restoreObservationState(state, now)).toMatchObject({ snoozedUntil: undefined, ignoredCandidates: [{ signature: "today", ignoredOn: localDate(now) }] });
  });

  it("debounces frequent writes and flushes critical state", async () => {
    vi.useFakeTimers();
    const state = createDefaultObservationState(0, id1);
    const storage = new MemoryObservationPersistence();
    const save = vi.spyOn(storage, "save");
    const coordinator = new PersistenceCoordinator(storage, () => state, 500);
    coordinator.schedule(); coordinator.schedule();
    await vi.advanceTimersByTimeAsync(499); expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(save).toHaveBeenCalledOnce();
    await coordinator.flush(); expect(save).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
