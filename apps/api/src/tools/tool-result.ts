export interface ToolResult {
  readonly status: "SUCCESS" | "FAILED";
  readonly effect?: { readonly type: string; readonly resourceId: string };
  readonly reversible: boolean;
  readonly rollbackToken?: string;
  readonly summary?: string;
  readonly value?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface ToolContext { readonly now?: () => Date; }
export interface ContinuityTool { readonly name: string; execute(input: Readonly<Record<string, unknown>>, context?: ToolContext): Promise<ToolResult>; }

export function readString(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

export function failed(error: unknown): ToolResult {
  return { status: "FAILED", reversible: true, error: { code: "INVALID_TOOL_INPUT", message: error instanceof Error ? error.message : "Tool execution failed." } };
}
