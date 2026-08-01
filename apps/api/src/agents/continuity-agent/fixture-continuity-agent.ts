import { readFile } from "node:fs/promises";
import { ActionPlanSchema, type ActionPlan } from "@continuity/contracts";
import type { ContinuityAgent, ContinuityContext } from "./types.js";

type FixtureLoader = () => Promise<unknown>;

export class ContinuityAgentValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContinuityAgentValidationError";
  }
}

export async function loadFrozenActionPlanFixture(): Promise<unknown> {
  const contractsEntry = import.meta.resolve("@continuity/contracts");
  const fixtureUrl = new URL("./fixtures/action-plan.json", contractsEntry);
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
}

export class FixtureContinuityAgent implements ContinuityAgent {
  constructor(private readonly loadFixture: FixtureLoader = loadFrozenActionPlanFixture) {}

  async run(input: ContinuityContext): Promise<ActionPlan> {
    const fixture = await this.loadFixture();
    const result = ActionPlanSchema.safeParse(fixture);

    if (!result.success) {
      throw new ContinuityAgentValidationError(
        `Frozen action-plan fixture failed contract validation: ${result.error.message}`,
        { cause: result.error },
      );
    }

    return ActionPlanSchema.parse({
      ...result.data,
      planId: `plan-${input.gapSession.gapId}`,
      gapId: input.gapSession.gapId,
    });
  }
}
