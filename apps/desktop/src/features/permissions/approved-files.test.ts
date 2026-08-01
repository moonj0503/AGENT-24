import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyApprovedTextPatch, authorizeTextFile } from "./approved-files";

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  (globalThis as unknown as { window: Window }).window = { __TAURI__: { core: { invoke } } } as unknown as Window;
});

describe("approved text-file capability", () => {
  it("passes the exact user path and scope to the native authorization boundary", async () => {
    invoke.mockResolvedValue({ authorizationId: "auth-1", path: "C:\\notes.txt", fileName: "notes.txt", scope: "GAP", identity: "1" });
    await authorizeTextFile("C:\\notes.txt", "GAP");
    expect(invoke).toHaveBeenCalledWith("authorize_text_file", { path: "C:\\notes.txt", scope: "GAP" });
  });

  it("turns only a native backup-and-patch result into an auditable action result", async () => {
    invoke.mockResolvedValue({ authorizationId: "auth-1", path: "C:\\notes.txt", backupPath: "C:\\backups\\notes.txt", before: "old", after: "new", summary: "Applied." });
    const result = await applyApprovedTextPatch("action-1", "auth-1", "old", "new");
    expect(invoke).toHaveBeenCalledWith("apply_approved_text_patch", { authorizationId: "auth-1", find: "old", replace: "new" });
    expect(result).toMatchObject({ actionId: "action-1", status: "COMPLETED", fileEditAudit: { before: "old", after: "new", backupPath: "C:\\backups\\notes.txt" } });
  });
});
