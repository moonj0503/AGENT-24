import type { ActivityEvent, GoalInferenceResult } from "@continuity/contracts";
import { candidateSignature, evaluateStability } from "./stability";
import type {
  GoalConfirmationRequested,
  ObservationSessionConfig,
  ObservationSessionDependencies,
  ObservationSessionSnapshot,
  ObservationSessionStatus,
} from "./types";

export const DEFAULT_OBSERVATION_SESSION_CONFIG: ObservationSessionConfig = Object.freeze({
  observationIntervalMs: 3_000,
  uploadIntervalMs: 30_000,
  inferenceIntervalMs: 5 * 60_000,
  confidenceThreshold: 0.8,
  stableInferenceCount: 2,
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
  private uploadTimer?: ReturnType<typeof setInterval>;
  private inferenceTimer?: ReturnType<typeof setInterval>;
  private observing = false;
  private uploading = false;
  private inferring = false;
  private lastObservationSignature?: string;
  private readonly pendingObservations = new Map<string, ActivityEvent>();
  private readonly pendingInferenceEventIds = new Set<string>();
  private latestInference?: GoalInferenceResult;
  private topCandidateSignature?: string;
  private candidateConfidence?: number;
  private consecutiveCandidateCount = 0;
  private lastInferenceAt?: number;
  private lastPopupAt?: number;
  private snoozed = false;

  constructor(
    private readonly workSessionId: string,
    private readonly dependencies: ObservationSessionDependencies,
    private readonly config: ObservationSessionConfig = DEFAULT_OBSERVATION_SESSION_CONFIG,
  ) {}

  start(): void {
    if (this.status !== "STOPPED") return;
    this.status = "RUNNING";
    this.generation += 1;
    this.schedule();
  }

  pause(): void {
    if (this.status !== "RUNNING") return;
    this.status = "PAUSED";
    this.generation += 1;
    this.clearTimers();
  }

  resume(): void {
    if (this.status !== "PAUSED") return;
    this.status = "RUNNING";
    this.generation += 1;
    this.schedule();
  }

  stop(): void {
    if (this.status === "STOPPED") return;
    this.status = "STOPPED";
    this.generation += 1;
    this.clearTimers();
    this.pendingObservations.clear();
    this.pendingInferenceEventIds.clear();
    this.latestInference = undefined;
    this.topCandidateSignature = undefined;
    this.candidateConfidence = undefined;
    this.consecutiveCandidateCount = 0;
    this.lastInferenceAt = undefined;
    this.lastPopupAt = undefined;
    this.lastObservationSignature = undefined;
    this.snoozed = false;
  }

  snooze(): void {
    this.snoozed = true;
  }

  clearSnooze(): void {
    this.snoozed = false;
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
    if (this.uploadTimer !== undefined) clearInterval(this.uploadTimer);
    if (this.inferenceTimer !== undefined) clearInterval(this.inferenceTimer);
    this.observationTimer = undefined;
    this.uploadTimer = undefined;
    this.inferenceTimer = undefined;
  }

  private async observeCycle(): Promise<void> {
    if (this.status !== "RUNNING" || this.observing) return;
    this.observing = true;
    const generation = this.generation;
    try {
      const event = await this.dependencies.collectActivity();
      if (!event || !this.isCurrent(generation)) return;
      const signature = observationSignature(event);
      if (signature === this.lastObservationSignature) return;
      this.lastObservationSignature = signature;
      this.pendingObservations.set(event.eventId, event);
    } catch {
      // Observation failures are retried on the next scheduled cycle.
    } finally {
      this.observing = false;
    }
  }

  private async uploadCycle(): Promise<void> {
    if (this.status !== "RUNNING" || this.uploading || this.pendingObservations.size === 0) {
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
      }
    } catch {
      // Pending observations remain buffered for the next upload cycle.
    } finally {
      this.uploading = false;
    }
  }

  private async inferenceCycle(): Promise<void> {
    if (
      this.status !== "RUNNING"
      || this.inferring
      || this.pendingInferenceEventIds.size === 0
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
    } catch {
      // Keep the previous inference and event IDs so the next cycle can retry.
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
