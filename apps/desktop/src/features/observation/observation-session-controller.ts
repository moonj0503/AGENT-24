import type { ActivityEvent, GoalInferenceResult } from "@continuity/contracts";
import { candidateSignature, evaluateStability } from "./stability";
import type {
  GoalConfirmationRequested,
  ObservationSessionConfig,
  ObservationSessionDependencies,
  ObservationSessionSnapshot,
  ObservationSessionStatus,
} from "./types";
import type { PersistedObservationState } from "./persistence";
import { boundedObservationQueue, type QueueLimits, DEFAULT_QUEUE_LIMITS } from "./queue";
import { ExponentialBackoff } from "./backoff";

export const DEFAULT_OBSERVATION_SESSION_CONFIG: ObservationSessionConfig = Object.freeze({
  observationIntervalMs: 3_000,
  screenshotIntervalMs: 20_000,
  uploadIntervalMs: 30_000,
  inferenceIntervalMs: 20_000,
  confidenceThreshold: 0.8,
  stableInferenceCount: 1,
  popupCooldownMs: 15 * 60_000,
});

function observationSignature(event: ActivityEvent): string {
  return JSON.stringify({
    type: event.type,
    application: event.application,
    resource: event.resource,
  });
}

export class ObservationSessionController {
  private status: ObservationSessionStatus = "STOPPED";
  private generation = 0;
  private observationTimer?: ReturnType<typeof setInterval>;
  private screenshotTimer?: ReturnType<typeof setInterval>;
  private uploadTimer?: ReturnType<typeof setInterval>;
  private inferenceTimer?: ReturnType<typeof setInterval>;
  private observing = false;
  private capturingScreenshot = false;
  private uploading = false;
  private inferring = false;
  private lastObservationSignature?: string;
  private readonly pendingObservations = new Map<string, ActivityEvent>();
  private readonly pendingInferenceEventIds = new Set<string>();
  private readonly uploadedObservationEventIds = new Set<string>();
  private latestInference?: GoalInferenceResult;
  private topCandidateSignature?: string;
  private candidateConfidence?: number;
  private consecutiveCandidateCount = 0;
  private lastInferenceAt?: number;
  private lastPopupAt?: number;
  private snoozed = false;
  private uploadRetryAt = 0;
  private inferenceRetryAt = 0;
  private initialGapCyclePending = false;
  private readonly uploadBackoff = new ExponentialBackoff();
  private readonly inferenceBackoff = new ExponentialBackoff();

  constructor(
    private readonly workSessionId: string,
    private readonly dependencies: ObservationSessionDependencies,
    private readonly config: ObservationSessionConfig = DEFAULT_OBSERVATION_SESSION_CONFIG,
    initial?: PersistedObservationState,
    private readonly queueLimits: QueueLimits = DEFAULT_QUEUE_LIMITS,
  ) {
    if (initial) {
      const restoredQueue = boundedObservationQueue(initial.pendingObservations, dependencies.now(), queueLimits);
      for (const event of restoredQueue.events) this.pendingObservations.set(event.eventId, event);
      if (restoredQueue.trimmed) dependencies.onWarning?.("The local observation queue reached its limit.");
      for (const id of initial.pendingInferenceEventIds) this.pendingInferenceEventIds.add(id);
      for (const id of initial.uploadedObservationEventIds) this.uploadedObservationEventIds.add(id);
      this.latestInference = initial.latestInference;
      this.topCandidateSignature = initial.candidateSignature;
      this.consecutiveCandidateCount = initial.consecutiveCandidateCount;
      this.lastInferenceAt = initial.lastInferenceAt;
      this.lastPopupAt = initial.lastPopupAt;
      this.snoozed = initial.snoozedUntil !== undefined && initial.snoozedUntil > dependencies.now();
      this.status = initial.observationStatus === "PAUSED" ? "PAUSED" : "STOPPED";
    }
  }

  start(): void {
    if (this.status !== "STOPPED") return;
    this.status = "RUNNING";
    this.generation += 1;
    this.schedule();
    if (this.initialGapCyclePending) {
      this.initialGapCyclePending = false;
      void this.runInitialGapCycle();
    }
    this.dependencies.onStateChanged?.(true);
  }

  pause(): void {
    if (this.status !== "RUNNING") return;
    this.status = "PAUSED";
    this.generation += 1;
    this.clearTimers();
    this.dependencies.onStateChanged?.(true);
  }

  resume(): void {
    if (this.status !== "PAUSED") return;
    this.status = "RUNNING";
    this.generation += 1;
    this.schedule();
    this.dependencies.onStateChanged?.(true);
  }

  shutdown(): void {
    this.generation += 1;
    this.clearTimers();
  }

