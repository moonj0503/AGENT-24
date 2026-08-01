export type PermissionRule = { label: string; decision: "AUTO" | "ASK" | "NEVER"; detail: string };

export async function fetchPermissionRules(): Promise<PermissionRule[]> {
  return [
    { label: "Create checkpoint", decision: "AUTO", detail: "Safe and reversible" },
    { label: "Create drafts", decision: "AUTO", detail: "Nothing is sent externally" },
    { label: "Send email or messages", decision: "NEVER", detail: "The agent only prepares drafts" },
    { label: "Edit original documents", decision: "NEVER", detail: "Original files remain unchanged" },
  ];
}
