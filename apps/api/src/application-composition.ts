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
import { InMemoryAgentEventBus } from "./features/workflow/event-bus.js";
import {
  createGapLifecycleService,
  type GapLifecycleService,
} from "./services/gap-lifecycle-service.js";
import {
  createGapHistoryService,
  type GapHistoryService,
} from "./services/gap-history-service.js";

export interface ApplicationDependencies {
  readonly workflowService: WorkflowService;
  readonly agentBundle: AgentRuntimeBundle;
  readonly gapRecoveryService: GapRecoveryService;
  readonly gapLifecycleService: GapLifecycleService;
  readonly gapHistoryService: GapHistoryService;
  readonly eventBus: InMemoryAgentEventBus;
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
  const eventBus = new InMemoryAgentEventBus();
  return {
    agentBundle,
    eventBus,
    workflowService: createWorkflowService(
      options.workflowRepository,
      agentBundle.goalInterpreter,
      eventBus,
    ),
    gapRecoveryService: createGapRecoveryService(
      options.workflowRepository,
      agentBundle.runtime,
      options.clock,
      eventBus,
      agentBundle.artifactGenerator,
    ),
    gapLifecycleService: createGapLifecycleService(options.workflowRepository, eventBus, options.clock),
    gapHistoryService: createGapHistoryService(options.workflowRepository),
  };
}