  stop(): void {
    if (this.status === "STOPPED") return;
    this.status = "STOPPED";
    this.generation += 1;
    this.clearTimers();
    this.pendingObservations.clear();
    this.pendingInferenceEventIds.clear();
    this.uploadedObservationEventIds.clear();
    this.latestInference = undefined;
    this.topCandidateSignature = undefined;
    this.candidateConfidence = undefined;
    this.consecutiveCandidateCount = 0;
    this.lastInferenceAt = undefined;
    this.lastPopupAt = undefined;
    this.lastObservationSignature = undefined;
    this.snoozed = false;
    this.uploadRetryAt = 0;
    this.inferenceRetryAt = 0;
    this.uploadBackoff.reset();
    this.inferenceBackoff.reset();
  }

  snooze(): void {
    this.snoozed = true;
    this.dependencies.onStateChanged?.(true);
  }

  clearSnooze(): void {
    this.snoozed = false;
    this.dependencies.onStateChanged?.(true);
  }

  beginGapObservation(): void {
    this.pendingObservations.clear();
    this.pendingInferenceEventIds.clear();
    this.latestInference = undefined;
    this.topCandidateSignature = undefined;
    this.candidateConfidence = undefined;
    this.consecutiveCandidateCount = 0;
    this.lastInferenceAt = undefined;
    this.lastPopupAt = undefined;
    this.snoozed = false;
    this.lastObservationSignature = undefined;
    this.uploadRetryAt = 0;
    this.inferenceRetryAt = 0;
    this.uploadBackoff.reset();
    this.inferenceBackoff.reset();
    this.initialGapCyclePending = true;
    void this.captureScreenshot();
    this.dependencies.onStateChanged?.(true);
  }

  restoreRunningPreference(): void {
    if (this.status === "PAUSED") return;
    this.start();
  }

  getPersistentFields(): Pick<PersistedObservationState, "observationStatus" | "pendingObservations" | "uploadedObservationEventIds" | "pendingInferenceEventIds" | "latestInference" | "candidateSignature" | "consecutiveCandidateCount" | "lastInferenceAt" | "lastPopupAt"> {
    return {
      observationStatus: this.status === "PAUSED" ? "PAUSED" : "RUNNING",
      pendingObservations: [...this.pendingObservations.values()],
      pendingInferenceEventIds: [...this.pendingInferenceEventIds],
      uploadedObservationEventIds: [...this.uploadedObservationEventIds].slice(-this.queueLimits.maximumEvents),
      latestInference: this.latestInference,
      candidateSignature: this.topCandidateSignature,
      consecutiveCandidateCount: this.consecutiveCandidateCount,
      lastInferenceAt: this.lastInferenceAt,
      lastPopupAt: this.lastPopupAt,
    };
  }

  getSnapshot(): ObservationSessionSnapshot {
    return {
      status: this.status,
      latestInference: this.latestInference,
      candidateSignature: this.topCandidateSignature,
      candidateConfidence: this.candidateConfidence,
      consecutiveCandidateCount: this.consecutiveCandidateCount,
      lastInferenceAt: this.lastInferenceAt,
      lastPopupAt: this.lastPopupAt,
      snoozed: this.snoozed,
      pendingObservationCount: this.pendingObservations.size,
      pendingInferenceCount: this.pendingInferenceEventIds.size,
    };
  }

  private schedule(): void {
    this.observationTimer = setInterval(
      () => { void this.observeCycle(); },
      this.config.observationIntervalMs,
    );
    this.screenshotTimer = setInterval(
      () => { void this.captureScreenshot(); },
      this.config.screenshotIntervalMs,
    );
    this.uploadTimer = setInterval(
      () => { void this.uploadCycle(); },
      this.config.uploadIntervalMs,
    );
    this.inferenceTimer = setInterval(
      () => { void this.inferenceCycle(); },
      this.config.inferenceIntervalMs,
    );
  }

  private clearTimers(): void {
    if (this.observationTimer !== undefined) clearInterval(this.observationTimer);
    if (this.screenshotTimer !== undefined) clearInterval(this.screenshotTimer);
    if (this.uploadTimer !== undefined) clearInterval(this.uploadTimer);
    if (this.inferenceTimer !== undefined) clearInterval(this.inferenceTimer);
    this.observationTimer = undefined;
    this.screenshotTimer = undefined;
    this.uploadTimer = undefined;
    this.inferenceTimer = undefined;
  }

  private async captureScreenshot(): Promise<void> {
    if (this.capturingScreenshot) return;
    this.capturingScreenshot = true;
    try {
      await this.dependencies.captureScreenshot?.();
    } catch {
      this.dependencies.onWarning?.("A local observation screenshot could not be captured.");
    } finally {
      this.capturingScreenshot = false;
    }
  }

  private async runInitialGapCycle(): Promise<void> {
    await this.observeCycle();
    await this.uploadCycle();
    await this.inferenceCycle();
  }

