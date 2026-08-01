import { useEffect, useState } from "react";
import type { GoalCandidate, GoalInferenceResult, RecoveryBrief } from "@continuity/contracts";
import { fetchGoalInference, selectGoal } from "./features/goals/api";
import { getDesktopObservationWorkflow } from "./features/observation/desktop-session";
import { getDesktopWorkflowController } from "./features/workflow/controller";
import { getDesktopWorkflowState, useDesktopWorkflowState } from "./features/workflow/store";
import { GOAL_CONFIRMATION_REQUESTED_EVENT, OBSERVATION_WORKFLOW_ERROR_EVENT, type GoalConfirmationRequested } from "./features/observation/types";
import { fetchPermissionRules, type PermissionRule } from "./features/permissions/api";
import { fetchRecoveryBrief } from "./features/recovery/api";
import { type GapData } from "./features/gap/api";
import { GapStartOverlay } from "./overlay/components/GapStartOverlay";
import { ApprovalOverlay } from "./overlay/components/ApprovalOverlay";
import { dismissOverlay, dismissOverlayWithAnimation, setApprovalRequired, setGapStartConfirmation, setGoalConfirmation, useOverlaySnapshot } from "./overlay/overlay-store";
import { isNativeOverlayAvailable, listenForTauriEvent, openMainWindow, showOverlayForEvent, showRecoveryOverlay, TAURI_EVENTS } from "./lib/tauri";
import { OverlayRoot } from "./overlay/OverlayRoot";

