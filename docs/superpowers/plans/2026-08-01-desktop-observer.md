# Desktop Observer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Windows-native Tauri observer that returns and locally persists sanitized foreground-window activity events.

**Architecture:** A thin Windows API adapter returns raw foreground metadata and idle time. Pure privacy and session modules turn it into sanitized, deduplicated events. Tauri commands poll the pipeline and persist only emitted events in SQLite; a deterministic mock uses the same pipeline.

**Tech Stack:** Rust 2021, Tauri 2, `windows`, `rusqlite`, `chrono`, `uuid`, `regex`, `serde`.

## Global Constraints

- Modify only `apps/desktop/src-tauri/**`; do not change frozen TypeScript contracts.
- Block password managers, authenticators, and private/incognito windows before event creation.
- Mask emails, phone numbers, and digit sequences of eight or more characters.
- Never capture keystrokes, screenshots, document bodies, or full browser history.
- Emit ISO 8601 UTC timestamps and only `ACTIVE_WINDOW_CHANGED`, `USER_IDLE`, or `USER_ACTIVITY` events.

---

### Task 1: Contract-compatible models and privacy processing

**Files:**
- Create: `apps/desktop/src-tauri/src/models/activity_event.rs`
- Create: `apps/desktop/src-tauri/src/privacy/{blocked_apps,redactor,filter}.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Produces:** `ActivityEvent`, `RawWindowSnapshot`, `SanitizedSnapshot`, `is_blocked`, `redact_title`, and `sanitize_snapshot`.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn rejects_password_manager_and_incognito_window() {
    assert!(is_blocked("1Password", "Vault"));
    assert!(is_blocked("Chrome", "New Incognito Tab"));
}

#[test]
fn masks_sensitive_title_content() {
    assert_eq!(redact_title("a@b.com 010-1234-5678 12345678"),
      "[REDACTED_EMAIL] [REDACTED_PHONE] [REDACTED_NUMBER]");
}
```

- [ ] **Step 2: Verify RED**

Run: `cargo test privacy:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: FAIL because the privacy module is absent.

- [ ] **Step 3: Implement minimal behavior**

```rust
pub fn sanitize_snapshot(raw: RawWindowSnapshot) -> Option<SanitizedSnapshot> {
    (!is_blocked(&raw.application_name, &raw.window_title)).then(|| SanitizedSnapshot {
        application_name: raw.application_name,
        window_title: redact_title(&raw.window_title),
        category: classify_application(&raw.application_name),
        idle_seconds: raw.idle_seconds,
    })
}
```

Use ordered regular expressions for email, phone, then eight-or-more digits.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test privacy:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/desktop/src-tauri && git commit -m "feat(observer): add privacy primitives"`

### Task 2: Stateful event conversion

**Files:**
- Create: `apps/desktop/src-tauri/src/observer/session.rs`
- Create: `apps/desktop/src-tauri/src/observer/mod.rs`

**Consumes:** `SanitizedSnapshot`.
**Produces:** `ObserverSession::observe(snapshot) -> Option<ActivityEvent>`.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn emits_once_for_changed_allowed_window() {
    let mut session = ObserverSession::new(300);
    assert_eq!(session.observe(snapshot("Word", "Report", 0)).unwrap().event_type,
      ActivityEventType::ActiveWindowChanged);
    assert!(session.observe(snapshot("Word", "Report", 0)).is_none());
}

#[test]
fn emits_idle_only_when_threshold_is_crossed() {
    let mut session = ObserverSession::new(300);
    session.observe(snapshot("Word", "Report", 0));
    assert!(session.observe(snapshot("Word", "Report", 299)).is_none());
    assert_eq!(session.observe(snapshot("Word", "Report", 300)).unwrap().event_type,
      ActivityEventType::UserIdle);
}
```

- [ ] **Step 2: Verify RED**

Run: `cargo test observer:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: FAIL because `ObserverSession` is absent.

- [ ] **Step 3: Implement minimal behavior**

```rust
pub fn observe(&mut self, next: SanitizedSnapshot) -> Option<ActivityEvent> {
    let event_type = self.transition_type(&next)?;
    self.previous = Some(next.clone());
    Some(ActivityEvent::from_snapshot(event_type, next))
}
```

