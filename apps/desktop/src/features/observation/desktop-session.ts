import type { GoalConfirmationRequested } from "./types";
import { requestGoalInference, uploadObservations } from "./api";
import { collectSanitizedActivity } from "./native";
import { ObservationSessionController } from "./observation-session-controller";
import { getOverlaySnapshot } from "../../overlay/overlay-store";

export const GOAL_CONFIRMATION_REQUESTED_EVENT =
  "continuity:goal-confirmation-requested";

function emitConfirmationRequest(event: GoalConfirmationRequested): void {
  window.dispatchEvent(new CustomEvent(GOAL_CONFIRMATION_REQUESTED_EVENT, { detail: event }));
}

export function createDesktopObservationSession(): ObservationSessionController {
  return new ObservationSessionController(crypto.randomUUID(), {
    collectActivity: collectSanitizedActivity,
    upload: uploadObservations,
    infer: requestGoalInference,
    getConfirmedGoal: () => undefined,
    canRequestConfirmation: () => {
      const overlayState = getOverlaySnapshot().state;
      return overlayState === null || overlayState === "HIDDEN";
    },
    onConfirmationRequested: emitConfirmationRequest,
    now: () => Date.now(),
  });
}
