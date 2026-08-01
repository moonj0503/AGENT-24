import { useEffect, useMemo, useState } from "react";
import type { Goal, GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import { fetchGoalInference, selectGoal } from "./features/goals/api";
import { createApprovalAction, createGapStartAction } from "./overlay/actions";
import { fetchPermissionRules, type PermissionRule } from "./features/permissions/api";
import { fetchRecoveryBrief } from "./features/recovery/api";
import { type GapData } from "./features/gap/api";
import { GapStartOverlay } from "./overlay/components/GapStartOverlay";
import { ApprovalOverlay } from "./overlay/components/ApprovalOverlay";
import { dismissOverlay, setApprovalRequired, setGapStartConfirmation, useOverlaySnapshot } from "./overlay/overlay-store";
import { isNativeOverlayAvailable, listenForTauriEvent, openMainWindow, showOverlayForEvent, showRecoveryOverlay, TAURI_EVENTS } from "./lib/tauri";
import { OverlayRoot } from "./overlay/OverlayRoot";
import { useConfirmedGoalSnapshot } from "./features/goals/confirmed-goal-store";
import { getDesktopObservationWorkflow } from "./features/observation/desktop-session";
import { candidateSignature } from "./features/observation/stability";
import { OBSERVATION_WORKFLOW_ERROR_EVENT } from "./features/observation/types";

type Screen = "dashboard" | "goal" | "gap" | "recovery" | "permissions" | "history";

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [inference, setInference] = useState<GoalInferenceResult>();
  const [selectedCandidate, setSelectedCandidate] = useState<GoalCandidate>();
  const [gap, setGap] = useState<GapData>();
  const [brief, setBrief] = useState<RecoveryBrief>();
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const overlay = useOverlaySnapshot();
  const { confirmedGoal } = useConfirmedGoalSnapshot();
  const startGapOnce = useMemo(() => createGapStartAction(), []);

  useEffect(() => {
    void loadInference();
    void fetchPermissionRules().then(setRules).catch((cause) => setError(messageOf(cause, "Unable to load permissions.")));
    const openScreen = (event: Event) => { const next = (event as CustomEvent<Screen>).detail; if (next) setScreen(next); };
    window.addEventListener("continuity:open-main-screen", openScreen);
    const workflowError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener(OBSERVATION_WORKFLOW_ERROR_EVENT, workflowError);
    let active = true;
    let unsubscribeNative: () => void = () => undefined;
    void listenForTauriEvent(TAURI_EVENTS.MAIN_NAVIGATE, (next) => { if (active) setScreen(next); }).then((unsubscribe) => {
      if (active) unsubscribeNative = unsubscribe;
      else unsubscribe();
    });
    return () => { active = false; unsubscribeNative(); window.removeEventListener("continuity:open-main-screen", openScreen); window.removeEventListener(OBSERVATION_WORKFLOW_ERROR_EVENT, workflowError); };
  }, []);

  async function loadInference() {
    setBusy(true); setError(undefined);
    try { setInference(await fetchGoalInference()); } catch (cause) { setError(messageOf(cause, "Unable to load goals.")); } finally { setBusy(false); }
  }

  function requestGoalConfirmation() {
    if (!inference) return;
    const candidate = inference.candidates[0];
    const bridge = getDesktopObservationWorkflow()?.confirmationBridge;
    if (!candidate || !bridge) { setScreen("goal"); return; }
    void bridge.requestConfirmation({
      type: "GoalConfirmationRequested",
      inference,
      candidate,
      candidateSignature: candidateSignature(candidate),
      requestedAt: Date.now(),
    });
  }

  function openGapStartConfirmation() {
    setGapStartConfirmation();
    if (isNativeOverlayAvailable()) {
      void showOverlayForEvent(TAURI_EVENTS.GAP_START_CONFIRMATION, {});
    }
  }

  function requestGapStart() {
    const bridge = getDesktopObservationWorkflow()?.confirmationBridge;
    if (!bridge) { setError("Goal confirmation is not ready."); return; }
    void bridge.requestGapStart(async () => openGapStartConfirmation());
  }

  async function confirmGapStart() {
    setBusy(true); setError(undefined);
    try {
      const next = await startGapOnce();
      setGap(next); setScreen("gap");
      return next;
    } catch (cause) { setError(messageOf(cause, "Unable to start Gap Mode.")); throw cause; } finally { setBusy(false); }
  }

  async function finishGap() {
    setBusy(true); setError(undefined);
    try {
      const nextBrief = await fetchRecoveryBrief();
      setBrief(nextBrief); setScreen("recovery");
      if (isNativeOverlayAvailable()) {
        try {
          await showRecoveryOverlay(nextBrief);
        } catch (cause) {
          setError(messageOf(cause, "Recovery is ready, but the native overlay is unavailable."));
        }
      }
    } catch (cause) { setError(messageOf(cause, "Unable to prepare recovery.")); } finally { setBusy(false); }
  }

  async function decideAction(actionId: string, status: "COMPLETED" | "REJECTED") {
    if (!gap) return;
    setGap(await createApprovalAction(gap, actionId, status));
  }

  function requestApproval(actionId: string) {
    if (!gap) return;
    setApprovalRequired(gap, actionId);
    if (isNativeOverlayAvailable()) {
      void showOverlayForEvent(TAURI_EVENTS.APPROVAL_REQUIRED, { gap, actionId });
    }
  }

  const selectedPath = confirmedGoal?.path.join(" / ") ?? "No confirmed goal yet";
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◌</span><span>Continuity<br /><strong>Agent</strong></span></div>
      <p className="eyebrow">YOUR WORKSPACE</p>
      <NavItem active={screen === "dashboard"} onClick={() => setScreen("dashboard")} icon="⌂">Dashboard</NavItem>
      <NavItem active={screen === "gap"} onClick={() => setScreen("gap")} icon="◌">Gap Mode</NavItem>
      <NavItem active={screen === "recovery"} onClick={() => setScreen("recovery")} icon="↺">Recovery</NavItem>
      <NavItem active={screen === "history"} onClick={() => setScreen("history")} icon="▤">History</NavItem>
      <div className="sidebar-bottom"><NavItem active={screen === "permissions"} onClick={() => setScreen("permissions")} icon="⚙">Permissions</NavItem><div className="privacy-note">▣ Local-first privacy<br /><span>Observation is paused in this demo.</span></div></div>
    </aside>
    <main className="content"><header className="topbar"><div><p className="eyebrow">SATURDAY, AUGUST 1</p><h1>{screenTitle(screen)}</h1></div><span className="demo-pill">DEMO MODE</span></header>
      {error && <div className="error" role="alert">{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
      {screen === "dashboard" && <Dashboard busy={busy} inference={inference} goal={confirmedGoal} path={selectedPath} onConfirm={requestGoalConfirmation} onStart={requestGapStart} />}
      {screen === "goal" && <GoalSelection result={inference} selected={selectedCandidate} onSelect={(id) => setSelectedCandidate(inference ? selectGoal(inference, id) : undefined)} onContinue={async () => { if (!selectedCandidate) return; const bridge = getDesktopObservationWorkflow()?.confirmationBridge; if (!bridge) throw new Error("Goal confirmation is not ready."); await bridge.confirmCandidate(selectedCandidate.candidateId); setScreen("dashboard"); }} />}
      {screen === "gap" && <GapView busy={busy} gap={gap} onAction={requestApproval} onFinish={finishGap} />}
      {screen === "recovery" && <RecoveryView brief={brief} onDashboard={() => setScreen("dashboard")} />}
      {screen === "history" && <HistoryView />}
      {screen === "permissions" && <PermissionView rules={rules} />}
    </main>
    {!isNativeOverlayAvailable() && overlay.state === "GAP_START_CONFIRMATION" && <div className="main-overlay-backdrop"><GapStartOverlay goal={overlay.selectedGoal} gap={overlay.gap} onConfirm={confirmGapStart} onOpenDetails={() => { dismissOverlay(); setScreen("gap"); }} /></div>}
    {!isNativeOverlayAvailable() && overlay.state === "APPROVAL_REQUIRED" && overlay.gap && overlay.actionId && <div className="main-overlay-backdrop"><ApprovalOverlay gap={overlay.gap} actionId={overlay.actionId} onDecision={async (id, status) => { await decideAction(id, status); dismissOverlay(); }} onOpenDetails={() => dismissOverlay()} /></div>}
    {!isNativeOverlayAvailable() && overlay.state === "GOAL_CONFIRMATION" && overlay.inference && <div className="main-overlay-backdrop"><OverlayRoot inference={overlay.inference} handlers={{ onGoalSelected: async (next) => { const bridge = getDesktopObservationWorkflow()?.confirmationBridge; if (!bridge) throw new Error("Goal confirmation is not ready."); await bridge.confirmCandidate(next.candidateId); setScreen("dashboard"); }, onGoalLater: () => getDesktopObservationWorkflow()?.confirmationBridge.later(), onGoalIgnore: () => getDesktopObservationWorkflow()?.confirmationBridge.ignoreCurrent(), onKeepCurrentGoal: () => getDesktopObservationWorkflow()?.confirmationBridge.keepCurrent(), onConfirmGapStart: confirmGapStart, onApproval: decideAction, onOpenMain: (next) => { dismissOverlay(); setScreen(next); } }} /></div>}
  </div>;
}

function messageOf(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
function screenTitle(screen: Screen) { return screen === "dashboard" ? "Good morning, Won" : screen === "goal" ? "Confirm your goal" : screen === "gap" ? "Gap Mode" : screen === "recovery" ? "Welcome back" : screen === "history" ? "History" : "Permissions"; }
function NavItem({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: string }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{children}</button>; }

function Dashboard({ busy, inference, goal, path, onConfirm, onStart }: { busy: boolean; inference?: GoalInferenceResult; goal?: Goal; path: string; onConfirm: () => void; onStart: () => void }) { return <><section className="hero"><div><span className="status-dot" /> Activity observed <span className="muted">· Microsoft Word</span><h2>{goal?.title ?? "Let’s protect your train of thought."}</h2><p>{goal ? `Confirmed Goal: ${goal.path.join(" / ")}` : inference?.inferenceSummary ?? "We’ll help you keep your place when work is interrupted."}</p></div><div className="hero-art">✦</div></section><div className="grid"><section className="card"><div className="card-heading"><div><p className="eyebrow">CURRENT GOAL</p><h3>{goal ? goal.title : "Goal confirmation needed"}</h3></div><span className="confidence">{goal ? `${Math.round(goal.confidence * 100)}%` : "—"}</span></div><p className="path">{path}</p>{goal ? <button className="button primary" onClick={onStart} disabled={busy}>Start Gap Mode</button> : <button className="button primary" onClick={onConfirm} disabled={busy}>{busy ? "Loading…" : "Review goal candidates"}</button>}</section><section className="card activity"><p className="eyebrow">RECENT ACTIVITY</p><Activity app="Microsoft Word" resource="Final Project Report.docx" time="09:00" /><Activity app="Google Chrome" resource="QR Factorization Stability" time="09:04" /><Activity app="Microsoft Word" resource="Final Project Report.docx" time="09:08" /></section></div></>; }
function Activity({ app, resource, time }: { app: string; resource: string; time: string }) { return <div className="activity-row"><span className="activity-icon">{app.includes("Chrome") ? "⌕" : "▤"}</span><span><strong>{resource}</strong><small>{app}</small></span><time>{time}</time></div>; }
function GoalSelection({ result, selected, onSelect, onContinue }: { result?: GoalInferenceResult; selected?: GoalCandidate; onSelect: (id: string) => void; onContinue: () => void | Promise<void> }) { return <section className="stack"><p className="lead">We inferred what you may be working on. Choose one to make it your confirmed goal.</p>{result?.candidates.slice(0, 3).map((candidate) => <button className={`goal-option ${selected?.candidateId === candidate.candidateId ? "selected" : ""}`} key={candidate.candidateId} onClick={() => onSelect(candidate.candidateId)}><span className="radio">{selected?.candidateId === candidate.candidateId ? "✓" : ""}</span><span><strong>{candidate.title}</strong><small>{candidate.description}</small><small className="evidence">Evidence: {candidate.evidence[0]?.description}</small></span><b>{Math.round(candidate.confidence * 100)}%</b></button>)}{!result && <EmptyState label="No goal candidates are available." />}{selected && <button className="button primary" onClick={() => void onContinue()}>Confirm this goal</button>}</section>; }
function GapView({ busy, gap, onAction, onFinish }: { busy: boolean; gap?: GapData; onAction: (id: string) => void; onFinish: () => void }) { return <section className="stack"><div className="gap-banner"><span className="pulse" /> Agent is preserving your workflow<h2>{gap?.plan.continuityObjective ?? "Preparing a continuity objective…"}</h2></div>{gap?.plan.actions.map((action) => <div className="action-row" key={action.actionId}><span className={`action-status ${action.status.toLowerCase()}`}>{action.status === "COMPLETED" ? "✓" : action.status === "WAITING_APPROVAL" ? "!" : "○"}</span><span><strong>{action.title}</strong><small>{action.reason}</small></span><span className="action-control">{action.status === "WAITING_APPROVAL" ? <button onClick={() => onAction(action.actionId)}>Review approval</button> : action.status.toLowerCase()}</span></div>)}<button className="button primary" onClick={onFinish} disabled={busy}>{busy ? "Preparing recovery…" : "End Gap & view recovery"}</button></section>; }
function RecoveryView({ brief, onDashboard }: { brief?: RecoveryBrief; onDashboard: () => void }) { return <section className="stack"><div className="recovery-banner"><span className="status-dot" /> Your context is restored<h2>{brief?.goalBeforeGap ?? "Recovery brief is ready"}</h2></div>{brief ? <><ListCard title="Completed while you were away" items={brief.completedActions} /><ListCard title="Waiting for your approval" items={brief.pendingActions} /><ListCard title="External effects" items={brief.externalEffects.length ? brief.externalEffects : ["None — no messages were sent."]} /><div className="next-step"><p className="eyebrow">RECOMMENDED NEXT STEP · {brief.recommendedNextAction.estimatedMinutes} MIN</p><strong>{brief.recommendedNextAction.title}</strong></div><button className="button primary" onClick={onDashboard}>Return to dashboard</button></> : <EmptyState label="No recovery brief is available yet." />}</section>; }
function ListCard({ title, items }: { title: string; items: string[] }) { return <div className="card list-card"><p className="eyebrow">{title}</p>{items.map((item) => <p key={item}>•&nbsp;{item}</p>)}</div>; }
function PermissionView({ rules }: { rules: PermissionRule[] }) { return <section className="stack"><p className="lead">The policy engine keeps actions reversible and visible. These demo rules apply to the agent.</p><div className="card">{rules.length ? rules.map((rule) => <div className="permission-row" key={rule.label}><span><strong>{rule.label}</strong><small>{rule.detail}</small></span><b className={`decision ${rule.decision.toLowerCase()}`}>{rule.decision}</b></div>) : <EmptyState label="No permission rules are available." />}</div></section>; }
function HistoryView() { return <section className="stack"><p className="lead">A persistent timeline of goal, gap, and recovery events will appear here.</p><div className="card empty">No completed gaps in this demo yet.</div></section>; }
function EmptyState({ label }: { label: string }) { return <div className="empty">{label}</div>; }
