import type { MainScreen } from "../overlay/types";

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

export async function emitOverlayEvent(name: string, payload: unknown): Promise<boolean> {
  if (!isNativeOverlayAvailable() || !window.__TAURI__?.event?.emit) return false;
  await window.__TAURI__.event.emit(name, payload);
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

export async function listenForTauriEvent(name: string, handler: (payload: unknown) => void): Promise<() => void> {
  const unsubscribe = await window.__TAURI__?.event?.listen?.(name, (event) => handler(event.payload));
  return unsubscribe ?? (() => undefined);
}
