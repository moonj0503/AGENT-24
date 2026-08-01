import { afterEach, describe, expect, it } from "vitest";
import { chooseOverlayState } from "./types";
import { dismissOverlay, getOverlaySnapshot, openOverlay } from "./overlay-store";

describe("quick overlay state", () => {
  afterEach(() => dismissOverlay());

  it("selects the specified priority when several notifications arrive", () => {
    expect(chooseOverlayState(["GOAL_CONFIRMATION", "GAP_START_CONFIRMATION", "RECOVERY_READY", "APPROVAL_REQUIRED"])).toBe("APPROVAL_REQUIRED");
    expect(chooseOverlayState(["GOAL_CONFIRMATION", "GAP_START_CONFIRMATION"])).toBe("GAP_START_CONFIRMATION");
  });

  it("places file permission after goal confirmation", () => {
    expect(chooseOverlayState(["GOAL_CONFIRMATION", "FILE_EDIT_PERMISSION"])).toBe("FILE_EDIT_PERMISSION");
  });

  it("dismisses presentation state without changing persistent data", () => {
    openOverlay({ state: "RECOVERY_READY", brief: undefined });
    dismissOverlay();
    expect(getOverlaySnapshot().state).toBe("HIDDEN");
  });
});
