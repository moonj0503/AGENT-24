import { ArtifactSchema, GapArtifactsResponseSchema, UpdateArtifactRequestSchema, type Artifact, type UpdateArtifactRequest } from "@continuity/contracts";
import { apiRequest } from "../../lib/api";

export async function fetchGapArtifacts(gapId: string): Promise<readonly Artifact[]> {
  return GapArtifactsResponseSchema.parse(await apiRequest(`/gaps/${encodeURIComponent(gapId)}/artifacts`)).artifacts;
}

export async function updateArtifact(artifactId: string, update: UpdateArtifactRequest): Promise<Artifact> {
  const body = UpdateArtifactRequestSchema.parse(update);
  return ArtifactSchema.parse(await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}
