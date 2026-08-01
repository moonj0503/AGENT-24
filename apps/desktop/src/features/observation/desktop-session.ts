import { GOAL_CONFIRMATION_REQUESTED_EVENT, OBSERVATION_WORKFLOW_ERROR_EVENT, type GoalConfirmationRequested } from "./types";
import { requestGoalInference, uploadObservations } from "./api";
import { collectSanitizedActivity } from "./native";
import { ObservationSessionController } from "./observation-session-controller";
import { getOverlaySnapshot } from "../../overlay/overlay-store";
import { clearConfirmedGoal, getConfirmedGoalSnapshot, setConfirmedGoal } from "../goals/confirmed-goal-store";
import { DEFAULT_CONFIRMATION_SNOOZE_MS, GoalConfirmationBridge } from "./confirmation-bridge";
import { MemoryObservationPersistence, PersistenceCoordinator, TauriObservationPersistence, restoreObservationState, type ObservationPersistence, type PersistedObservationState } from "./persistence";
import { invokeNative, isNativeOverlayAvailable } from "../../lib/tauri";
import { isApplicationBlocked, normalizeApplicationIdentifier } from "./queue";

function warning(message: string): void { window.dispatchEvent(new CustomEvent(OBSERVATION_WORKFLOW_ERROR_EVENT, { detail: message })); }
function emitConfirmationRequest(event: GoalConfirmationRequested): void { window.dispatchEvent(new CustomEvent(GOAL_CONFIRMATION_REQUESTED_EVENT, { detail: event })); }

export interface DesktopObservationWorkflow {
  readonly session: ObservationSessionController;
  readonly confirmationBridge: GoalConfirmationBridge;
  readonly workSessionId: string;
  getState(): PersistedObservationState;
  start(): void;
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
  let blockedApplications = [...state.privacy.blockedApplications];
  const syncNativePrivacy = async () => { if (isNativeOverlayAvailable()) await invokeNative("set_user_blocked_applications", { applications: blockedApplications }); };
  try { await syncNativePrivacy(); } catch { warning("Privacy settings could not be saved."); }
  let coordinator: PersistenceCoordinator;
  let bridge: GoalConfirmationBridge;
  const session = new ObservationSessionController(state.workSessionId, {
    collectActivity: collectSanitizedActivity,
    upload: uploadObservations,
    infer: requestGoalInference,
    getConfirmedGoal: () => getConfirmedGoalSnapshot().confirmedGoal,
    canRequestConfirmation: () => { const overlay = getOverlaySnapshot().state; return overlay === null || overlay === "HIDDEN"; },
    onConfirmationRequested: emitConfirmationRequest,
    now,
    isApplicationBlocked: (event) => isApplicationBlocked(event, blockedApplications),
    onStateChanged: (critical) => critical ? void coordinator?.flush().catch(() => warning("Observation data could not be saved.")) : coordinator?.schedule(),
    onWarning: warning,
  }, undefined, state);
  bridge = new GoalConfirmationBridge({
    controller: session,
    confirmGoal: (inference, candidateId) => import("../goals/api").then(({ confirmGoal }) => confirmGoal(inference, candidateId)),
    now, snoozeDurationMs: DEFAULT_CONFIRMATION_SNOOZE_MS, onError: warning,
    onStateChanged: () => void coordinator?.flush().catch(() => warning("Observation data could not be saved.")),
  }, state);
  const readState = (): PersistedObservationState => ({
    ...state,
    ...session.getPersistentFields(),
    ...bridge.getPersistentFields(),
    confirmedGoal: getConfirmedGoalSnapshot().confirmedGoal,
    privacy: { blockedApplications },
  });
  coordinator = new PersistenceCoordinator(persistence, readState);
  const workflow: DesktopObservationWorkflow = {
    session, confirmationBridge: bridge, workSessionId: state.workSessionId, getState: readState,
    start: () => { if (state.observationStatus === "RUNNING") session.start(); void bridge.start(); },
    pause: async () => { session.pause(); await coordinator.flush(); },
    resume: async () => { session.resume(); await coordinator.flush(); },
    addBlockedApplication: async (value) => { const id = normalizeApplicationIdentifier(value); if (id && !blockedApplications.includes(id)) blockedApplications = [...blockedApplications, id]; await syncNativePrivacy(); await coordinator.flush(); },
    removeBlockedApplication: async (value) => { blockedApplications = blockedApplications.filter((id) => id !== normalizeApplicationIdentifier(value)); await syncNativePrivacy(); await coordinator.flush(); },
    clearLocalState: async (clearGoal) => { session.stop(); blockedApplications = []; if (clearGoal) clearConfirmedGoal(); await persistence.clear(); initialization = undefined; activeWorkflow = undefined; },
    shutdown: async () => { bridge.stop(); session.shutdown(); await coordinator.flush(); if (activeWorkflow === workflow) activeWorkflow = undefined; initialization = undefined; },
  };
  activeWorkflow = workflow;
  return workflow;
}

export function getDesktopObservationWorkflow(): DesktopObservationWorkflow | undefined { return activeWorkflow; }