`transition_type` returns a window-change event for app/title changes, an idle event when crossing upward through 300 seconds, an activity event when crossing down, and `None` otherwise.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test observer:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/desktop/src-tauri && git commit -m "feat(observer): convert snapshots to activity events"`

### Task 3: Windows adapter and deterministic mock source

**Files:**
- Create: `apps/desktop/src-tauri/src/platform/{windows,mod}.rs`
- Create: `apps/desktop/src-tauri/src/observer/mock.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Produces:** `WindowsObservationSource::read_snapshot()` and `MockObservationSource::read_snapshot()`.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn normalizes_nonempty_window_title() {
    assert_eq!(normalize_title("  Final Report - Word "), Some("Final Report - Word".into()));
}

#[test]
fn mock_source_provides_an_allowed_redacted_snapshot() {
    let raw = MockObservationSource::default().read_snapshot().unwrap().unwrap();
    assert!(sanitize_snapshot(raw).is_some());
}
```

- [ ] **Step 2: Verify RED**

Run: `cargo test platform:: observer::mock --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: FAIL because sources are absent.

- [ ] **Step 3: Implement minimal behavior**

Add `windows` features for Foundation, WindowsAndMessaging, KeyboardAndMouse, Threading, and ProcessStatus. On Windows call `GetForegroundWindow`, `GetWindowTextW`, `GetWindowThreadProcessId`, process-image lookup, and `GetLastInputInfo`; return `Ok(None)` for no window or blank title. On other operating systems return `UnsupportedPlatform`. Return a fixed Word snapshot from mock mode.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test platform:: observer::mock --manifest-path apps/desktop/src-tauri/Cargo.toml`

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`

Expected: tests PASS and Windows target check PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/desktop/src-tauri && git commit -m "feat(observer): read Windows activity"`

### Task 4: Local SQLite repository

**Files:**
- Create: `apps/desktop/src-tauri/src/storage/{database,activity_repository,mod}.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Produces:** `ActivityRepository::append(&ActivityEvent)` and `recent(limit) -> Vec<ActivityEvent>`.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn returns_newest_sanitized_event_first() {
    let repo = ActivityRepository::in_memory().unwrap();
    repo.append(&event("first", "2026-08-01T00:00:00Z")).unwrap();
    repo.append(&event("second", "2026-08-01T00:01:00Z")).unwrap();
    assert_eq!(repo.recent(10).unwrap()[0].event_id, "second");
}
```

- [ ] **Step 2: Verify RED**

Run: `cargo test storage:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement minimal behavior**

Add bundled `rusqlite`. Create an `activity_events` table with a primary-key `event_id`, event fields, nullable resource fields, and `idle_seconds`. Use parameterized inserts and `ORDER BY occurred_at DESC LIMIT ?` reads.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test storage:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/desktop/src-tauri && git commit -m "feat(observer): persist sanitized events"`

### Task 5: Tauri commands and end-to-end native boundary

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/{activity,mod}.rs`
- Create: `apps/desktop/src-tauri/src/{lib,main}.rs`

**Consumes:** source, session, and repository from Tasks 2–4.
**Produces:** `get_current_activity`, `get_recent_activity_events`, and `set_mock_observer` commands.

- [ ] **Step 1: Write failing command-state tests**

```rust
#[test]
fn blocked_poll_neither_returns_nor_persists_an_event() {
    let state = test_state_with(raw("1Password", "Vault", 0));
    assert!(state.poll().unwrap().is_none());
    assert!(state.repository.recent(10).unwrap().is_empty());
}
```

- [ ] **Step 2: Verify RED**

Run: `cargo test commands::activity::tests --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: FAIL because `ObserverState::poll` is absent.

- [ ] **Step 3: Implement minimal behavior**

`poll` must select mock/native source, call `sanitize_snapshot`, call session observation, and append only a newly emitted event. Register `get_current_activity() -> Result<Option<ActivityEvent>, String>`, `get_recent_activity_events(limit: u32) -> Result<Vec<ActivityEvent>, String>`, and `set_mock_observer(enabled: bool)` with `tauri::generate_handler!`.

- [ ] **Step 4: Verify GREEN and smoke test**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`

Expected: all tests PASS and the target check PASS. In a Windows desktop session, invoke `get_current_activity` once and confirm a nonempty, redacted title and nonnegative `idleSeconds`.

- [ ] **Step 5: Commit**

Run: `git add apps/desktop/src-tauri && git commit -m "feat(observer): expose Tauri activity commands"`

## Plan Self-Review

- Coverage: Tasks 1–3 implement local privacy and native Windows observation; Task 2 generates sanitized events; Task 4 adds local SQLite; Task 3 provides mock fallback; Task 5 provides the observation API boundary.
- No placeholders or undefined inter-task interfaces remain.
- Every behavior has a stated RED, GREEN, and commit step.