type Screen = "dashboard" | "goal" | "gap" | "recovery" | "permissions" | "history";

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [inference, setInference] = useState<GoalInferenceResult>();
  const [goal, setGoal] = useState<GoalCandidate | undefined>(() => { const saved = window.localStorage.getItem("continuity:selected-goal"); return saved ? JSON.parse(saved) as GoalCandidate : undefined; });
  const [gap, setGap] = useState<GapData>();
  const [brief, setBrief] = useState<RecoveryBrief>();
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [gapModeEnabled, setGapModeEnabled] = useState(() => window.localStorage.getItem("continuity:gap-mode") === "on");
  const [error, setError] = useState<string>();
  const overlay = useOverlaySnapshot();
  const workflow = useDesktopWorkflowState();

  useEffect(() => {
    void loadInference();
    void fetchPermissionRules().then(setRules).catch((cause) => setError(messageOf(cause, "Unable to load permissions.")));
    const openScreen = (event: Event) => { const next = (event as CustomEvent<Screen>).detail; if (next) setScreen(next); };
    const syncGoal = (event: StorageEvent) => { if (event.key === "continuity:selected-goal") setGoal(event.newValue ? JSON.parse(event.newValue) as GoalCandidate : undefined); };
    window.addEventListener("continuity:open-main-screen", openScreen);
    window.addEventListener("storage", syncGoal);
    const workflowError = (event: Event) => setError((event as CustomEvent<string>).detail);
    const goalRequested = (event: Event) => {
      const request = (event as CustomEvent<GoalConfirmationRequested>).detail;
      if (request) { setInference(request.inference); setGoal(request.candidate); }
    };
    window.addEventListener(OBSERVATION_WORKFLOW_ERROR_EVENT, workflowError);
    window.addEventListener(GOAL_CONFIRMATION_REQUESTED_EVENT, goalRequested);
    let active = true;
    let unsubscribeNative: () => void = () => undefined;
    void listenForTauriEvent(TAURI_EVENTS.MAIN_NAVIGATE, (next) => { if (active) setScreen(next); }).then((unsubscribe) => {
      if (active) unsubscribeNative = unsubscribe;
      else unsubscribe();
    });
    return () => { active = false; unsubscribeNative(); window.removeEventListener("continuity:open-main-screen", openScreen); window.removeEventListener("storage", syncGoal); window.removeEventListener(OBSERVATION_WORKFLOW_ERROR_EVENT, workflowError); window.removeEventListener(GOAL_CONFIRMATION_REQUESTED_EVENT, goalRequested); };
  }, []);

  useEffect(() => {
    if (!gapModeEnabled) return;
    const interval = window.setInterval(() => { void loadInference(true); }, 8000);
    return () => window.clearInterval(interval);
  }, [gapModeEnabled]);

  async function loadInference(openOverlay = false) {
    setBusy(true); setError(undefined);
    try {
      const nextInference = await fetchGoalInference();
      setInference(nextInference);
      if (openOverlay) {
        if (isNativeOverlayAvailable()) void showOverlayForEvent(TAURI_EVENTS.GOAL_CONFIRMATION, { inference: nextInference });
        else setGoalConfirmation(nextInference);
      }
    } catch (cause) { setError(messageOf(cause, "Unable to load goals.")); } finally { setBusy(false); }
  }

  function requestGoalConfirmation() {
    setScreen("goal");
  }

  function requestOverlayTest() {
    if (!inference) return;
    window.localStorage.setItem("continuity:overlay-test", "on");
    if (isNativeOverlayAvailable()) void showOverlayForEvent(TAURI_EVENTS.GOAL_CONFIRMATION, { inference });
    else { window.localStorage.removeItem("continuity:overlay-test"); setGoalConfirmation(inference); }
  }

  function toggleGapMode() {
    setGapModeEnabled((enabled) => {
      const next = !enabled;
      window.localStorage.setItem("continuity:gap-mode", next ? "on" : "off");
      if (next) {
        window.localStorage.setItem("continuity:gap-mode-cycle", String(Date.now()));
        void loadInference(true);
      }
      return next;
    });
  }

  function requestGapStart() {
    requestGoalConfirmation();
  }

  async function confirmGapStart() {
    setBusy(true); setError(undefined);
    try {
      const observation = getDesktopObservationWorkflow();
      if (!observation) throw new Error("Goal identification is not ready.");
      await observation.beginGapMode();
      const latest = observation.session.getSnapshot().latestInference;
      const controller = getDesktopWorkflowController();
      if (!controller) throw new Error("Desktop workflow is not initialized.");
      await controller.startGap(latest);
      setGap(toGapData(getDesktopWorkflowState())); setScreen("gap");
      return getDesktopWorkflowState().gapSession;
    } catch (cause) { setError(messageOf(cause, "Unable to start Gap Mode.")); throw cause; } finally { setBusy(false); }
  }

  async function finishGap() {
    setBusy(true); setError(undefined);
    try {
      const controller = getDesktopWorkflowController();
      if (!controller) throw new Error("Desktop workflow is not initialized.");
      const nextBrief = await controller.endGap();
      await getDesktopObservationWorkflow()?.endGapMode();
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

  async function decideAction(actionId: string, decision: "APPROVE" | "REJECT") {
    const controller = getDesktopWorkflowController();
    if (!controller) return;
    await controller.decideAction(actionId, decision);
    setGap(toGapData(getDesktopWorkflowState()));
  }

  function requestApproval(actionId: string) {
    if (!gap) return;
    setApprovalRequired(gap, actionId);
    if (isNativeOverlayAvailable()) {
      void showOverlayForEvent(TAURI_EVENTS.APPROVAL_REQUIRED, { gap, actionId });
    }
  }

  const selectedPath = goal?.suggestedGoalPath.join(" / ") ?? "No confirmed goal yet";
  return <div className="app-shell">
    <header className="navbar">
      <div className="brand"><span className="brand-mark">◌</span><span>Continuity<br /><strong>Agent</strong></span></div>
      <p className="eyebrow">YOUR WORKSPACE</p>
      <nav className="nav-items" aria-label="Primary navigation"><NavItem active={screen === "dashboard"} onClick={() => setScreen("dashboard")} icon="⌂">Dashboard</NavItem><NavItem active={screen === "recovery"} onClick={() => setScreen("recovery")} icon="↺">Recovery</NavItem><NavItem active={screen === "history"} onClick={() => setScreen("history")} icon="▤">History</NavItem><NavItem active={screen === "permissions"} onClick={() => setScreen("permissions")} icon="⚙">Permissions</NavItem></nav>
      <div className="privacy-note">▣ Local-first privacy<br /><span>Observation is paused in this demo.</span><button className="overlay-test-button" type="button" onClick={requestOverlayTest}>Test overlay</button></div>
    </header>
    <main className={`content screen-content-${screen}`}><header className="topbar"><div><p className="eyebrow">SATURDAY, AUGUST 1</p><h1 className={`topbar-title screen-${screen}`}><AnimatedTitle screen={screen} /></h1></div><span className="demo-pill">DEMO MODE</span></header>
      {error && <div className="error" role="alert">{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
      {screen === "dashboard" && <Dashboard busy={busy} inference={inference} goal={goal} path={selectedPath} gapModeEnabled={gapModeEnabled} onToggleGapMode={toggleGapMode} onConfirm={requestGoalConfirmation} onStart={requestGapStart} />}
      {screen === "goal" && <GoalSelection result={inference} selected={goal} onSelect={(id) => setGoal(inference ? selectGoal(inference, id) : undefined)} onContinue={() => setScreen("dashboard")} />}
      {screen === "gap" && <GapView busy={busy} gap={gap} onAction={requestApproval} onFinish={finishGap} />}
      {screen === "recovery" && <RecoveryView brief={brief} onDashboard={() => setScreen("dashboard")} />}
      {screen === "history" && <HistoryView />}
      {screen === "permissions" && <PermissionView rules={rules} />}
    </main>
    {!isNativeOverlayAvailable() && overlay.state === "GAP_START_CONFIRMATION" && <div className="main-overlay-backdrop"><GapStartOverlay goal={overlay.selectedGoal ?? goal} gap={overlay.gap} onConfirm={async () => { await confirmGapStart(); }} onOpenDetails={() => { dismissOverlayWithAnimation(); setScreen("gap"); }} /></div>}
    {!isNativeOverlayAvailable() && overlay.state === "APPROVAL_REQUIRED" && overlay.gap && overlay.actionId && <div className="main-overlay-backdrop"><ApprovalOverlay gap={overlay.gap} actionId={overlay.actionId} onDecision={async (id, status) => { await decideAction(id, status); dismissOverlayWithAnimation(); }} onOpenDetails={() => dismissOverlayWithAnimation()} /></div>}
    {!isNativeOverlayAvailable() && overlay.state === "GOAL_CONFIRMATION" && inference && <div className="main-overlay-backdrop"><OverlayRoot inference={inference} handlers={{ onGoalSelected: async (next) => { window.localStorage.setItem("continuity:selected-goal", JSON.stringify(next)); setGoal(next); dismissOverlayWithAnimation(); setScreen("dashboard"); }, onGoalLater: async () => { dismissOverlayWithAnimation(); }, onGoalIgnore: async () => { dismissOverlayWithAnimation(); }, onKeepCurrentGoal: async () => { dismissOverlayWithAnimation(); }, onConfirmGapStart: async () => { await confirmGapStart(); }, onApproval: decideAction, onOpenMain: (next) => { dismissOverlayWithAnimation(); setScreen(next); } }} /></div>}
  </div>;
}

function messageOf(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
function toGapData(state: ReturnType<typeof getDesktopWorkflowState>): GapData | undefined {
  return state.gapSession && state.actionPlan
    ? { session: state.gapSession, plan: state.actionPlan, actionResults: [...state.actionResults] }
    : undefined;
}
function screenTitle(screen: Screen) { return screen === "dashboard" ? "Good morning, Won" : screen === "goal" ? "Confirm your goal" : screen === "gap" ? "Gap Mode" : screen === "recovery" ? "Welcome back" : screen === "history" ? "History" : "Permissions"; }
function AnimatedTitle({ screen }: { screen: Screen }) { const title = screenTitle(screen); const shouldAnimate = screen === "dashboard" || screen === "recovery"; return <>{Array.from(title).map((character, index) => <span className={shouldAnimate ? "title-char" : undefined} style={shouldAnimate ? { animationDelay: `${index * 38}ms` } : undefined} key={`${screen}-${index}`}>{character === " " ? "\u00a0" : character}</span>)}</>; }
function NavItem({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: string }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span className="nav-icon" aria-hidden="true">{icon}</span><span className="nav-label">{children}</span></button>; }

function Dashboard({ busy, inference, goal, path, gapModeEnabled, onToggleGapMode, onConfirm, onStart }: { busy: boolean; inference?: GoalInferenceResult; goal?: GoalCandidate; path: string; gapModeEnabled: boolean; onToggleGapMode: () => void; onConfirm: () => void; onStart: () => void }) { return <><section className={`hero gap-switch ${gapModeEnabled ? "gap-active" : "gap-inactive"}`} role="switch" tabIndex={0} aria-checked={gapModeEnabled} aria-label={`Gap Mode ${gapModeEnabled ? "On" : "Off"}`} onClick={onToggleGapMode} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggleGapMode(); } }}><span className="switch-glow" aria-hidden="true" /><h2>Gap Mode {gapModeEnabled ? "On" : "Off"}</h2><span className="switch-knob" aria-hidden="true" /></section><div className="grid"><section className="card"><div className="card-heading"><div><p className="eyebrow">CURRENT GOAL</p><h3>{goal ? goal.title : "Goal confirmation needed"}</h3></div><span className="confidence">{goal ? `${Math.round(goal.confidence * 100)}%` : "—"}</span></div><div className="goal-observation"><div className="activity-heading"><span><span className="status-dot" /> Activity observed <span className="muted">· Microsoft Word</span></span></div><p>{goal ? goal.description : inference?.inferenceSummary ?? "We’ll help you keep your place when work is interrupted."}</p></div><p className="path">{path}</p>{goal ? <button className="button primary" onClick={onStart} disabled={busy}>Start Gap Mode</button> : <button className="button primary" onClick={onConfirm} disabled={busy}>{busy ? "Loading…" : "Review goal candidates"}</button>}</section><section className="card activity"><p className="eyebrow">RECENT ACTIVITY</p><Activity app="Microsoft Word" resource="Final Project Report.docx" time="09:00" /><Activity app="Google Chrome" resource="QR Factorization Stability" time="09:04" /><Activity app="Microsoft Word" resource="Final Project Report.docx" time="09:08" /></section></div></>; }
function Activity({ app, resource, time }: { app: string; resource: string; time: string }) { return <div className="activity-row"><span className="activity-icon">{app.includes("Chrome") ? "⌕" : "▤"}</span><span><strong>{resource}</strong><small>{app}</small></span><time>{time}</time></div>; }
function GoalSelection({ result, selected, onSelect, onContinue }: { result?: GoalInferenceResult; selected?: GoalCandidate; onSelect: (id: string) => void; onContinue: () => void }) { return <section className="stack"><p className="lead">We inferred what you may be working on. Choose one to make it your confirmed goal.</p>{result?.candidates.slice(0, 3).map((candidate) => <button className={`goal-option ${selected?.candidateId === candidate.candidateId ? "selected" : ""}`} key={candidate.candidateId} onClick={() => onSelect(candidate.candidateId)}><span className="radio">{selected?.candidateId === candidate.candidateId ? "✓" : ""}</span><span><strong>{candidate.title}</strong><small>{candidate.description}</small><small className="evidence">Evidence: {candidate.evidence[0]?.description}</small></span><b>{Math.round(candidate.confidence * 100)}%</b></button>)}{!result && <EmptyState label="No goal candidates are available." />}{selected && <button className="button primary" onClick={onContinue}>Confirm this goal</button>}</section>; }
function GapView({ busy, gap, onAction, onFinish }: { busy: boolean; gap?: GapData; onAction: (id: string) => void; onFinish: () => void }) { return <section className="stack"><div className="gap-banner"><span className="pulse" /> Agent is preserving your workflow<h2>{gap?.plan.continuityObjective ?? "Preparing a continuity objective…"}</h2></div>{gap?.plan.actions.map((action) => <div className="action-row" key={action.actionId}><span className={`action-status ${action.status.toLowerCase()}`}>{action.status === "COMPLETED" ? "✓" : action.status === "WAITING_APPROVAL" ? "!" : "○"}</span><span><strong>{action.title}</strong><small>{action.reason}</small></span><span className="action-control">{action.status === "WAITING_APPROVAL" ? <button onClick={() => onAction(action.actionId)}>Review approval</button> : action.status.toLowerCase()}</span></div>)}<button className="button primary" onClick={onFinish} disabled={busy}>{busy ? "Preparing recovery…" : "End Gap & view recovery"}</button></section>; }
function RecoveryView({ brief, onDashboard }: { brief?: RecoveryBrief; onDashboard: () => void }) { return <section className="stack"><div className="recovery-banner"><span className="status-dot" /> Your context is restored<h2>{brief?.goalBeforeGap ?? "Recovery brief is ready"}</h2></div>{brief ? <><ListCard title="Completed while you were away" items={brief.completedActions} /><ListCard title="Waiting for your approval" items={brief.pendingActions} /><ListCard title="External effects" items={brief.externalEffects.length ? brief.externalEffects : ["None — no messages were sent."]} /><div className="next-step"><p className="eyebrow">RECOMMENDED NEXT STEP · {brief.recommendedNextAction.estimatedMinutes} MIN</p><strong>{brief.recommendedNextAction.title}</strong></div><button className="button primary" onClick={onDashboard}>Return to dashboard</button></> : <EmptyState label="No recovery brief is available yet." />}</section>; }
function ListCard({ title, items }: { title: string; items: string[] }) { return <div className="card list-card"><p className="eyebrow">{title}</p>{items.map((item) => <p key={item}>•&nbsp;{item}</p>)}</div>; }
function PermissionView({ rules }: { rules: PermissionRule[] }) { const [enabled, setEnabled] = useState<Record<string, boolean>>({}); useEffect(() => { const saved = window.localStorage.getItem("continuity:permissions"); const defaults = Object.fromEntries(rules.map((rule) => [rule.label, rule.decision !== "NEVER"])); setEnabled(saved ? { ...defaults, ...JSON.parse(saved) as Record<string, boolean> } : defaults); }, [rules]); useEffect(() => { if (Object.keys(enabled).length) window.localStorage.setItem("continuity:permissions", JSON.stringify(enabled)); }, [enabled]); return <section className="stack"><p className="lead">The policy engine keeps actions reversible and visible. These demo rules apply to the agent.</p><div className="card">{rules.length ? rules.map((rule) => <div className="permission-row" key={rule.label}><span><strong>{rule.label}</strong><small>{rule.detail}</small></span><button className={`permission-toggle ${enabled[rule.label] ? "is-on" : "is-off"}`} type="button" aria-pressed={Boolean(enabled[rule.label])} onClick={() => setEnabled((current) => ({ ...current, [rule.label]: !current[rule.label] }))}><span className="permission-toggle-knob" />{enabled[rule.label] ? "On" : "Off"}</button></div>) : <EmptyState label="No permission rules are available." />}</div></section>; }
function HistoryView() { return <section className="stack"><p className="lead">A persistent timeline of goal, gap, and recovery events will appear here.</p><div className="card empty">No completed gaps in this demo yet.</div></section>; }
function EmptyState({ label }: { label: string }) { return <div className="empty">{label}</div>; }
