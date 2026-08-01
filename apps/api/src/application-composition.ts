import {
  createAgentRuntimeBundle,
  type AgentRuntimeBundle,
} from "./agents/runtime/index.js";
import type { WorkflowRepository } from "./repositories/workflow-repository.js";
import {
  createWorkflowService,
  type WorkflowService,
} from "./services/workflow-service.js";
import {
  createGapRecoveryService,
  type Clock,
  type GapRecoveryService,
} from "./services/gap-recovery-service.js";

export interface ApplicationDependencies {
  readonly workflowService: WorkflowService;
  readonly agentBundle: AgentRuntimeBundle;
  readonly gapRecoveryService: GapRecoveryService;
}

export interface ApplicationCompositionOptions {
  readonly workflowRepository: WorkflowRepository;
  readonly createAgentRuntimeBundle?: (
    environment: NodeJS.ProcessEnv,
  ) => AgentRuntimeBundle;
  readonly clock?: Clock;
}

export function createApplicationDependencies(
  environment: NodeJS.ProcessEnv = process.env,
  options: ApplicationCompositionOptions,
): ApplicationDependencies {
  const createBundle = options.createAgentRuntimeBundle ?? createAgentRuntimeBundle;
  const agentBundle = createBundle(environment);
  return {
    agentBundle,
    workflowService: createWorkflowService(
      options.workflowRepository,
      agentBundle.goalInterpreter,
    ),
    gapRecoveryService: createGapRecoveryService(
      options.workflowRepository,
      agentBundle.runtime,
      options.clock,
    ),
  };
}
