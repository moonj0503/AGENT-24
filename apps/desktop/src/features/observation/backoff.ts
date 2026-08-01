export interface BackoffConfig { readonly initialDelayMs: number; readonly multiplier: number; readonly maximumDelayMs: number; readonly maximumAttempts: number; readonly slowModeIntervalMs: number; }
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = { initialDelayMs: 2_000, multiplier: 2, maximumDelayMs: 120_000, maximumAttempts: 6, slowModeIntervalMs: 300_000 };
export class ExponentialBackoff {
  private failures = 0;
  constructor(private readonly config = DEFAULT_BACKOFF_CONFIG) {}
  fail(now: number): number { this.failures += 1; return now + this.delay(); }
  reset(): void { this.failures = 0; }
  get attemptCount(): number { return this.failures; }
  private delay(): number { return this.failures > this.config.maximumAttempts ? this.config.slowModeIntervalMs : Math.min(this.config.maximumDelayMs, this.config.initialDelayMs * this.config.multiplier ** (this.failures - 1)); }
}
