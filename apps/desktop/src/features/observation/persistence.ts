import { ActivityEventSchema, GoalInferenceResultSchema, GoalSchema } from "@continuity/contracts";
import { z } from "zod";
import { invokeNative, isNativeOverlayAvailable } from "../../lib/tauri";

const IgnoredCandidateSchema = z.object({ signature: z.string().min(1), ignoredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
export const PersistedObservationStateSchema = z.object({
  version: z.literal(1),
  workSessionId: z.string().uuid(),
  workSessionCreatedAt: z.number().nonnegative(),
  observationStatus: z.enum(["RUNNING", "PAUSED"]),
  confirmedGoal: GoalSchema.optional(),
  pendingObservations: z.array(ActivityEventSchema),
  uploadedObservationEventIds: z.array(z.string().min(1)).default([]),
  pendingInferenceEventIds: z.array(z.string().min(1)).default([]),
  latestInference: GoalInferenceResultSchema.optional(),
  candidateSignature: z.string().optional(),
  consecutiveCandidateCount: z.number().int().nonnegative(),
  lastInferenceAt: z.number().optional(),
  lastPopupAt: z.number().optional(),
  snoozedUntil: z.number().optional(),
  ignoredCandidates: z.array(IgnoredCandidateSchema),
  privacy: z.object({ blockedApplications: z.array(z.string().min(1)) }).strict(),
}).strict();

export type PersistedObservationState = z.infer<typeof PersistedObservationStateSchema>;
export interface ObservationPersistence {
  load(): Promise<unknown | undefined>;
  save(state: PersistedObservationState): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryObservationPersistence implements ObservationPersistence {
  constructor(private value?: unknown) {}
  async load(): Promise<unknown | undefined> { return structuredClone(this.value); }
  async save(state: PersistedObservationState): Promise<void> { this.value = structuredClone(state); }
  async clear(): Promise<void> { this.value = undefined; }
}

export class TauriObservationPersistence implements ObservationPersistence {
  async load(): Promise<unknown | undefined> {
    if (!isNativeOverlayAvailable()) return undefined;
    return invokeNative("load_observation_state");
  }
  async save(state: PersistedObservationState): Promise<void> {
    if (isNativeOverlayAvailable()) await invokeNative("save_observation_state", { value: state });
  }
  async clear(): Promise<void> {
    if (isNativeOverlayAvailable()) await invokeNative("clear_observation_state");
  }
}

export const WORK_SESSION_MAX_AGE_MS = 24 * 60 * 60_000;
export function localDate(timestamp: number): string {
  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function migratePersistedObservationState(raw: unknown): PersistedObservationState | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const candidate = { ...raw } as Record<string, unknown>;
  if (candidate.confirmedGoal !== undefined && !GoalSchema.safeParse(candidate.confirmedGoal).success) delete candidate.confirmedGoal;
  if (candidate.latestInference !== undefined && !GoalInferenceResultSchema.safeParse(candidate.latestInference).success) delete candidate.latestInference;
  const parsed = PersistedObservationStateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function createDefaultObservationState(now: number, id: string = crypto.randomUUID()): PersistedObservationState {
  return {
    version: 1, workSessionId: id, workSessionCreatedAt: now, observationStatus: "RUNNING",
    pendingObservations: [], uploadedObservationEventIds: [], pendingInferenceEventIds: [],
    consecutiveCandidateCount: 0, ignoredCandidates: [], privacy: { blockedApplications: [] },
  };
}

export function restoreObservationState(raw: unknown, now: number, createId: () => string = () => crypto.randomUUID()): PersistedObservationState {
  let candidate = raw;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && (raw as { version?: unknown }).version === 1) {
    const record = { ...raw } as Record<string, unknown>;
    if (!z.string().uuid().safeParse(record.workSessionId).success) {
      record.workSessionId = createId();
      record.workSessionCreatedAt = now;
    }
    candidate = record;
  }
  const parsed = migratePersistedObservationState(candidate) ?? createDefaultObservationState(now, createId());
  const expired = now - parsed.workSessionCreatedAt >= WORK_SESSION_MAX_AGE_MS;
  const today = localDate(now);
  return {
    ...parsed,
    ...(expired ? { workSessionId: createId(), workSessionCreatedAt: now } : {}),
    snoozedUntil: parsed.snoozedUntil && parsed.snoozedUntil > now ? parsed.snoozedUntil : undefined,
    ignoredCandidates: parsed.ignoredCandidates.filter((item) => item.ignoredOn === today),
  };
}

export class PersistenceCoordinator {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly persistence: ObservationPersistence, private readonly read: () => PersistedObservationState, private readonly delayMs = 750) {}
  schedule(): void { if (this.timer === undefined) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delayMs); }
  async flush(): Promise<void> { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; await this.persistence.save(this.read()); }
}
