import { afterEach, describe, expect, it } from "vitest";
import { isNativeOverlayAvailable, openMainWindow } from "./tauri";

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
});
