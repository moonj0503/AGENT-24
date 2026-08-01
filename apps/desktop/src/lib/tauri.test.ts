import { afterEach, describe, expect, it } from "vitest";
import type { RecoveryBrief } from "@continuity/contracts";
import { hideOverlay, isNativeOverlayAvailable, listenForTauriEvent, openMainWindow, showRecoveryOverlay, TAURI_EVENTS } from "./tauri";

describe("frontend native integration fallback", () => {
  const globalScope = globalThis as unknown as { window: Window };
  const previousWindow = globalScope.window;

  afterEach(() => { globalScope.window = previousWindow; });

  it("reports the browser fallback when the native bridge is unavailable", () => {
    globalScope.window = undefined as unknown as Window;
    expect(isNativeOverlayAvailable()).toBe(false);
  });

  it("requests the correct detailed Main Window screen in browser tests", async () => {
    let received: unknown;
    globalScope.window = { dispatchEvent: (event: Event) => { received = (event as CustomEvent).detail; return true; } } as unknown as Window;
    await openMainWindow("recovery");
    expect(received).toBe("recovery");
  });

  it("delivers a valid native main navigation event to the Main Window listener", async () => {
    let deliver: ((event: { payload: unknown }) => void) | undefined;
    let received: unknown;
    globalScope.window = { __TAURI__: { event: { listen: async (_name: string, handler: (event: { payload: unknown }) => void) => { deliver = handler; return () => undefined; } } } } as unknown as Window;
    await listenForTauriEvent(TAURI_EVENTS.MAIN_NAVIGATE, (screen) => { received = screen; });
    deliver?.({ payload: "gap" });
    deliver?.({ payload: "not-a-screen" });
    expect(received).toBe("gap");
  });

  it("uses the exact native hide command and recovery event payload", async () => {
    const invoked: string[] = [];
    let emitted: { name: string; payload: unknown } | undefined;
    globalScope.window = { __TAURI__: {
      core: { invoke: async (command: string) => { invoked.push(command); } },
      event: { emit: async (name: string, payload: unknown) => { emitted = { name, payload }; } },
    } } as unknown as Window;
    await hideOverlay();
    const brief: RecoveryBrief = { briefId: "brief-001", gapId: "gap-001", goalBeforeGap: "Report", completedActions: [], pendingActions: [], externalEffects: [], recommendedNextAction: { title: "Resume", estimatedMinutes: 1 }, createdAt: "2026-08-01T09:48:00.000Z" };
    await showRecoveryOverlay(brief);
    expect(invoked).toEqual(["hide_overlay", "show_overlay"]);
    expect(emitted?.name).toBe("overlay:recovery-ready");
  });
});
