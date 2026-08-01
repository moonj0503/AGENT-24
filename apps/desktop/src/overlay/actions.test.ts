import { describe, expect, it, vi } from "vitest";
import { createApprovalAction, createGapStartAction } from "./actions";
import { startGap } from "../features/gap/api";

describe("overlay actions", () => {
  it("sends exactly one gap request when confirmation is clicked repeatedly", async () => {
    const request = vi.fn(startGap);
    const confirm = createGapStartAction(request);
    const [first, second] = await Promise.all([confirm(), confirm()]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(first.session.gapId).toBe(second.session.gapId);
  });

  it("updates the requested action for approval or rejection", async () => {
    const gap = await startGap();
    const approved = await createApprovalAction(gap, "act-002", "COMPLETED");
    expect(approved.plan.actions.find((action) => action.actionId === "act-002")?.status).toBe("COMPLETED");
  });
});
