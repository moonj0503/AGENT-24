import { useState } from "react";
import { authorizeTextFile, type FileApprovalScope } from "../../features/permissions/approved-files";

export function FilePermissionOverlay({ goalTitle, onDecision }: { goalTitle?: string; onDecision: (decision: FileApprovalScope | "DENY") => Promise<void> }) {
  const [path, setPath] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function allow(scope: FileApprovalScope) {
    if (busy) return; setBusy(true); setError(undefined);
    try { await authorizeTextFile(path, scope); await onDecision(scope); }
    catch (cause) { setError(cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "This file could not be approved."); setBusy(false); }
  }
  return <section className="overlay-card" aria-labelledby="overlay-file-title">
    <div className="overlay-intro"><p className="eyebrow">OPTIONAL FILE EDITING</p><h2 id="overlay-file-title">Allow the agent to edit a saved file?</h2><p className="overlay-copy">Goal: {goalTitle ?? "Confirmed Goal"}</p><p className="overlay-copy">Paste the full path of one existing `.txt` or `.md` file. Every edit creates a backup.</p></div>
    <label className="overlay-copy">Full saved file path<input autoFocus value={path} disabled={busy} onChange={(event) => setPath(event.target.value)} placeholder="C:\\Users\\you\\Documents\\letter.txt" /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="overlay-actions"><button className="button primary" disabled={busy || !path.trim()} onClick={() => void allow("GAP")}>Allow for this Gap</button><button className="button secondary" disabled={busy || !path.trim()} onClick={() => void allow("ALWAYS")}>Always allow</button><button className="button secondary" disabled={busy} onClick={() => void onDecision("DENY")}>Continue without file editing</button></div>
  </section>;
}
