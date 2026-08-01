import type { Artifact } from "@continuity/contracts";
import { invokeNative, isNativeOverlayAvailable } from "../../lib/tauri";

export type ArtifactExportFormat = "md" | "txt";

export interface ArtifactExportResult {
  readonly path: string;
  readonly updated: boolean;
}

function safeFileStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "recovery-artifact";
}

export function artifactFileName(artifact: Artifact, format: ArtifactExportFormat): string {
  return `${safeFileStem(artifact.title)}-${safeFileStem(artifact.artifactId)}.${format}`;
}

export async function exportArtifact(artifact: Artifact, format: ArtifactExportFormat): Promise<ArtifactExportResult> {
  if (!isNativeOverlayAvailable()) throw new Error("Artifact export is available in the desktop application.");
  const result = await invokeNative("write_text_file", {
    fileName: artifactFileName(artifact, format),
    content: artifact.content,
  });
  if (typeof result !== "object" || result === null || typeof (result as { path?: unknown }).path !== "string" || typeof (result as { updated?: unknown }).updated !== "boolean") {
    throw new Error("The desktop returned an invalid export result.");
  }
  return result as ArtifactExportResult;
}
