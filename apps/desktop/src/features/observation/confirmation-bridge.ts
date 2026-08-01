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

export const DEFAULT_CONFIRMATION_SNOOZE_MS = 30 * 60_000;

export interface ConfirmationBridgeDependencies {
  readonly controller: ObservationSessionController;
  readonly confirmGoal: typeof confirmGoal;
  readonly now: () => number;
  readonly snoozeDurationMs: number;
  readonly onError: (message: string) => void;
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

  constructor(private readonly dependencies: ConfirmationBridgeDependencies) {}

  async start(): Promise<() => void> {
    if (this.started) return () => undefined;
    this.started = true;
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
      reason: reason ?? (previousGoal ? "GOAL_CHANGE" : "NEW_GOAL"),
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
      this.snoozedUntil = undefined;
      this.snoozeTimer = undefined;
      this.dependencies.controller.clearSnooze();
    }, this.dependencies.snoozeDurationMs);
    this.deferredGapStart = undefined;
    this.clearAndDismiss();
  }

  ignoreCurrent(): void {
    const signature = getPendingGoalConfirmationSnapshot().pending?.candidateSignature;
    if (signature) this.ignoredSignatures.add(signature);
    this.deferredGapStart = undefined;
    this.clearAndDismiss();
  }

  keepCurrent(): void {
    this.ignoreCurrent();
  }

  async requestGapStart(start: () => Promise<void>): Promise<boolean> {
    if (getConfirmedGoalSnapshot().confirmedGoal) {
      await start();
      return true;
    }
    if (this.deferredGapStart) return false;
    const inference = this.dependencies.controller.getSnapshot().latestInference;
    const candidate = inference?.candidates[0];
    if (!inference || !candidate) {
      this.dependencies.onError("Confirm a Goal before starting Gap Mode.");
      return false;
    }
    let started = false;
    this.deferredGapStart = async () => {
      if (started) return;
      started = true;
      await start();
    };
    const opened = await this.requestConfirmation({
      type: "GoalConfirmationRequested",
      inference,
      candidate,
      candidateSignature: candidateSignature(candidate),
      requestedAt: this.dependencies.now(),
    }, "GAP_START");
    if (!opened) this.deferredGapStart = undefined;
    return false;
  }

  isIgnored(signature: string): boolean {
    return this.ignoredSignatures.has(signature);
  }

  private async completeConfirmation(goal: Goal): Promise<Goal> {
    setConfirmedGoal(goal);
    this.dependencies.controller.clearSnooze();
    this.snoozedUntil = undefined;
    if (this.snoozeTimer !== undefined) clearTimeout(this.snoozeTimer);
    this.snoozeTimer = undefined;
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
}
