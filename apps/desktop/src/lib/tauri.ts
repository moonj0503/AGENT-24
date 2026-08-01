import type { MainScreen } from "../overlay/types";
import type { GapData } from "../features/gap/api";
import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";

export const TAURI_EVENTS = {
  GOAL_CONFIRMATION: "overlay.goal-confirmation",
  GAP_START_CONFIRMATION: "overlay.gap-start-confirmation",
  APPROVAL_REQUIRED: "overlay.approval-required",
  RECOVERY_READY: "overlay.recovery-ready",
  DISMISS: "overlay.dismiss",
  MAIN_NAVIGATE: "main.navigate",
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
  [TAURI_EVENTS.GOAL_CONFIRMATION]: { inference: GoalInferenceResult };
  [TAURI_EVENTS.GAP_START_CONFIRMATION]: { selectedGoal?: GoalCandidate };
  [TAURI_EVENTS.APPROVAL_REQUIRED]: { gap: GapData; actionId: string };
  [TAURI_EVENTS.RECOVERY_READY]: { brief: RecoveryBrief & { gapDurationSeconds?: number } };
  [TAURI_EVENTS.DISMISS]: undefined;
  [TAURI_EVENTS.MAIN_NAVIGATE]: MainScreen;
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

export async function showOverlay(): Promise<boolean> {
  if (!isNativeOverlayAvailable()) return false;
  await invokeNative("show_overlay");
  return true;
}

export async function emitTauriEvent<N extends TauriEventName>(name: N, payload: TauriEventPayloads[N]): Promise<boolean> {
  if (!isNativeOverlayAvailable() || !window.__TAURI__?.event?.emit) return false;
  await window.__TAURI__.event.emit(name, payload);
  return true;
}

export const emitOverlayEvent = emitTauriEvent;

export async function showRecoveryOverlay(brief: RecoveryBrief): Promise<boolean> {
  if (!isNativeOverlayAvailable()) return false;
  await emitOverlayEvent(TAURI_EVENTS.RECOVERY_READY, { brief });
  await showOverlay();
  return true;
}

export async function hideOverlay(): Promise<boolean> {
  if (!isNativeOverlayAvailable()) return false;
  await invokeNative("hide_overlay");
  return true;
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
  if (name === TAURI_EVENTS.DISMISS) return undefined;
  if (name === TAURI_EVENTS.MAIN_NAVIGATE) return isMainScreen(payload) ? payload as unknown as TauriEventPayloads[N] : undefined;
  if (!isRecord(payload)) return undefined;
  if (name === TAURI_EVENTS.GOAL_CONFIRMATION && isRecord(payload.inference)) return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.GAP_START_CONFIRMATION && (payload.selectedGoal === undefined || isRecord(payload.selectedGoal))) return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.APPROVAL_REQUIRED && isRecord(payload.gap) && typeof payload.actionId === "string") return payload as TauriEventPayloads[N];
  if (name === TAURI_EVENTS.RECOVERY_READY && isRecord(payload.brief)) return payload as TauriEventPayloads[N];
  return undefined;
}
