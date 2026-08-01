import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@continuity/contracts";
import { readRecentActivityEvents } from "./api";

const activityEvent: ActivityEvent = {
  eventId: "event-1",
  type: "ACTIVE_WINDOW_CHANGED",
  occurredAt: "2026-08-01T09:00:00.000Z",
  application: { name: "Microsoft Word", category: "DOCUMENT" },
  resource: { title: "Report.docx", kind: "DOCUMENT" },
  metadata: { idleSeconds: 0 },
};

describe("readRecentActivityEvents", () => {
  const previousWindow = globalThis.window;

  afterEach(() => { globalThis.window = previousWindow; });

  it("reads sanitized ActivityEvent values from the Tauri command", async () => {
    const invoke = vi.fn().mockResolvedValue([activityEvent]);
    globalThis.window = { __TAURI__: { core: { invoke } } } as unknown as Window;

    await expect(readRecentActivityEvents()).resolves.toEqual([activityEvent]);
    expect(invoke).toHaveBeenCalledWith("get_recent_activity_events", { limit: 50 });
  });
});
