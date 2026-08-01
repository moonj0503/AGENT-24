import { GOAL_CONFIRMATION_REQUESTED_EVENT, OBSERVATION_WORKFLOW_ERROR_EVENT, type GoalConfirmationRequested } from "./types";
import { requestGoalInference, uploadObservations } from "./api";
import { captureObservationScreenshot, collectSanitizedActivity } from "./native";
import { ObservationSessionController } from "./observation-session-controller";
import { getOverlaySnapshot } from "../../overlay/overlay-store";
import { clearConfirmedGoal, getConfirmedGoalSnapshot, setConfirmedGoal } from "../goals/confirmed-goal-store";
import { DEFAULT_CONFIRMATION_SNOOZE_MS, GoalConfirmationBridge } from "./confirmation-bridge";
import { MemoryObservationPersistence, PersistenceCoordinator, TauriObservationPersistence, restoreObservationState, type ObservationPersistence, type PersistedObservationState } from "./persistence";
import { invokeNative, isNativeOverlayAvailable, listenForTauriEvent, showOverlayForEvent, TAURI_EVENTS } from "../../lib/tauri";
import { isApplicationBlocked, normalizeApplicationIdentifier } from "./queue";
import { initializeDesktopWorkflowController } from "../workflow/controller";
import { getDesktopWorkflowState } from "../workflow/store";

function warning(message: string): void { window.dispatchEvent(new CustomEvent(OBSERVATION_WORKFLOW_ERROR_EVENT, { detail: message })); }
function emitConfirmationRequest(event: GoalConfirmationRequested): void { window.dispatchEvent(new CustomEvent(GOAL_CONFIRMATION_REQUESTED_EVENT, { detail: event })); }

