import type { MainScreen } from "../overlay/types";
import type { GapData } from "../features/gap/api";
import type { Goal, GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import type { PendingGoalConfirmation } from "../features/goals/pending-confirmation-store";

export const TAURI_EVENTS = {
  GOAL_CONFIRMATION: "overlay:goal-confirmation",
  GAP_START_CONFIRMATION: "overlay:gap-start-confirmation",
  APPROVAL_REQUIRED: "overlay:approval-required",
  RECOVERY_READY: "overlay:recovery-ready",
  DISMISS: "overlay:dismiss",
  MAIN_NAVIGATE: "main:navigate",
  WINDOW_FOCUS: "window:focus",
  GOAL_CONFIRMED: "goal:confirmed",
  GOAL_CONFIRMATION_RESOLVED: "goal:confirmation-resolved",
  GAP_START_CONFIRMED: "gap:start-confirmed",
  ACTION_APPROVAL_DECIDED: "gap:action-approval-decided",
} as const;

export const MAIN_SCREEN_IDS = [
  "dashboard",
  "goal",
  "gap",
  "recovery",
  "history",
  "permissions",
] as const satisfies readonly MainScreen[];

export type TauriEventName = typeof TAURI_EVENTS[keyof typeof TAURI_EVENTS];
export type TauriEventPayloads = {
  [TAURI_EVENTS.GOAL_CONFIRMATION]: {
    inference: GoalInferenceResult;
    pending?: PendingGoalConfirmation;
  };
  [TAURI_EVENTS.GAP_START_CONFIRMATION]: { selectedGoal?: GoalCandidate };
  [TAURI_EVENTS.APPROVAL_REQUIRED]: { gap: GapData; actionId: string };
  [TAURI_EVENTS.RECOVERY_READY]: { brief: RecoveryBrief & { gapDurationSeconds?: number } };
  [TAURI_EVENTS.DISMISS]: undefined;
  [TAURI_EVENTS.MAIN_NAVIGATE]: MainScreen;
  [TAURI_EVENTS.WINDOW_FOCUS]: undefined;
  [TAURI_EVENTS.GOAL_CONFIRMED]: { goal: Goal };
  [TAURI_EVENTS.GOAL_CONFIRMATION_RESOLVED]: {
    action: "LATER" | "IGNORE" | "KEEP_CURRENT";
    candidateSignature: string;
  };
  [TAURI_EVENTS.GAP_START_CONFIRMED]: undefined;
  [TAURI_EVENTS.ACTION_APPROVAL_DECIDED]: { actionId: string; decision: "APPROVE" | "REJECT" };
};

type TauriBridge = {
  window?: { getCurrent?: () => Promise<{ label?: string }> };
  core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen?: (name: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>; emit?: (name: string, payload?: unknown) => Promise<void> };
};

declare global {
  interface Window { __TAURI__?: TauriBridge; }
}

export async function getWindowLabel(): Promise<string> {
  if (typeof window === "undefined") return "main";
  const queryLabel = new URLSearchParams(window.location.search).get("window");
  if (queryLabel) return queryLabel;
  const current = await window.__TAURI__?.window?.getCurrent?.();
  return current?.label ?? "main";
}

export function isNativeOverlayAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI__?.core?.invoke);
}

export async function invokeNative(command: string, args?: Record<string, unknown>): Promise<unknown> {
  return window.__TAURI__?.core?.invoke?.(command, args);
}

let overlayOperation: Promise<void> = Promise.resolve();

function queueOverlayOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = overlayOperation.then(operation, operation);
  overlayOperation = next.then(() => undefined, () => undefined);
  return next;
}

async function invokeShowOverlay(): Promise<boolean> {
  if (!isNativeOverlayAvailable()) return false;
  await invokeNative("show_overlay");
  return true;
}

export function showOverlay(): Promise<boolean> {
  return queueOverlayOperation(invokeShowOverlay);
}

export async function emitTauriEvent<N extends TauriEventName>(name: N, payload: TauriEventPayloads[N]): Promise<boolean> {
  if (!isNativeOverlayAvailable() || !window.__TAURI__?.event?.emit) return false;
  await window.__TAURI__.event.emit(name, payload);
  return true;
}

export async function emitOverlayEvent<N extends TauriEventName>(name: N, payload: TauriEventPayloads[N]): Promise<boolean> {
  return emitTauriEvent(name, payload);
}

export async function showOverlayForEvent<N extends TauriEventName>(name: N, payload: TauriEventPayloads[N]): Promise<boolean> {
  return queueOverlayOperation(async () => {
    if (!isNativeOverlayAvailable()) return false;
    await invokeShowOverlay();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await emitOverlayEvent(name, payload);
      if (attempt < 2) await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
    }
    return true;
  });
}

export async function showRecoveryOverlay(brief: RecoveryBrief): Promise<boolean> {
  return showOverlayForEvent(TAURI_EVENTS.RECOVERY_READY, { brief });
}

export function hideOverlay(): Promise<boolean> {
  return queueOverlayOperation(async () => {
    if (!isNativeOverlayAvailable()) return false;
    await invokeNative("hide_overlay");
    return true;
  });
}

export async function openMainWindow(screen: MainScreen): Promise<boolean> {
  if (isNativeOverlayAvailable()) {
    await invokeNative("open_main_window", { screen });
    return true;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("continuity:open-main-screen", { detail: screen }));
  return false;
}

export async function listenForTauriEvent<N extends TauriEventName>(name: N, handler: (payload: TauriEventPayloads[N]) => void): Promise<() => void> {
  const unsubscribe = await window.__TAURI__?.event?.listen?.(name, (event) => {
    const payload = parseTauriEventPayload(name, event.payload);
    if (payload !== undefined || name === TAURI_EVENTS.DISMISS) handler(payload as TauriEventPayloads[N]);
  });
  return unsubscribe ?? (() => undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMainScreen(value: unknown): value is MainScreen {
  return typeof value === "string" && (MAIN_SCREEN_IDS as readonly string[]).includes(value);
}

function parseTauriEventPayload<N extends TauriEventName>(name: N, payload: unknown): TauriEventPayloads[N] | undefined {
  if (name === TAURI_EVENTS.DISMISS || name === TAURI_EVENTS.WINDOW_FOCUS || name === TAURI_EVENTS.GAP_START_CONFIRMED) return undefined;
  if (name === TAURI_EVENTS.MAIN_NAVIGATE) return isMainScreen(payload) ? payload as unknown as TauriEventPayloads[N] : undefined;
  if (!isRecord(payload)) return undefined;
  if (name === TAURI_EVENTS.GOAL_CONFIRMATION && isRecord(payload.inference)) return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.GAP_START_CONFIRMATION && (payload.selectedGoal === undefined || isRecord(payload.selectedGoal))) return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.APPROVAL_REQUIRED && isRecord(payload.gap) && typeof payload.actionId === "string") return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.RECOVERY_READY && isRecord(payload.brief)) return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.GOAL_CONFIRMED && isRecord(payload.goal)) return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.ACTION_APPROVAL_DECIDED && typeof payload.actionId === "string" && ["APPROVE", "REJECT"].includes(String(payload.decision))) return payload as TauriEventPayloads[N];
  if (
    name === TAURI_EVENTS.GOAL_CONFIRMATION_RESOLVED
    && ["LATER", "IGNORE", "KEEP_CURRENT"].includes(String(payload.action))
    && typeof payload.candidateSignature === "string"
  ) return payload as TauriEventPayloads[N];
  return undefined;
}
