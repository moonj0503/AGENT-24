import {
  FixtureContinuityAgent,
  createOpenAIContinuityAgent,
} from "../continuity-agent/index.js";
import {
  FixtureGoalInterpreter,
  createOpenAIGoalInterpreter,
  type GoalInterpreter,
} from "../goal-interpreter/index.js";
import {
  createOpenAIClient,
  loadOpenAIConfig,
  type OpenAIClient,
  type OpenAIConfig,
} from "../openai/index.js";
import {
  FixtureRecoveryGenerator,
  createOpenAIRecoveryGenerator,
} from "../recovery-generator/index.js";
import { DeterministicPolicyEngine } from "../../policy/index.js";
import { ToolExecutor } from "../../tools/index.js";
import { FixtureRuntimeOrchestrator } from "./orchestrator.js";
import type { RuntimeOrchestrator } from "./types.js";

export type AgentProviderMode = "fixture" | "openai";

export interface AgentRuntimeBundle {
  readonly provider: AgentProviderMode;
  readonly goalInterpreter: GoalInterpreter;
  readonly runtime: RuntimeOrchestrator;
}

export interface AgentCompositionDependencies {
  readonly loadOpenAIConfig?: (environment: NodeJS.ProcessEnv) => OpenAIConfig;
  readonly createOpenAIClient?: (config: OpenAIConfig) => OpenAIClient;
}

export class AgentProviderConfigurationError extends Error {
  constructor() {
    super("AGENT_PROVIDER must be either fixture or openai.");
    this.name = "AgentProviderConfigurationError";
  }
}

export function parseAgentProviderMode(
  environment: NodeJS.ProcessEnv = process.env,
): AgentProviderMode {
  const value = environment.AGENT_PROVIDER?.trim();
  if (!value) return "fixture";
  if (value === "fixture" || value === "openai") return value;
  throw new AgentProviderConfigurationError();
}

function createFixtureBundle(): AgentRuntimeBundle {
  return {
    provider: "fixture",
    goalInterpreter: new FixtureGoalInterpreter(),
    runtime: new FixtureRuntimeOrchestrator(
      new FixtureContinuityAgent(),
      new DeterministicPolicyEngine(),
      new ToolExecutor(),
      new FixtureRecoveryGenerator(),
    ),
  };
}

function createOpenAIBundle(
  environment: NodeJS.ProcessEnv,
  dependencies: AgentCompositionDependencies,
): AgentRuntimeBundle {
  const configLoader = dependencies.loadOpenAIConfig ?? loadOpenAIConfig;
  const clientFactory = dependencies.createOpenAIClient ?? createOpenAIClient;
  const config = configLoader(environment);
  const client = clientFactory(config);
  const goalInterpreter = createOpenAIGoalInterpreter(config, client);
  const continuityAgent = createOpenAIContinuityAgent(config, client);
  const recoveryGenerator = createOpenAIRecoveryGenerator(config, client);

  return {
    provider: "openai",
    goalInterpreter,
    runtime: new FixtureRuntimeOrchestrator(
      continuityAgent,
      new DeterministicPolicyEngine(),
      new ToolExecutor(),
      recoveryGenerator,
    ),
  };
}

export function createAgentRuntimeBundle(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: AgentCompositionDependencies = {},
): AgentRuntimeBundle {
  return parseAgentProviderMode(environment) === "fixture"
    ? createFixtureBundle()
    : createOpenAIBundle(environment, dependencies);
}
