import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { IdempotencyKeySchema } from "@continuity/contracts";
import { ApiHttpError } from "./error-handler.js";

type CompletedResponse = {
  readonly state: "COMPLETED";
  readonly fingerprint: string;
  readonly statusCode: number;
  readonly payload: string;
  readonly contentType?: string;
};

type PendingResponse = {
  readonly state: "PENDING";
  readonly fingerprint: string;
  readonly completed: Promise<CompletedResponse>;
  readonly resolve: (response: CompletedResponse) => void;
};

type IdempotencyRecord = CompletedResponse | PendingResponse;

type RequestContext = {
  readonly key: string;
  readonly fingerprint: string;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function requestFingerprint(request: FastifyRequest): string {
  const requestIdentity = stableStringify({
    method: request.method,
    url: request.url,
    body: request.body,
  });

  return createHash("sha256").update(requestIdentity).digest("hex");
}

function serializedPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (Buffer.isBuffer(payload)) return payload.toString("utf8");
  return JSON.stringify(payload) ?? "null";
}

export class InMemoryIdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  start(key: string, fingerprint: string):
    | { readonly kind: "NEW" }
    | { readonly kind: "REPLAY"; readonly response: CompletedResponse }
    | { readonly kind: "WAIT"; readonly completed: Promise<CompletedResponse> }
    | { readonly kind: "CONFLICT" } {
    const existing = this.records.get(key);

    if (!existing) {
      let resolve!: (response: CompletedResponse) => void;
      const completed = new Promise<CompletedResponse>((complete) => {
        resolve = complete;
      });
      this.records.set(key, { state: "PENDING", fingerprint, completed, resolve });
      return { kind: "NEW" };
    }

    if (existing.fingerprint !== fingerprint) {
      return { kind: "CONFLICT" };
    }

    if (existing.state === "COMPLETED") {
      return { kind: "REPLAY", response: existing };
    }

    return { kind: "WAIT", completed: existing.completed };
  }

  complete(key: string, fingerprint: string, response: Omit<CompletedResponse, "state" | "fingerprint">): void {
    const existing = this.records.get(key);
    if (!existing || existing.state !== "PENDING" || existing.fingerprint !== fingerprint) {
      return;
    }

    const completed: CompletedResponse = {
      state: "COMPLETED",
      fingerprint,
      ...response,
    };
    this.records.set(key, completed);
    existing.resolve(completed);
  }
}

function sendReplay(reply: FastifyReply, response: CompletedResponse): FastifyReply {
  if (response.contentType) {
    reply.header("content-type", response.contentType);
  }
  reply.header("Idempotency-Replayed", "true");
  return reply.status(response.statusCode).send(response.payload);
}

function isStateChangingRequest(request: FastifyRequest): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
}

export function registerIdempotency(app: FastifyInstance, store = new InMemoryIdempotencyStore): void {
  const contexts = new WeakMap<FastifyRequest, RequestContext>();

  app.addHook("preHandler", async (request, reply) => {
    if (!isStateChangingRequest(request)) {
      return;
    }

    const keyResult = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!keyResult.success) {
      throw new ApiHttpError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "An Idempotency-Key header is required.",
      );
    }
    const key = keyResult.data;

    const fingerprint = requestFingerprint(request);
    const result = store.start(key, fingerprint);
    if (result.kind === "CONFLICT") {
      throw new ApiHttpError(
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used for a different request.",
      );
    }
    if (result.kind === "REPLAY") {
      return sendReplay(reply, result.response);
    }
    if (result.kind === "WAIT") {
      return sendReplay(reply, await result.completed);
    }

    contexts.set(request, { key, fingerprint });
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const context = contexts.get(request);
    if (!context) {
      return payload;
    }

    const headerValue = reply.getHeader("content-type");
    const contentType = typeof headerValue === "string" ? headerValue : undefined;
    store.complete(context.key, context.fingerprint, {
      statusCode: reply.statusCode,
      payload: serializedPayload(payload),
      contentType,
    });
    contexts.delete(request);
    return payload;
  });
}