export interface DesktopObservationWorkflow {
  readonly session: ObservationSessionController;
  readonly confirmationBridge: GoalConfirmationBridge;
  readonly workSessionId: string;
  getState(): PersistedObservationState;
  start(): void;
  beginGapMode(): Promise<void>;
  endGapMode(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  addBlockedApplication(identifier: string): Promise<void>;
  removeBlockedApplication(identifier: string): Promise<void>;
  clearLocalState(clearGoal: boolean): Promise<void>;
  shutdown(): Promise<void>;
}

let activeWorkflow: DesktopObservationWorkflow | undefined;
let initialization: Promise<DesktopObservationWorkflow> | undefined;

export function createDesktopObservationWorkflow(options: { persistence?: ObservationPersistence; now?: () => number; createId?: () => string } = {}): Promise<DesktopObservationWorkflow> {
  if (initialization) return initialization;
  initialization = initialize(options).catch((error) => { initialization = undefined; throw error; });
  return initialization;
}

async function initialize(options: { persistence?: ObservationPersistence; now?: () => number; createId?: () => string }): Promise<DesktopObservationWorkflow> {
  const now = options.now ?? (() => Date.now());
  const persistence = options.persistence ?? (isNativeOverlayAvailable() ? new TauriObservationPersistence() : new MemoryObservationPersistence());
  let raw: unknown;
  try { raw = await persistence.load(); } catch { warning("Observation data could not be restored."); }
  const state = restoreObservationState(raw, now(), options.createId);
  if (state.confirmedGoal) setConfirmedGoal(state.confirmedGoal); else clearConfirmedGoal();
  const productWorkflow = initializeDesktopWorkflowController(state.workSessionId, state.confirmedGoal);
  let gapIntentPending = state.gapIntentPending;
  let blockedApplications = [...state.privacy.blockedApplications];
  const syncNativePrivacy = async () => { if (isNativeOverlayAvailable()) await invokeNative("set_user_blocked_applications", { applications: blockedApplications }); };
  try { await syncNativePrivacy(); } catch { warning("Privacy settings could not be saved."); }
  let coordinator: PersistenceCoordinator;
  let bridge: GoalConfirmationBridge;
  let autoEndingGap = false;
  const autoEndGap = async (): Promise<void> => {
    const phase = getDesktopWorkflowState().phase;
    if (autoEndingGap || (phase !== "GAP_ACTIVE" && phase !== "AWAITING_APPROVAL")) return;
    autoEndingGap = true;
    try {
      const brief = await productWorkflow.endGap();
      session.stop();
      window.dispatchEvent(new CustomEvent("continuity:open-main-screen", { detail: "recovery" }));
      if (isNativeOverlayAvailable()) await showOverlayForEvent(TAURI_EVENTS.RECOVERY_READY, { brief });
    } catch {
      warning("The idle Gap could not be completed automatically.");
    } finally {
      gapIntentPending = false;
      await coordinator?.flush().catch(() => warning("Observation data could not be saved."));
      autoEndingGap = false;
    }
  };
  const session = new ObservationSessionController(state.workSessionId, {
    collectActivity: collectSanitizedActivity,
    captureScreenshot: () => captureObservationScreenshot(state.workSessionId),
    upload: uploadObservations,
    infer: requestGoalInference,
    getConfirmedGoal: () => getConfirmedGoalSnapshot().confirmedGoal,
    canRequestConfirmation: () => { const overlay = getOverlaySnapshot().state; return overlay === null || overlay === "HIDDEN"; },
    onConfirmationRequested: emitConfirmationRequest,
    now,
    isApplicationBlocked: (event) => isApplicationBlocked(event, blockedApplications),
    onStateChanged: (critical) => critical ? void coordinator?.flush().catch(() => warning("Observation data could not be saved.")) : coordinator?.schedule(),
    onWarning: warning,
    onUserIdle: () => { void autoEndGap(); },
  }, undefined, state);
  bridge = new GoalConfirmationBridge({
    controller: session,
    confirmGoal: (inference, candidateId) => import("../goals/api").then(({ confirmGoal }) => confirmGoal(inference, candidateId)),
    now, snoozeDurationMs: DEFAULT_CONFIRMATION_SNOOZE_MS, onError: warning,
    onStateChanged: () => void coordinator?.flush().catch(() => warning("Observation data could not be saved.")),
    onGoalConfirmed: (goal) => productWorkflow.setConfirmedGoal(goal),
    onDeferredGapStartCancelled: () => {
      gapIntentPending = false;
      session.stop();
      productWorkflow.cancelGapIntent();
      void coordinator?.flush().catch(() => warning("Observation data could not be saved."));
    },
  }, state);
  const readState = (): PersistedObservationState => ({
    ...state,
    ...session.getPersistentFields(),
    ...bridge.getPersistentFields(),
    confirmedGoal: getConfirmedGoalSnapshot().confirmedGoal,
    gapIntentPending,
    privacy: { blockedApplications },
  });
  coordinator = new PersistenceCoordinator(persistence, readState);
  const activateGap = async () => {
    try {
      if (isNativeOverlayAvailable()) await requestFilePermission(getConfirmedGoalSnapshot().confirmedGoal?.title ?? "Confirmed Goal");
      await productWorkflow.startGap(session.getSnapshot().latestInference);
      window.dispatchEvent(new CustomEvent("continuity:open-main-screen", { detail: "gap" }));
    } catch (error) {
      session.stop();
      throw error;
    } finally {
      gapIntentPending = false;
      await coordinator.flush();
    }
  };
  const workflow: DesktopObservationWorkflow = {
    session, confirmationBridge: bridge, workSessionId: state.workSessionId, getState: readState,
    start: () => {
      void bridge.start().then(() => {
        if (gapIntentPending) {
          productWorkflow.beginGapIntent();
          if (session.getSnapshot().status === "PAUSED") session.resume(); else session.start();
          void bridge.requestGapStart(activateGap);
        }
      });
    },
    beginGapMode: async () => {
      if (gapIntentPending) return;
      gapIntentPending = true;
      clearConfirmedGoal();
      productWorkflow.beginGapIntent();
      session.beginGapObservation();
      if (session.getSnapshot().status === "PAUSED") session.resume(); else session.start();
      await coordinator.flush();
      await bridge.requestGapStart(activateGap);
    },
    endGapMode: async () => {
      session.stop();
      await coordinator.flush();
    },
    pause: async () => { session.pause(); await coordinator.flush(); },
    resume: async () => { session.resume(); await coordinator.flush(); },
    addBlockedApplication: async (value) => { const id = normalizeApplicationIdentifier(value); if (id && !blockedApplications.includes(id)) blockedApplications = [...blockedApplications, id]; await syncNativePrivacy(); await coordinator.flush(); },
    removeBlockedApplication: async (value) => { blockedApplications = blockedApplications.filter((id) => id !== normalizeApplicationIdentifier(value)); await syncNativePrivacy(); await coordinator.flush(); },
    clearLocalState: async (clearGoal) => { session.stop(); blockedApplications = []; if (clearGoal) { clearConfirmedGoal(); productWorkflow.clear(); } await persistence.clear(); initialization = undefined; activeWorkflow = undefined; },
    shutdown: async () => { bridge.stop(); session.shutdown(); await coordinator.flush(); if (activeWorkflow === workflow) activeWorkflow = undefined; initialization = undefined; },
  };
  activeWorkflow = workflow;
  return workflow;
}

async function requestFilePermission(goalTitle: string): Promise<void> {
  let resolveDecision: () => void = () => undefined;
  const decision = new Promise<void>((resolve) => { resolveDecision = resolve; });
  const unsubscribe = await listenForTauriEvent(TAURI_EVENTS.FILE_PERMISSION_DECIDED, () => { unsubscribe(); resolveDecision(); });
  try { await showOverlayForEvent(TAURI_EVENTS.FILE_PERMISSION_REQUESTED, { goalTitle }); }
  catch (cause) { unsubscribe(); throw cause; }
  await decision;
}

export function getDesktopObservationWorkflow(): DesktopObservationWorkflow | undefined { return activeWorkflow; }
