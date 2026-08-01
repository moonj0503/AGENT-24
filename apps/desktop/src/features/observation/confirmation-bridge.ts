import {
  GoalInferenceResultSchema,
  GoalSchema,
  type Goal,
} from "@continuity/contracts";
import { confirmGoal } from "../goals/api";
import {
  clearPendingGoalConfirmation,
  getPendingGoalConfirmationSnapshot,
  setPendingGoalConfirmation,
  type GoalConfirmationReason,
  type PendingGoalConfirmation,
} from "../goals/pending-confirmation-store";
import {
  getConfirmedGoalSnapshot,
  setConfirmedGoal,
} from "../goals/confirmed-goal-store";
import {
  dismissOverlay,
  getOverlaySnapshot,
  setGoalConfirmation,
} from "../../overlay/overlay-store";
import {
  isNativeOverlayAvailable,
  listenForTauriEvent,
  showOverlayForEvent,
  TAURI_EVENTS,
} from "../../lib/tauri";
import { candidateSignature } from "./stability";
import type { ObservationSessionController } from "./observation-session-controller";
import {
  GOAL_CONFIRMATION_REQUESTED_EVENT,
  type GoalConfirmationRequested,
} from "./types";
import { localDate, type PersistedObservationState } from "./persistence";

export const DEFAULT_CONFIRMATION_SNOOZE_MS = 30 * 60_000;

export interface ConfirmationBridgeDependencies {
  readonly controller: ObservationSessionController;
  readonly confirmGoal: typeof confirmGoal;
  readonly now: () => number;
  readonly snoozeDurationMs: number;
  readonly onError: (message: string) => void;
  readonly onStateChanged?: () => void;
  readonly onGoalConfirmed?: (goal: Goal) => void;
  readonly onDeferredGapStartCancelled?: () => void;
}

function parsedRequest(value: unknown): GoalConfirmationRequested | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<GoalConfirmationRequested>;
  if (candidate.type !== "GoalConfirmationRequested") return undefined;
  if (typeof candidate.candidateSignature !== "string") return undefined;
  if (typeof candidate.requestedAt !== "number") return undefined;
  const inference = GoalInferenceResultSchema.safeParse(candidate.inference);
  if (!inference.success) return undefined;
  const topCandidate = inference.data.candidates[0];
  if (!topCandidate || candidateSignature(topCandidate) !== candidate.candidateSignature) {
    return undefined;
  }
  return {
    type: "GoalConfirmationRequested",
    inference: inference.data,
    candidate: topCandidate,
    candidateSignature: candidate.candidateSignature,
    requestedAt: candidate.requestedAt,
  };
}

export class GoalConfirmationBridge {
  private readonly ignoredSignatures = new Set<string>();
  private started = false;
  private snoozedUntil?: number;
  private snoozeTimer?: ReturnType<typeof setTimeout>;
  private confirmation?: Promise<Goal>;
  private deferredGapStart?: () => Promise<void>;
  private windowListener?: (event: Event) => void;
  private nativeUnsubscribes: Array<() => void> = [];

  constructor(private readonly dependencies: ConfirmationBridgeDependencies, initial?: PersistedObservationState) {
    this.snoozedUntil = initial?.snoozedUntil;
    const today = localDate(dependencies.now());
    initial?.ignoredCandidates.filter((item) => item.ignoredOn === today).forEach((item) => this.ignoredSignatures.add(item.signature));
    if (this.snoozedUntil && this.snoozedUntil > dependencies.now()) dependencies.controller.snooze();
  }

