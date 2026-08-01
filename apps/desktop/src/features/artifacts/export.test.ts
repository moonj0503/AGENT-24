import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactSchema } from "@continuity/contracts";
import { artifactFileName, exportArtifact } from "./export";

const artifact = ArtifactSchema.parse({
  artifactId: "artifact-gap/action", gapId: "gap-1", actionId: "action-1", type: "TEXT",
  title: "Report: next steps?", content: "Draft", status: "ACTIVE",
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
});

beforeEach(() => {
  (globalThis as unknown as { window: Window }).window = {
    __TAURI__: { core: { invoke: vi.fn(async () => ({ path: "C:\\exports\\draft.md", updated: false })) } },
  } as unknown as Window;
});

describe("artifact export", () => {
  it("creates a safe deterministic file name", () => {
    expect(artifactFileName(artifact, "md")).toBe("Report-next-steps-artifact-gap-action.md");
  });

  it("exports only through the native scoped file tool", async () => {
    await expect(exportArtifact(artifact, "txt")).resolves.toEqual({ path: "C:\\exports\\draft.md", updated: false });
    expect(window.__TAURI__?.core?.invoke).toHaveBeenCalledWith("write_text_file", {
      fileName: "Report-next-steps-artifact-gap-action.txt",
      content: "Draft",
    });
  });
});
