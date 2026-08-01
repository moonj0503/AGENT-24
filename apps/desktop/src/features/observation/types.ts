import type {
  ActivityEvent,
  Goal,
  GoalCandidate,
  GoalInferenceResult,
  ObservationIngestionResult,
} from "@continuity/contracts";

export type ObservationSessionStatus = "STOPPED" | "RUNNING" | "PAUSED";
export type StabilityDecision = "SHOW_CONFIRMATION" | "KEEP_OBSERVING";
export const GOAL_CONFIRMATION_REQUESTED_EVENT = "continuity:goal-confirmation-requested";
export const GOAL_INFERENCE_UPDATED_EVENT = "continuity:goal-inference-updated";
export const INTERRUPTION_RESUMED_EVENT = "continuity:interruption-resumed";
export const OBSERVATION_WORKFLOW_ERROR_EVENT = "continuity:observation-workflow-error";

export interface ObservationSessionConfig {
  readonly observationIntervalMs: number;
  readonly screenshotIntervalMs: number;
  readonly uploadIntervalMs: number;
  readonly inferenceIntervalMs: number;
  readonly confidenceThreshold: number;
  readonly stableInferenceCount: number;
  /** Number of already-sanitized observations included with each inference. */
  readonly inferenceContextEventLimit: number;
  /** A repeated, moderately confident candidate can be offered for confirmation. */
  readonly corroboratedConfidenceThreshold: number;
  readonly corroboratedInferenceCount: number;
  readonly popupCooldownMs: number;
}

export interface ObservationSessionSnapshot {
  readonly status: ObservationSessionStatus;
  readonly latestInference?: GoalInferenceResult;
  readonly candidateSignature?: string;
  readonly candidateConfidence?: number;
  readonly consecutiveCandidateCount: number;
  readonly lastInferenceAt?: number;
  readonly lastPopupAt?: number;
  readonly snoozed: boolean;
  readonly pendingObservationCount: number;
  readonly pendingInferenceCount: number;
}

export interface GoalConfirmationRequested {
  readonly type: "GoalConfirmationRequested";
  readonly inference: GoalInferenceResult;
  readonly candidate: GoalCandidate;
  readonly candidateSignature: string;
  readonly requestedAt: number;
}

/** A safe, non-blocking candidate update for the main Desktop window. */
export interface GoalInferenceUpdated {
  readonly inference: GoalInferenceResult;
  readonly candidate: GoalCandidate;
  readonly candidateSignature: string;
  readonly observedAt: number;
  readonly averageConfidence: number;
}

/** A local observation marker, not a diagnosis or a medical alert. */
export interface InterruptionResumed {
  readonly observedIdleAt: number;
  readonly resumedAt: number;
  readonly durationMs: number;
}

export interface ObservationSessionDependencies {
  readonly collectActivity: () => Promise<ActivityEvent | null>;
  readonly captureScreenshot?: () => Promise<void>;
  readonly upload: (
    workSessionId: string,
    events: readonly ActivityEvent[],
  ) => Promise<ObservationIngestionResult>;
  readonly infer: (
    workSessionId: string,
    observationEventIds: readonly string[],
    previousGoalId?: string,
  ) => Promise<GoalInferenceResult>;
  readonly getConfirmedGoal: () => Goal | undefined;
  readonly canRequestConfirmation: () => boolean;
  readonly onConfirmationRequested: (event: GoalConfirmationRequested) => void;
  readonly onInferenceUpdated?: (event: GoalInferenceUpdated) => void;
  readonly onInterruptionResumed?: (event: InterruptionResumed) => void;
  readonly now: () => number;
  readonly onStateChanged?: (critical: boolean) => void;
  readonly onWarning?: (message: string) => void;
  readonly isApplicationBlocked?: (event: ActivityEvent) => boolean;
}
