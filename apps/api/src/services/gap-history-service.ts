import type {
  Artifact,
  GapHistoryDetail,
  GapHistoryListResponse,
  GapHistoryQuery,
  UpdateArtifactRequest,
} from "@continuity/contracts";
import { ApiHttpError } from "../plugins/error-handler.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";

export class GapHistoryService {
  constructor(private readonly repository: WorkflowRepository) {}

  async list(query: GapHistoryQuery): Promise<GapHistoryListResponse> {
    try {
      const gapSessions = await this.repository.listGapSessions(query.status);
      const items = await Promise.all(gapSessions.map(async (gapSession) => {
        const recoveryBrief = await this.repository.getRecoveryBrief(gapSession.gapId);
        return { gapSession, ...(recoveryBrief ? { recoveryBrief } : {}) };
      }));
      return { items };
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "Gap history could not be loaded.", { cause });
    }
  }

  async getDetail(gapId: string): Promise<GapHistoryDetail> {
    try {
      const gapSession = await this.repository.getGapSession(gapId);
      if (!gapSession) throw new ApiHttpError("NOT_FOUND", "The GapSession was not found.");
      const [goal, checkpoint, recoveryBrief, actions, artifacts] = await Promise.all([
        this.repository.getGoal(gapSession.goalId),
        this.repository.getCheckpoint(gapSession.checkpointId),
        this.repository.getRecoveryBrief(gapId),
        this.repository.listGapActions(gapId),
        this.repository.listArtifacts(gapId),
      ]);
      if (!goal) throw new ApiHttpError("NOT_FOUND", "The confirmed Goal was not found.");
      if (!checkpoint) throw new ApiHttpError("NOT_FOUND", "The Checkpoint was not found.");
      return {
        gapSession,
        goal,
        checkpoint,
        ...(recoveryBrief ? { recoveryBrief } : {}),
        actions: [...actions],
        artifacts: [...artifacts],
      };
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "Gap history could not be loaded.", { cause });
    }
  }

  async getRecoveryBrief(gapId: string) {
    try {
      const recoveryBrief = await this.repository.getRecoveryBrief(gapId);
      if (!recoveryBrief) throw new ApiHttpError("NOT_FOUND", "The RecoveryBrief was not found.");
      return recoveryBrief;
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "The RecoveryBrief could not be loaded.", { cause });
    }
  }

  async listActions(gapId: string) {
    try {
      const gapSession = await this.repository.getGapSession(gapId);
      if (!gapSession) throw new ApiHttpError("NOT_FOUND", "The GapSession was not found.");
      return { actions: await this.repository.listGapActions(gapId) };
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "Gap actions could not be loaded.", { cause });
    }
  }

  async listArtifacts(gapId: string) {
    try {
      const gapSession = await this.repository.getGapSession(gapId);
      if (!gapSession) throw new ApiHttpError("NOT_FOUND", "The GapSession was not found.");
      return { artifacts: await this.repository.listArtifacts(gapId) };
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "Artifacts could not be loaded.", { cause });
    }
  }

  async getArtifact(artifactId: string): Promise<Artifact> {
    try {
      const artifact = await this.repository.getArtifact(artifactId);
      if (!artifact) throw new ApiHttpError("NOT_FOUND", "The Artifact was not found.");
      return artifact;
    } catch (cause) {
      if (cause instanceof ApiHttpError) throw cause;
      throw new ApiHttpError("DATABASE_FAILURE", "The Artifact could not be loaded.", { cause });
    }
  }

  async updateArtifact(artifactId: string, request: UpdateArtifactRequest): Promise<Artifact> {
    const artifact = await this.getArtifact(artifactId);
    const updated = { ...artifact, ...request, updatedAt: new Date().toISOString() };
    try {
      await this.repository.updateArtifact(updated);
      return updated;
    } catch (cause) {
      throw new ApiHttpError("DATABASE_FAILURE", "The Artifact could not be updated.", { cause });
    }
  }
}

export function createGapHistoryService(repository: WorkflowRepository): GapHistoryService {
  return new GapHistoryService(repository);
}
