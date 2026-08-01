import {
  GOAL_CONFIRMATION_REQUESTED_EVENT,
  OBSERVATION_WORKFLOW_ERROR_EVENT,
  type GoalConfirmationRequested,
} from "./types";
import { requestGoalInference, uploadObservations } from "./api";
import { collectSanitizedActivity } from "./native";
import { ObservationSessionController } from "./observation-session-controller";
import { getOverlaySnapshot } from "../../overlay/overlay-store";
import { getConfirmedGoalSnapshot } from "../goals/confirmed-goal-store";
import {
  DEFAULT_CONFIRMATION_SNOOZE_MS,
  GoalConfirmationBridge,
} from "./confirmation-bridge";

function emitConfirmationRequest(event: GoalConfirmationRequested): void {
  window.dispatchEvent(new CustomEvent(GOAL_CONFIRMATION_REQUESTED_EVENT, { detail: event }));
}

export function createDesktopObservationSession(): ObservationSessionController {
  return new ObservationSessionController(crypto.randomUUID(), {
    collectActivity: collectSanitizedActivity,
    upload: uploadObservations,
    infer: requestGoalInference,
    getConfirmedGoal: () => getConfirmedGoalSnapshot().confirmedGoal,
    canRequestConfirmation: () => {
      const overlayState = getOverlaySnapshot().state;
      return overlayState === null || overlayState === "HIDDEN";
    },
    onConfirmationRequested: emitConfirmationRequest,
    now: () => Date.now(),
  });
}

export interface DesktopObservationWorkflow {
  readonly session: ObservationSessionController;
  readonly confirmationBridge: GoalConfirmationBridge;
  start(): void;
  stop(): void;
}

let activeWorkflow: DesktopObservationWorkflow | undefined;

export function createDesktopObservationWorkflow(): DesktopObservationWorkflow {
  const session = createDesktopObservationSession();
  const confirmationBridge = new GoalConfirmationBridge({
    controller: session,
    confirmGoal: (inference, candidateId) => import("../goals/api")
      .then(({ confirmGoal }) => confirmGoal(inference, candidateId)),
    now: () => Date.now(),
    snoozeDurationMs: DEFAULT_CONFIRMATION_SNOOZE_MS,
    onError: (message) => window.dispatchEvent(new CustomEvent(
      OBSERVATION_WORKFLOW_ERROR_EVENT,
      { detail: message },
    )),
  });
  const workflow: DesktopObservationWorkflow = {
    session,
    confirmationBridge,
    start: () => {
      session.start();
      void confirmationBridge.start();
    },
    stop: () => {
      confirmationBridge.stop();
      session.stop();
      if (activeWorkflow === workflow) activeWorkflow = undefined;
    },
  };
  activeWorkflow = workflow;
  return workflow;
}

export function getDesktopObservationWorkflow(): DesktopObservationWorkflow | undefined {
  return activeWorkflow;
}
