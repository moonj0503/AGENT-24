import type { ActivityEvent } from "@continuity/contracts";

export interface QueueLimits { readonly maximumEvents: number; readonly maximumAgeMs: number; }
export const DEFAULT_QUEUE_LIMITS: QueueLimits = { maximumEvents: 5_000, maximumAgeMs: 7 * 24 * 60 * 60_000 };

export function normalizeApplicationIdentifier(value: string): string { return value.trim().toLocaleLowerCase(); }
export function isApplicationBlocked(event: ActivityEvent, blocked: readonly string[]): boolean {
  return blocked.includes(normalizeApplicationIdentifier(event.application.name));
}
export function boundedObservationQueue(events: readonly ActivityEvent[], now: number, limits = DEFAULT_QUEUE_LIMITS): { events: ActivityEvent[]; trimmed: boolean } {
  const unique = new Map<string, ActivityEvent>();
  for (const event of events) if (Date.parse(event.occurredAt) >= now - limits.maximumAgeMs) unique.set(event.eventId, event);
  const ordered = [...unique.values()].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const result = ordered.slice(Math.max(0, ordered.length - limits.maximumEvents));
  return { events: result, trimmed: result.length !== events.length };
}

export async function observationBatchKey(workSessionId: string, eventIds: readonly string[]): Promise<string> {
  const input = new TextEncoder().encode(`${workSessionId}:${[...eventIds].sort().join(":")}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return `observation:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
