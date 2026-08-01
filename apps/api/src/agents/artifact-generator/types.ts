import type {
  ActionPlan,
  ActionResult,
  Artifact,
  Checkpoint,
  GapSession,
  Goal,
} from "@continuity/contracts";

export interface ArtifactGenerationContext {
  readonly goal: Goal;
  readonly checkpoint: Checkpoint;
  readonly gapSession: GapSession;
  readonly actionPlan: ActionPlan;
  readonly actionResults: readonly ActionResult[];
}

export interface ArtifactGenerator {
  run(input: ArtifactGenerationContext): Promise<readonly Artifact[]>;
}
