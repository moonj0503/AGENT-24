export type CompletedIdempotencyResponse = {
  readonly state: "COMPLETED";
  readonly fingerprint: string;
  readonly statusCode: number;
  readonly payload: string;
  readonly contentType?: string;
};

export type IdempotencyResponse = Omit<CompletedIdempotencyResponse, "state" | "fingerprint">;

export type IdempotencyStartResult =
  | { readonly kind: "NEW" }
  | { readonly kind: "REPLAY"; readonly response: CompletedIdempotencyResponse }
  | { readonly kind: "WAIT"; readonly completed: Promise<CompletedIdempotencyResponse> }
  | { readonly kind: "CONFLICT" };

export interface IdempotencyRepository {
  start(key: string, fingerprint: string): Promise<IdempotencyStartResult>;
  complete(key: string, fingerprint: string, response: IdempotencyResponse): Promise<void>;
}
