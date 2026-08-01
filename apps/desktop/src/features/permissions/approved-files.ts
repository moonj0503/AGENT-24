import { ActionResultSchema, type ActionResult } from "@continuity/contracts";
import { invokeNative, isNativeOverlayAvailable } from "../../lib/tauri";

export type FileApprovalScope = "GAP" | "ALWAYS";
export interface ApprovedTextFile { authorizationId: string; path: string; fileName: string; scope: FileApprovalScope; identity: string }
export interface ApprovedTextFileContext { authorizationId: string; fileName: string; content: string }
interface TextPatchResult { authorizationId: string; path: string; backupPath: string; before: string; after: string; summary: string }

function requireNative(): void { if (!isNativeOverlayAvailable()) throw new Error("Approved file editing is available only in the desktop app."); }

export async function authorizeTextFile(path: string, scope: FileApprovalScope): Promise<ApprovedTextFile> {
  requireNative(); return await invokeNative("authorize_text_file", { path, scope }) as ApprovedTextFile;
}
export async function listApprovedTextFiles(): Promise<ApprovedTextFile[]> {
  if (!isNativeOverlayAvailable()) return []; return await invokeNative("list_approved_text_files") as ApprovedTextFile[];
}
export async function revokeTextFileAuthorization(authorizationId: string): Promise<void> {
  requireNative(); await invokeNative("revoke_text_file_authorization", { authorizationId });
}
export async function readApprovedTextFile(authorizationId: string): Promise<ApprovedTextFileContext> {
  requireNative(); return await invokeNative("read_approved_text_file", { authorizationId }) as ApprovedTextFileContext;
}
export async function applyApprovedTextPatch(actionId: string, authorizationId: string, find: string, replace: string): Promise<ActionResult> {
  requireNative();
  const result = await invokeNative("apply_approved_text_patch", { authorizationId, find, replace }) as TextPatchResult;
  return ActionResultSchema.parse({ actionId, status: "COMPLETED", summary: result.summary, externalEffect: `Updated ${result.path}`, occurredAt: new Date().toISOString(), fileEditAudit: { path: result.path, backupPath: result.backupPath, before: result.before, after: result.after } });
}
