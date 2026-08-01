import { eq, lt } from "drizzle-orm";
import { idempotencyRecords, type Database } from "@continuity/db";
import type {
  CompletedIdempotencyResponse,
  IdempotencyRepository,
  IdempotencyResponse,
  IdempotencyStartResult,
} from "./idempotency-repository.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 25;
const WAIT_TIMEOUT_MS = 5_000;

export class DrizzleIdempotencyStore implements IdempotencyRepository {
  constructor(
    private readonly db: Database,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  async start(key: string, fingerprint: string): Promise<IdempotencyStartResult> {
    const now = new Date();
    await this.db.delete(idempotencyRecords).where(lt(idempotencyRecords.expiresAt, now));

    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const inserted = await this.db.insert(idempotencyRecords).values({
      idempotencyKey: key,
      fingerprint,
      state: "PENDING",
      expiresAt,
    }).onConflictDoNothing().returning({ idempotencyKey: idempotencyRecords.idempotencyKey });

    if (inserted.length > 0) {
      return { kind: "NEW" };
    }

    const existing = await this.find(key);
    if (!existing || existing.fingerprint !== fingerprint) {
      return { kind: "CONFLICT" };
    }

    if (existing.state === "COMPLETED" && existing.statusCode !== null && existing.payload !== null) {
      return {
        kind: "REPLAY",
        response: {
          state: "COMPLETED",
          fingerprint: existing.fingerprint,
          statusCode: existing.statusCode,
          payload: existing.payload,
          contentType: existing.contentType ?? undefined,
        },
      };
    }

    const response = await this.waitForCompletion(key, fingerprint);
    return response ? { kind: "REPLAY", response } : { kind: "CONFLICT" };
  }

  async complete(key: string, fingerprint: string, response: IdempotencyResponse): Promise<void> {
    await this.db.update(idempotencyRecords)
      .set({
        state: "COMPLETED",
        statusCode: response.statusCode,
        payload: response.payload,
        contentType: response.contentType,
      })
      .where(eq(idempotencyRecords.idempotencyKey, key));
  }

  private async find(key: string) {
    const [record] = await this.db.select().from(idempotencyRecords)
      .where(eq(idempotencyRecords.idempotencyKey, key)).limit(1);
    return record;
  }

  private async waitForCompletion(key: string, fingerprint: string): Promise<CompletedIdempotencyResponse | null> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const record = await this.find(key);
      if (!record || record.fingerprint !== fingerprint) return null;
      if (record.state === "COMPLETED" && record.statusCode !== null && record.payload !== null) {
        return {
          state: "COMPLETED",
          fingerprint,
          statusCode: record.statusCode,
          payload: record.payload,
          contentType: record.contentType ?? undefined,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return null;
  }
}
