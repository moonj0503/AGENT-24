import type { Artifact } from "@continuity/contracts";
import { createActionArtifacts } from "../../tools/artifacts.js";
import type { ArtifactGenerationContext, ArtifactGenerator } from "./types.js";

export class FixtureArtifactGenerator implements ArtifactGenerator {
  async run(input: ArtifactGenerationContext): Promise<readonly Artifact[]> {
    return createActionArtifacts(
      input.gapSession.gapId,
      input.actionPlan,
      input.actionResults,
    );
  }
}
