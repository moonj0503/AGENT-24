import { startGap, updateAction, type GapData } from "../features/gap/api";

export type GapStartAction = () => Promise<GapData>;

/** Creates a confirmation handler whose request can only be issued once. */
export function createGapStartAction(request: GapStartAction = startGap): GapStartAction {
  let pending: Promise<GapData> | undefined;
  return () => {
    pending ??= request();
    return pending;
  };
}

export function createApprovalAction(gap: GapData, actionId: string, status: "COMPLETED" | "REJECTED") {
  return updateAction(actionId, status).then((next) => ({ ...next, session: { ...gap.session, ...next.session } }));
}
