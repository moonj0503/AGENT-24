import { ArtifactSchema, type ActionPlan, type ActionResult, type Artifact, type ArtifactType } from "@continuity/contracts";

const artifactTypes: Readonly<Partial<Record<ActionPlan["actions"][number]["type"], ArtifactType>>> = {
  CREATE_TODO_DRAFT: "TODO",
  CREATE_MESSAGE_DRAFT: "MESSAGE",
  ORGANIZE_REFERENCES: "REFERENCES",
  SEND_EMAIL: "MESSAGE",
};

function contentFor(type: ArtifactType, title: string, reason: string): string {
  switch (type) {
    case "TODO": return `# ${title}\n\n## Objective\n${reason}\n\n## Tasks\n- [ ] Confirm the desired outcome and deadline\n- [ ] Add the known requirements and constraints\n- [ ] Break the work into the next three concrete steps\n- [ ] Review progress and update this draft`;
    case "MESSAGE": return `Subject: ${title}\n\nHi,\n\nI’m following up about ${title.toLocaleLowerCase()}. ${reason}\n\nCould you confirm the goal, timeframe, and any constraints I should account for?\n\nThanks.`;
    case "REFERENCES": return `# ${title}\n\n## Context\n${reason}\n\n## Known references\n- Current goal and checkpoint context\n- Related application and document metadata\n\n## Details to add\n- Key dates and deadlines\n- People, subjects, or resources involved\n- Open questions and dependencies`;
    case "TEXT": return `# ${title}\n\n${reason}`;
  }
}

export function createActionArtifacts(gapId: string, actionPlan: ActionPlan, results: readonly ActionResult[]): Artifact[] {
  const resultByActionId = new Map(results.map((result) => [result.actionId, result]));
  return actionPlan.actions.flatMap((action) => {
    const type = artifactTypes[action.type];
    const result = resultByActionId.get(action.actionId);
    if (!type || result?.status !== "COMPLETED") return [];
    return [ArtifactSchema.parse({
      artifactId: `artifact-${gapId}-${action.actionId}`,
      gapId,
      actionId: action.actionId,
      type,
      title: action.title,
      content: contentFor(type, action.title, action.reason),
      status: "ACTIVE",
      createdAt: result.occurredAt,
      updatedAt: result.occurredAt,
    })];
  });
}