  private async observeCycle(): Promise<void> {
    if (this.status !== "RUNNING" || this.observing) return;
    this.observing = true;
    const generation = this.generation;
    try {
      const event = await this.dependencies.collectActivity();
      if (!event || !this.isCurrent(generation)) return;
      if (this.dependencies.isApplicationBlocked?.(event)) return;
      const signature = observationSignature(event);
      if (this.uploadedObservationEventIds.has(event.eventId)) return;
      if (signature === this.lastObservationSignature) return;
      this.lastObservationSignature = signature;
      this.pendingObservations.set(event.eventId, event);
      const bounded = boundedObservationQueue([...this.pendingObservations.values()], this.dependencies.now(), this.queueLimits);
      if (bounded.trimmed) {
        this.pendingObservations.clear();
        bounded.events.forEach((item) => this.pendingObservations.set(item.eventId, item));
        this.dependencies.onWarning?.("The local observation queue reached its limit.");
      }
      this.dependencies.onStateChanged?.(false);
    } catch {
      // Observation failures are retried on the next scheduled cycle.
    } finally {
      this.observing = false;
    }
  }

  private async uploadCycle(): Promise<void> {
    if (this.status !== "RUNNING" || this.uploading || this.pendingObservations.size === 0 || this.dependencies.now() < this.uploadRetryAt) {
      return;
    }
    this.uploading = true;
    const generation = this.generation;
    const events = [...this.pendingObservations.values()];
    try {
      const result = await this.dependencies.upload(this.workSessionId, events);
      if (!this.isCurrent(generation)) return;
      for (const eventId of result.acceptedEventIds) {
        if (!this.pendingObservations.has(eventId)) continue;
        this.pendingObservations.delete(eventId);
        this.pendingInferenceEventIds.add(eventId);
        this.uploadedObservationEventIds.add(eventId);
      }
      this.uploadBackoff.reset();
      this.uploadRetryAt = 0;
      this.dependencies.onStateChanged?.(true);
    } catch {
      this.uploadRetryAt = this.uploadBackoff.fail(this.dependencies.now());
      this.dependencies.onWarning?.("Observation upload is temporarily unavailable.");
    } finally {
      this.uploading = false;
    }
  }

  private async inferenceCycle(): Promise<void> {
    if (
      this.status !== "RUNNING"
      || this.inferring
      || this.pendingInferenceEventIds.size === 0
      || this.dependencies.now() < this.inferenceRetryAt
    ) {
      return;
    }
    this.inferring = true;
    const generation = this.generation;
    const eventIds = [...this.pendingInferenceEventIds];
    const confirmedGoal = this.dependencies.getConfirmedGoal();
    try {
      const inference = await this.dependencies.infer(
        this.workSessionId,
        eventIds,
        confirmedGoal?.goalId,
      );
      if (!this.isCurrent(generation)) return;
      for (const eventId of eventIds) this.pendingInferenceEventIds.delete(eventId);
      this.applyInference(inference, this.dependencies.getConfirmedGoal());
      this.inferenceBackoff.reset();
      this.inferenceRetryAt = 0;
      this.dependencies.onStateChanged?.(true);
    } catch {
      this.inferenceRetryAt = this.inferenceBackoff.fail(this.dependencies.now());
      this.dependencies.onWarning?.("Goal identification is temporarily unavailable.");
    } finally {
      this.inferring = false;
    }
  }

  private applyInference(
    inference: GoalInferenceResult,
    confirmedGoal: ReturnType<ObservationSessionDependencies["getConfirmedGoal"]>,
  ): void {
    const candidate = inference.candidates[0];
    if (!candidate) return;
    const signature = candidateSignature(candidate);
    this.consecutiveCandidateCount = signature === this.topCandidateSignature
      ? this.consecutiveCandidateCount + 1
      : 1;
    this.latestInference = inference;
    this.topCandidateSignature = signature;
    this.candidateConfidence = candidate.confidence;
    this.lastInferenceAt = this.dependencies.now();
    this.dependencies.onStateChanged?.(false);

    if (evaluateStability({
      candidate,
      signature,
      consecutiveCount: this.consecutiveCandidateCount,
      confidenceThreshold: this.config.confidenceThreshold,
      stableInferenceCount: this.config.stableInferenceCount,
      confirmedGoal,
      snoozed: this.snoozed,
      canRequestConfirmation: this.dependencies.canRequestConfirmation(),
      now: this.lastInferenceAt,
      lastPopupAt: this.lastPopupAt,
      popupCooldownMs: this.config.popupCooldownMs,
    }) === "SHOW_CONFIRMATION") {
      this.lastPopupAt = this.lastInferenceAt;
      this.dependencies.onStateChanged?.(true);
      this.dependencies.onConfirmationRequested({
        type: "GoalConfirmationRequested",
        inference,
        candidate,
        candidateSignature: signature,
        requestedAt: this.lastInferenceAt,
      } satisfies GoalConfirmationRequested);
    }
  }

  private isCurrent(generation: number): boolean {
    return this.status === "RUNNING" && generation === this.generation;
  }
}