  async start(): Promise<() => void> {
    if (this.started) return () => undefined;
    this.started = true;
    if (this.snoozedUntil !== undefined) {
      const remaining = this.snoozedUntil - this.dependencies.now();
      if (remaining > 0) this.snoozeTimer = setTimeout(() => this.expireSnooze(), remaining);
      else this.expireSnooze();
    }
    this.windowListener = (event) => {
      const request = parsedRequest((event as CustomEvent<unknown>).detail);
      if (request) void this.requestConfirmation(request);
    };
    window.addEventListener(GOAL_CONFIRMATION_REQUESTED_EVENT, this.windowListener);
    this.nativeUnsubscribes = await Promise.all([
      listenForTauriEvent(TAURI_EVENTS.GOAL_CONFIRMED, ({ goal }) => {
        const result = GoalSchema.safeParse(goal);
        if (result.success) void this.completeConfirmation(result.data);
      }),
      listenForTauriEvent(TAURI_EVENTS.GOAL_CONFIRMATION_RESOLVED, (resolution) => {
        if (resolution.action === "LATER") this.later();
        else if (resolution.action === "IGNORE") this.ignoreCurrent();
        else this.keepCurrent();
      }),
    ]);
    return () => this.stop();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.windowListener) {
      window.removeEventListener(GOAL_CONFIRMATION_REQUESTED_EVENT, this.windowListener);
    }
    this.windowListener = undefined;
    this.nativeUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.nativeUnsubscribes = [];
    if (this.snoozeTimer !== undefined) clearTimeout(this.snoozeTimer);
    this.snoozeTimer = undefined;
    this.deferredGapStart = undefined;
    clearPendingGoalConfirmation();
  }

  async requestConfirmation(
    request: GoalConfirmationRequested,
    reason?: GoalConfirmationReason,
  ): Promise<boolean> {
    if (this.ignoredSignatures.has(request.candidateSignature)) return false;
    if (this.snoozedUntil !== undefined && this.dependencies.now() < this.snoozedUntil) {
      return false;
    }
    const overlayState = getOverlaySnapshot().state;
    if (overlayState !== null && overlayState !== "HIDDEN") return false;
    const previousGoal = getConfirmedGoalSnapshot().confirmedGoal;
    const pending: PendingGoalConfirmation = {
      inference: request.inference,
      candidateSignature: request.candidateSignature,
      requestedAt: request.requestedAt,
      previousGoal,
      reason: reason ?? (this.deferredGapStart ? "GAP_START" : previousGoal ? "GOAL_CHANGE" : "NEW_GOAL"),
    };
    setPendingGoalConfirmation(pending);

    if (isNativeOverlayAvailable()) {
      try {
        if (await showOverlayForEvent(TAURI_EVENTS.GOAL_CONFIRMATION, {
          inference: pending.inference,
          pending,
        })) return true;
      } catch {
        // Safely fall back to the existing main-window overlay.
      }
    }
    setGoalConfirmation(pending.inference);
    return true;
  }

  confirmCandidate(candidateId: string): Promise<Goal> {
    if (this.confirmation) return this.confirmation;
    const pending = getPendingGoalConfirmationSnapshot().pending;
    if (!pending || !pending.inference.candidates.some((item) => item.candidateId === candidateId)) {
      return Promise.reject(new Error("That goal candidate is no longer available."));
    }
    this.confirmation = this.dependencies.confirmGoal(pending.inference, candidateId)
      .then((goal) => this.completeConfirmation(goal))
      .finally(() => { this.confirmation = undefined; });
    return this.confirmation;
  }

  later(): void {
    this.snoozedUntil = this.dependencies.now() + this.dependencies.snoozeDurationMs;
    this.dependencies.controller.snooze();
    if (this.snoozeTimer !== undefined) clearTimeout(this.snoozeTimer);
    this.snoozeTimer = setTimeout(() => {
      this.expireSnooze();
    }, this.dependencies.snoozeDurationMs);
    const cancelledGapStart = this.deferredGapStart !== undefined;
    this.deferredGapStart = undefined;
    if (cancelledGapStart) this.dependencies.onDeferredGapStartCancelled?.();
    this.dependencies.onStateChanged?.();
    this.clearAndDismiss();
  }

  ignoreCurrent(): void {
    const signature = getPendingGoalConfirmationSnapshot().pending?.candidateSignature;
    if (signature) this.ignoredSignatures.add(signature);
    const cancelledGapStart = this.deferredGapStart !== undefined;
    this.deferredGapStart = undefined;
    if (cancelledGapStart) this.dependencies.onDeferredGapStartCancelled?.();
    this.dependencies.onStateChanged?.();
    this.clearAndDismiss();
  }

  keepCurrent(): void {
    this.ignoreCurrent();
  }

  async requestGapStart(start: () => Promise<void>): Promise<boolean> {
    if (this.deferredGapStart) return false;
    let started = false;
    this.deferredGapStart = async () => {
      if (started) return;
      started = true;
      await start();
    };
    const inference = this.dependencies.controller.getSnapshot().latestInference;
    const candidate = inference?.candidates[0];
    if (!inference || !candidate) return false;
    await this.requestConfirmation({
      type: "GoalConfirmationRequested",
      inference,
      candidate,
      candidateSignature: candidateSignature(candidate),
      requestedAt: this.dependencies.now(),
    }, "GAP_START");
    return false;
  }

  isIgnored(signature: string): boolean {
    return this.ignoredSignatures.has(signature);
  }

  getPersistentFields(): Pick<PersistedObservationState, "snoozedUntil" | "ignoredCandidates"> {
    return {
      snoozedUntil: this.snoozedUntil,
      ignoredCandidates: [...this.ignoredSignatures].map((signature) => ({ signature, ignoredOn: localDate(this.dependencies.now()) })),
    };
  }

  private async completeConfirmation(goal: Goal): Promise<Goal> {
    setConfirmedGoal(goal);
    this.dependencies.onGoalConfirmed?.(goal);
    this.dependencies.controller.clearSnooze();
    this.snoozedUntil = undefined;
    if (this.snoozeTimer !== undefined) clearTimeout(this.snoozeTimer);
    this.snoozeTimer = undefined;
    this.dependencies.onStateChanged?.();
    this.clearAndDismiss();
    const start = this.deferredGapStart;
    this.deferredGapStart = undefined;
    if (start) {
      try {
        await start();
      } catch {
        this.dependencies.onError("The Goal was confirmed, but Gap Mode could not start.");
      }
    }
    return goal;
  }

  private clearAndDismiss(): void {
    clearPendingGoalConfirmation();
    dismissOverlay();
  }

  private expireSnooze(): void {
    this.snoozedUntil = undefined;
    this.snoozeTimer = undefined;
    this.dependencies.controller.clearSnooze();
    this.dependencies.onStateChanged?.();
  }
}
