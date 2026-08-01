import { readFile } from "node:fs/promises";
import { RecoveryBriefSchema, type RecoveryBrief } from "@continuity/contracts";
import type { RecoveryContext, RecoveryGenerator } from "./types.js";

type FixtureLoader = () => Promise<unknown>;

export class RecoveryGeneratorValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RecoveryGeneratorValidationError";
  }
}

export async function loadFrozenRecoveryBriefFixture(): Promise<unknown> {
  const contractsEntry = import.meta.resolve("@continuity/contracts");
  const fixtureUrl = new URL("./fixtures/recovery-brief.json", contractsEntry);
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
}

export class FixtureRecoveryGenerator implements RecoveryGenerator {
  constructor(private readonly loadFixture: FixtureLoader = loadFrozenRecoveryBriefFixture) {}

  async run(input: RecoveryContext): Promise<RecoveryBrief> {
    const fixture = await this.loadFixture();
    const result = RecoveryBriefSchema.safeParse(fixture);

    if (!result.success) {
      throw new RecoveryGeneratorValidationError(
        `Frozen recovery-brief fixture failed contract validation: ${result.error.message}`,
        { cause: result.error },
      );
    }

    return RecoveryBriefSchema.parse({
      ...result.data,
      briefId: `brief-${input.gapSession.gapId}`,
      gapId: input.gapSession.gapId,
      goalBeforeGap: input.goal.path.join(" → "),
    });
  }
}
