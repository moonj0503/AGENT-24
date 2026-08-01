import { useEffect, useState } from "react";
import type { ActionResult, Artifact, GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import { selectGoal } from "./features/goals/api";
import { fetchPermissionRules, type PermissionRule } from "./features/permissions/api";
import { fetchGapHistory, fetchGapHistoryDetail } from "./features/history/api";
import type { GapData } from "./features/gap/api";
import { getDesktopWorkflowState, patchDesktopWorkflowState, useDesktopWorkflowState } from "./features/workflow/store";
import { getDesktopWorkflowController } from "./features/workflow/controller";
import { GapStartOverlay } from "./overlay/components/GapStartOverlay";
import { ApprovalOverlay } from "./overlay/components/ApprovalOverlay";
import { dismissOverlay, setApprovalRequired, useOverlaySnapshot } from "./overlay/overlay-store";
import { isNativeOverlayAvailable, listenForTauriEvent, showOverlayForEvent, showRecoveryOverlay, TAURI_EVENTS } from "./lib/tauri";
import { OverlayRoot } from "./overlay/OverlayRoot";
import { getDesktopObservationWorkflow } from "./features/observation/desktop-session";
import { GOAL_CONFIRMATION_REQUESTED_EVENT, OBSERVATION_WORKFLOW_ERROR_EVENT, type GoalConfirmationRequested } from "./features/observation/types";
import { updateArtifact } from "./features/artifacts/api";
import { exportArtifact, type ArtifactExportFormat } from "./features/artifacts/export";
import { authorizeTextFile, listApprovedTextFiles, revokeTextFileAuthorization, type ApprovedTextFile, type FileApprovalScope } from "./features/permissions/approved-files";

type Screen = "dashboard" | "goal" | "gap" | "recovery" | "permissions" | "history";

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [inference, setInference] = useState<GoalInferenceResult>();
  const [selectedCandidate, setSelectedCandidate] = useState<GoalCandidate>();
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [error, setError] = useState<string>();
  const overlay = useOverlaySnapshot();
  const workflow = useDesktopWorkflowState();
  const gap = toGapData(workflow);

  useEffect(() => {
    void fetchPermissionRules().then(setRules).catch((cause) => setError(messageOf(cause, "Unable to load permissions.")));
    const openScreen = (event: Event) => { const next = (event as CustomEvent<Screen>).detail; if (next) setScreen(next); };
    const workflowError = (event: Event) => setError((event as CustomEvent<string>).detail);
    const goalRequested = (event: Event) => {
      const request = (event as CustomEvent<GoalConfirmationRequested>).detail;
      if (!request) return;
      setInference(request.inference);
      setSelectedCandidate(request.candidate);
    };
    window.addEventListener("continuity:open-main-screen", openScreen);
    window.addEventListener(OBSERVATION_WORKFLOW_ERROR_EVENT, workflowError);
    window.addEventListener(GOAL_CONFIRMATION_REQUESTED_EVENT, goalRequested);
    let active = true;
    const cleanups: Array<() => void> = [];
    const attach = async () => {
      cleanups.push(await listenForTauriEvent(TAURI_EVENTS.MAIN_NAVIGATE, (next) => { if (active) setScreen(next); }));
      cleanups.push(await listenForTauriEvent(TAURI_EVENTS.GAP_START_CONFIRMED, () => { if (active) void confirmGapStart(); }));
      cleanups.push(await listenForTauriEvent(TAURI_EVENTS.ACTION_APPROVAL_DECIDED, ({ actionId, decision }) => { if (active) void decideAction(actionId, decision); }));
    };
    void attach();
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); window.removeEventListener("continuity:open-main-screen", openScreen); window.removeEventListener(OBSERVATION_WORKFLOW_ERROR_EVENT, workflowError); window.removeEventListener(GOAL_CONFIRMATION_REQUESTED_EVENT, goalRequested); };
  }, []);

  async function requestGapStart() {
    const observation = getDesktopObservationWorkflow();
    if (!observation) { setError("Goal identification is not ready."); return; }
    setError(undefined);
    try {
      await observation.beginGapMode();
    } catch (cause) {
      setError(messageOf(cause, "Unable to begin Gap Mode."));
    }
  }

  async function confirmGapStart(): Promise<void> {
    setError(undefined);
    try {
      const latest = getDesktopObservationWorkflow()?.session.getSnapshot().latestInference;
      await requiredController().startGap(latest);
      dismissOverlay(); setScreen("gap");
    } catch (cause) { setError(messageOf(cause, "Unable to start Gap Mode.")); }
  }

  async function finishGap() {
    setError(undefined);
    try {
      const brief = await requiredController().endGap();
      await getDesktopObservationWorkflow()?.endGapMode();
      setScreen("recovery");
      if (isNativeOverlayAvailable()) await showRecoveryOverlay(brief);
    } catch (cause) { setError(messageOf(cause, "Unable to prepare recovery.")); }
  }

  async function decideAction(actionId: string, decision: "APPROVE" | "REJECT") {
    try { await requiredController().decideAction(actionId, decision); dismissOverlay(); }
    catch (cause) { setError(messageOf(cause, "Unable to record the approval decision.")); }
  }

  function requestApproval(actionId: string) {
    if (!gap) return;
    setApprovalRequired(gap, actionId);
    if (isNativeOverlayAvailable()) void showOverlayForEvent(TAURI_EVENTS.APPROVAL_REQUIRED, { gap, actionId });
  }

  const selectedPath = workflow.confirmedGoal?.path.join(" / ") ?? "No confirmed goal yet";
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">C</span><span>Continuity<br /><strong>Agent</strong></span></div><p className="eyebrow">YOUR WORKSPACE</p>
      <NavItem active={screen === "dashboard"} onClick={() => setScreen("dashboard")}>Dashboard</NavItem><NavItem active={screen === "gap"} onClick={() => setScreen("gap")}>Gap Mode</NavItem><NavItem active={screen === "recovery"} onClick={() => setScreen("recovery")}>Recovery</NavItem><NavItem active={screen === "history"} onClick={() => setScreen("history")}>History</NavItem>
      <div className="sidebar-bottom"><NavItem active={screen === "permissions"} onClick={() => setScreen("permissions")}>Permissions</NavItem><div className="privacy-note">Local-first privacy<br /><span>Only sanitized activity metadata is retained.</span></div></div>
    </aside>
    <main className="content"><header className="topbar"><div><p className="eyebrow">{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date()).toUpperCase()}</p><h1>{screenTitle(screen)}</h1></div><span className="demo-pill">WORKFLOW ACTIVE</span></header>
      {(error ?? workflow.error) && <div className="error" role="alert">{error ?? workflow.error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
      {screen === "dashboard" && <Dashboard busy={workflow.pending} goalTitle={workflow.confirmedGoal?.title} path={selectedPath} phase={workflow.phase} onStart={() => void requestGapStart()} />}
      {screen === "goal" && <GoalSelection result={inference} selected={selectedCandidate} onSelect={(id) => setSelectedCandidate(inference ? selectGoal(inference, id) : undefined)} onContinue={async () => { if (!selectedCandidate) return; await requiredBridge().confirmCandidate(selectedCandidate.candidateId); setScreen("dashboard"); }} />}
      {screen === "gap" && <GapView busy={workflow.pending} gap={gap} onAction={requestApproval} onFinish={finishGap} />}
      {screen === "recovery" && <RecoveryView brief={workflow.recoveryBrief} actionResults={workflow.actionResults} artifacts={workflow.artifacts} onArtifactUpdated={(artifact) => getDesktopWorkflowController() && patchArtifact(artifact)} onDashboard={() => setScreen("dashboard")} />}
      {screen === "history" && <HistoryView />}
      {screen === "permissions" && <PermissionView rules={rules} />}
    </main>
    {!isNativeOverlayAvailable() && overlay.state === "GAP_START_CONFIRMATION" && <div className="main-overlay-backdrop"><GapStartOverlay goal={overlay.selectedGoal} gap={overlay.gap} onConfirm={confirmGapStart} onOpenDetails={() => { dismissOverlay(); setScreen("gap"); }} /></div>}
    {!isNativeOverlayAvailable() && overlay.state === "APPROVAL_REQUIRED" && overlay.gap && overlay.actionId && <div className="main-overlay-backdrop"><ApprovalOverlay gap={overlay.gap} actionId={overlay.actionId} onDecision={decideAction} onOpenDetails={() => dismissOverlay()} /></div>}
    {!isNativeOverlayAvailable() && overlay.state === "GOAL_CONFIRMATION" && overlay.inference && <div className="main-overlay-backdrop"><OverlayRoot inference={overlay.inference} handlers={{ onGoalSelected: async (candidate) => { await requiredBridge().confirmCandidate(candidate.candidateId); setScreen("dashboard"); }, onGoalLater: () => requiredBridge().later(), onGoalIgnore: () => requiredBridge().ignoreCurrent(), onKeepCurrentGoal: () => requiredBridge().keepCurrent(), onConfirmGapStart: confirmGapStart, onApproval: decideAction, onOpenMain: (next) => { dismissOverlay(); setScreen(next); } }} /></div>}
  </div>;
}

function requiredController() { const controller = getDesktopWorkflowController(); if (!controller) throw new Error("Desktop workflow is not initialized."); return controller; }
function patchArtifact(artifact: Artifact) { const state = getDesktopWorkflowState(); patchDesktopWorkflowState({ artifacts: state.artifacts.map((item) => item.artifactId === artifact.artifactId ? artifact : item) }); }
function requiredBridge() { const bridge = getDesktopObservationWorkflow()?.confirmationBridge; if (!bridge) throw new Error("Goal confirmation is not ready."); return bridge; }
function toGapData(state: ReturnType<typeof useDesktopWorkflowState>): GapData | undefined { return state.gapSession && state.actionPlan ? { session: state.gapSession, plan: state.actionPlan, actionResults: [...state.actionResults] } : undefined; }
function messageOf(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
function screenTitle(screen: Screen) { return screen === "dashboard" ? "Continuity workspace" : screen === "goal" ? "Confirm your goal" : screen === "gap" ? "Gap Mode" : screen === "recovery" ? "Welcome back" : screen === "history" ? "History" : "Permissions"; }
function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{children}</button>; }
function Dashboard({ busy, goalTitle, path, phase, onStart }: { busy: boolean; goalTitle?: string; path: string; phase: string; onStart: () => void }) { const identifying = phase === "IDENTIFYING_GOAL" || phase === "GOAL_CONFIRMATION"; const active = ["STARTING_GAP", "GAP_ACTIVE", "AWAITING_APPROVAL", "ENDING_GAP"].includes(phase); return <section className="stack"><section className="hero"><div><span className="status-dot" /> Observation workflow connected<h2>{identifying ? "Identifying what you're working on…" : goalTitle ?? "Protect your train of thought."}</h2><p>{identifying ? "Keep working normally. You'll choose a Goal before any continuity actions run." : goalTitle ? `Previous Goal: ${path}` : "Start Gap Mode, then work normally while candidates are identified."}</p></div></section><section className="card"><p className="eyebrow">CURRENT WORKFLOW</p><h3>{identifying ? "Watching for a stable Goal" : active ? "Gap Mode is active" : "Ready when you are"}</h3><p>State: {phase}</p><button className="button primary" onClick={onStart} disabled={busy || identifying || active}>{identifying ? "Identifying Goal…" : active ? "Gap Mode active" : "Start Gap Mode"}</button></section></section>; }
function GoalSelection({ result, selected, onSelect, onContinue }: { result?: GoalInferenceResult; selected?: GoalCandidate; onSelect: (id: string) => void; onContinue: () => void | Promise<void> }) { return <section className="stack"><p className="lead">Choose an observed Goal candidate.</p>{result?.candidates.map((candidate) => <button className={`goal-option ${selected?.candidateId === candidate.candidateId ? "selected" : ""}`} key={candidate.candidateId} onClick={() => onSelect(candidate.candidateId)}><span><strong>{candidate.title}</strong><small>{candidate.description}</small></span><b>{Math.round(candidate.confidence * 100)}%</b></button>)}{!result && <EmptyState label="No observed Goal candidates are available yet." />}{selected && <button className="button primary" onClick={() => void onContinue()}>Confirm this goal</button>}</section>; }
function GapView({ busy, gap, onAction, onFinish }: { busy: boolean; gap?: GapData; onAction: (id: string) => void; onFinish: () => void }) { return <section className="stack"><div className="gap-banner"><span className="pulse" /> Continuity runtime active<h2>{gap?.plan.continuityObjective ?? "Start Gap Mode from the dashboard."}</h2></div>{gap?.plan.actions.map((action) => { const result = gap.actionResults.find((item) => item.actionId === action.actionId); const status = result?.status ?? action.status; return <div className="action-row" key={action.actionId}><span><strong>{action.title}</strong><small>{result?.summary ?? action.reason}</small></span><span className="action-control">{action.status === "WAITING_APPROVAL" ? <button onClick={() => onAction(action.actionId)}>Review approval</button> : status.toLowerCase()}</span></div>; })}<button className="button primary" onClick={onFinish} disabled={busy || !gap}>End Gap &amp; view recovery</button></section>; }
function RecoveryView({ brief, actionResults, artifacts, onArtifactUpdated, onDashboard }: { brief?: RecoveryBrief; actionResults: readonly ActionResult[]; artifacts: readonly Artifact[]; onArtifactUpdated: (artifact: Artifact) => void; onDashboard: () => void }) { return <section className="stack">{brief ? <><div className="recovery-banner"><span className="status-dot" /> Your context is restored<h2>{brief.goalBeforeGap}</h2></div>{actionResults.filter((result) => result.fileEditAudit).map((result) => <FileEditAudit key={result.actionId} result={result} />)}{artifacts.filter((artifact) => artifact.status === "ACTIVE").map((artifact) => <ArtifactCard key={artifact.artifactId} artifact={artifact} onUpdated={onArtifactUpdated} />)}<ListCard title="Completed" items={brief.completedActions} /><ListCard title="Pending" items={brief.pendingActions} /><ListCard title="External effects" items={brief.externalEffects.length ? brief.externalEffects : ["None"]} /><div className="next-step"><strong>{brief.recommendedNextAction.title}</strong></div><button className="button primary" onClick={onDashboard}>Return to dashboard</button></> : <EmptyState label="Complete a Gap to see its recovery brief." />}</section>; }
function FileEditAudit({ result }: { result: ActionResult }) { const audit = result.fileEditAudit; if (!audit) return null; return <div className="card"><p className="eyebrow">APPROVED FILE EDIT</p><h3>{audit.path}</h3><p><strong>Before</strong></p><pre>{audit.before}</pre><p><strong>After</strong></p><pre>{audit.after}</pre><small>Backup: {audit.backupPath}</small></div>; }
function ArtifactCard({ artifact, onUpdated }: { artifact: Artifact; onUpdated: (artifact: Artifact) => void }) { const [editing, setEditing] = useState(false); const [content, setContent] = useState(artifact.content); const [exportMessage, setExportMessage] = useState<string>(); const save = async () => { onUpdated(await updateArtifact(artifact.artifactId, { content })); setEditing(false); }; const discard = async () => onUpdated(await updateArtifact(artifact.artifactId, { status: "DISCARDED" })); const exportFile = async (format: ArtifactExportFormat) => { try { const result = await exportArtifact({ ...artifact, content }, format); setExportMessage(`${result.updated ? "Updated" : "Exported"}: ${result.path}`); } catch (cause) { setExportMessage(messageOf(cause, "Unable to export this artifact.")); } }; return <div className="card artifact-card"><p className="eyebrow">{artifact.type} ARTIFACT</p><h3>{artifact.title}</h3>{editing ? <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={12} /> : <pre>{artifact.content}</pre>}<div className="artifact-actions">{editing ? <button onClick={() => void save()}>Save</button> : <button onClick={() => setEditing(true)}>Edit</button>}<button onClick={() => void navigator.clipboard.writeText(artifact.content)}>Copy</button><button onClick={() => void exportFile("md")}>Export .md</button><button onClick={() => void exportFile("txt")}>Export .txt</button><button onClick={() => void discard()}>Discard</button></div>{exportMessage && <small role="status">{exportMessage}</small>}</div>; }
function ListCard({ title, items }: { title: string; items: string[] }) { return <div className="card list-card"><p className="eyebrow">{title}</p>{items.map((item) => <p key={item}>{item}</p>)}</div>; }
function PermissionView({ rules }: { rules: PermissionRule[] }) {
  const [blockedApplication, setBlockedApplication] = useState(""); const [, refresh] = useState(0); const [showFileApproval, setShowFileApproval] = useState(false); const [filePath, setFilePath] = useState(""); const [approvedFiles, setApprovedFiles] = useState<ApprovedTextFile[]>([]); const [fileError, setFileError] = useState<string>();
  const workflow = getDesktopObservationWorkflow(); const status = workflow?.session.getSnapshot().status ?? "STOPPED"; const blocked = workflow?.getState().privacy.blockedApplications ?? [];
  const update = async (action: () => Promise<void>) => { await action(); refresh((value) => value + 1); };
  const reloadFiles = async () => setApprovedFiles(await listApprovedTextFiles());
  useEffect(() => { void reloadFiles(); }, []);
  const approve = async (scope: FileApprovalScope) => { try { setFileError(undefined); await authorizeTextFile(filePath, scope); setFilePath(""); setShowFileApproval(false); await reloadFiles(); } catch (cause) { setFileError(messageOf(cause, "Unable to approve this file.")); } };
  return <section className="stack"><div className="card"><p>Observation: {status}</p>{status === "PAUSED" ? <button onClick={() => workflow && void update(() => workflow.resume())}>Resume</button> : <button onClick={() => workflow && void update(() => workflow.pause())}>Pause</button>}</div><div className="card"><p className="eyebrow">APPROVED TEXT FILES</p><p>Only saved .txt and .md files up to 1 MB. Paste the full path; the agent cannot choose or expand it.</p><button onClick={() => setShowFileApproval(true)}>Allow a file…</button>{approvedFiles.map((file) => <div className="permission-row" key={file.authorizationId}><span><strong>{file.fileName}</strong><small>{file.path}</small></span><b>{file.scope === "ALWAYS" ? "ALWAYS" : "THIS GAP"}</b><button onClick={() => void revokeTextFileAuthorization(file.authorizationId).then(reloadFiles)}>Revoke</button></div>)}</div>{showFileApproval && <div className="main-overlay-backdrop"><section className="overlay-card" role="dialog" aria-modal="true"><p className="eyebrow">ALLOW FILE EDITING</p><h2>Approve this exact file?</h2><label>Full saved file path<input autoFocus value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="C:\\Users\\you\\Documents\\notes.txt" /></label><p>The full canonical path will be verified natively. Every edit gets a backup.</p>{fileError && <div className="error">{fileError}</div>}<div className="artifact-actions"><button className="button primary" onClick={() => void approve("GAP")}>Allow for this Gap</button><button onClick={() => void approve("ALWAYS")}>Always allow</button><button onClick={() => { setShowFileApproval(false); setFilePath(""); setFileError(undefined); }}>Deny</button></div></section></div>}<div className="card"><p className="eyebrow">BLOCKED APPLICATIONS</p><input aria-label="Application identifier" value={blockedApplication} onChange={(event) => setBlockedApplication(event.target.value)} /><button onClick={() => workflow && void update(async () => { await workflow.addBlockedApplication(blockedApplication); setBlockedApplication(""); })}>Add</button>{blocked.map((id) => <div key={id}>{id} <button onClick={() => workflow && void update(() => workflow.removeBlockedApplication(id))}>Remove</button></div>)}</div><div className="card">{rules.map((rule) => <div className="permission-row" key={rule.label}><span>{rule.label}</span><b>{rule.decision}</b></div>)}</div></section>;
}
function HistoryView() { const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchGapHistory>>>(); const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchGapHistoryDetail>>>(); const [error, setError] = useState<string>(); useEffect(() => { void fetchGapHistory().then(setHistory).catch((cause) => setError(messageOf(cause, "Unable to load history."))); }, []); if (error) return <div className="error">{error}</div>; if (detail) return <section className="stack"><button onClick={() => setDetail(undefined)}>Back to History</button><div className="recovery-banner"><h2>{detail.recoveryBrief?.goalBeforeGap ?? detail.goal.title}</h2></div>{detail.actions.flatMap((item) => item.result?.fileEditAudit ? [<FileEditAudit key={item.action.actionId} result={item.result} />] : [])}{detail.artifacts.filter((artifact) => artifact.status === "ACTIVE").map((artifact) => <ArtifactCard key={artifact.artifactId} artifact={artifact} onUpdated={(updated) => setDetail({ ...detail, artifacts: detail.artifacts.map((item) => item.artifactId === updated.artifactId ? updated : item) })} />)}</section>; if (!history) return <EmptyState label="Loading history…" />; return <section className="stack"><p className="lead">Completed and active Gap sessions from the backend.</p>{history.items.length ? history.items.map(({ gapSession, recoveryBrief }) => <button className="card" key={gapSession.gapId} onClick={() => void fetchGapHistoryDetail(gapSession.gapId).then(setDetail).catch((cause) => setError(messageOf(cause, "Unable to load Gap details.")))}><strong>{recoveryBrief?.goalBeforeGap ?? gapSession.goalId}</strong><p>{gapSession.status} · {new Date(gapSession.startedAt).toLocaleString()}</p><small>{recoveryBrief ? `${recoveryBrief.completedActions.length} completed · ${recoveryBrief.pendingActions.length} pending` : "Recovery not generated yet"}</small></button>) : <EmptyState label="No Gap history yet." />}</section>; }
function EmptyState({ label }: { label: string }) { return <div className="empty">{label}</div>; }
