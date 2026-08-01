import {
  createAgentRuntimeBundle,
  type AgentRuntimeBundle,
} from "./agents/runtime/index.js";
import type { WorkflowRepository } from "./repositories/workflow-repository.js";
import {
  createWorkflowService,
  type WorkflowService,
} from "./services/workflow-service.js";

export interface ApplicationDependencies {
  readonly workflowService: WorkflowService;
  readonly agentBundle: AgentRuntimeBundle;
}

export interface ApplicationCompositionOptions {
  readonly workflowRepository: WorkflowRepository;
  readonly createAgentRuntimeBundle?: (
    environment: NodeJS.ProcessEnv,
  ) => AgentRuntimeBundle;
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
  };
}
