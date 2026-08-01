import { failed, readString, type ContinuityTool } from "./tool-result.js";

export const createTodoDraftTool: ContinuityTool = { name: "CREATE_TODO_DRAFT", async execute(input) { try { const actionId = readString(input, "actionId"); return { status: "SUCCESS", effect: { type: "TODO_DRAFT_CREATED", resourceId: `todo-${actionId}` }, reversible: true, rollbackToken: `todo-${actionId}`, summary: readString(input, "title"), value: { title: readString(input, "title"), status: "DRAFT" } }; } catch (error) { return failed(error); } } };
