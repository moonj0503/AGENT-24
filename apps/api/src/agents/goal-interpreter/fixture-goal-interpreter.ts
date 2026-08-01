import { readFile } from "node:fs/promises";
import { GoalInferenceResultSchema, type GoalInferenceResult } from "@continuity/contracts";
import type { GoalInterpreter, SanitizedGoalContext } from "./types.js";

type FixtureLoader = () => Promise<unknown>;

export class GoalInterpreterValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GoalInterpreterValidationError";
  }
}

export async function loadFrozenGoalFixture(): Promise<unknown> {
  const contractsEntry = import.meta.resolve("@continuity/contracts");
  const fixtureUrl = new URL("./fixtures/goal-candidates.json", contractsEntry);
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
}

export class FixtureGoalInterpreter implements GoalInterpreter {
  constructor(private readonly loadFixture: FixtureLoader = loadFrozenGoalFixture) {}

  async run(_input: SanitizedGoalContext): Promise<GoalInferenceResult> {
    const fixture = await this.loadFixture();
    const result = GoalInferenceResultSchema.safeParse(fixture);

    if (!result.success) {
      throw new GoalInterpreterValidationError(
        `Frozen goal-inference fixture failed contract validation: ${result.error.message}`,
        { cause: result.error },
      );
    }

    return result.data;
  }
}
