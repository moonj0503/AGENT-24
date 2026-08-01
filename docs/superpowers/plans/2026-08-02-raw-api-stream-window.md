# Raw API Stream Dedicated Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Raw API Stream in a standalone Tauri window while the main window continues to own chat requests.

**Architecture:** The main React window publishes raw SSE records through a BroadcastChannel and keeps an event snapshot. A hidden Tauri webview window is shown through a Rust command and renders the same data on its own route. The Raw window can request a snapshot and broadcast a clear action.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, Rust, Vitest.

## Global Constraints

- Preserve every raw OpenAI event type and payload without summarization.
- Keep OpenAI calls and API key use server-side only.
- Do not include the pre-existing apps/desktop/src-tauri/Cargo.toml user change in feature commits.
- Use a named BroadcastChannel and provide a browser-tab fallback outside Tauri.

---

### Task 1: Define cross-window stream protocol

**Files:**
- Create: `apps/desktop/src/features/chat/raw-stream-channel.ts`
- Test: `apps/desktop/src/features/chat/raw-stream-channel.test.ts`

**Interfaces:**
- Produces: `RawStreamEvent`, `RawStreamChannelMessage`, `publishRawStreamMessage(message)`, and `subscribeToRawStream(handler)`.
- Consumes: browser `BroadcastChannel`.

- [ ] **Step 1: Write the failing test**

```ts
it("delivers published raw events to a subscriber", () => {
  const received: RawStreamChannelMessage[] = [];
  const unsubscribe = subscribeToRawStream((message) => received.push(message));
  publishRawStreamMessage({ kind: "event", event: sampleEvent });
  expect(received).toEqual([{ kind: "event", event: sampleEvent }]);
  unsubscribe();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @continuity/desktop test -- raw-stream-channel.test.ts`

Expected: FAIL because raw-stream-channel does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RawStreamChannelMessage =
  | { kind: "event"; event: RawStreamEvent }
  | { kind: "snapshot"; events: RawStreamEvent[] }
  | { kind: "request_snapshot" }
  | { kind: "clear" };

const channel = new BroadcastChannel("continuity:raw-api-stream");
export function publishRawStreamMessage(message: RawStreamChannelMessage) {
  channel.postMessage(message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @continuity/desktop test -- raw-stream-channel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/raw-stream-channel.ts apps/desktop/src/features/chat/raw-stream-channel.test.ts
git commit -m "Add raw stream window channel"
```

### Task 2: Add the native Raw API Stream webview window

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/lib/tauri.ts`

**Interfaces:**
- Produces: `openRawApiStreamWindow(): Promise<boolean>`.
- Consumes: Tauri manager window lookup for the `raw-api-stream` label.

- [ ] **Step 1: Write the failing Rust test**

```rust
#[test]
fn raw_api_stream_window_label_is_stable() {
    assert_eq!(RAW_API_STREAM_WINDOW_LABEL, "raw-api-stream");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test raw_api_stream_window_label_is_stable --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: FAIL because the constant is not defined.

- [ ] **Step 3: Write minimal implementation**

```rust
pub const RAW_API_STREAM_WINDOW_LABEL: &str = "raw-api-stream";

#[tauri::command]
fn show_raw_api_stream_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(RAW_API_STREAM_WINDOW_LABEL)
        .ok_or("Raw API Stream window is not configured")?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}
```

Add a hidden window with label `raw-api-stream` and URL `index.html?window=raw-api-stream` to the Tauri config. Add the command to `generate_handler!` and call it from `openRawApiStreamWindow`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test raw_api_stream_window_label_is_stable --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/src/lib.rs apps/desktop/src/lib/tauri.ts
git commit -m "Add Raw API Stream window"
```

### Task 3: Split main chat and dedicated Raw Stream UI

**Files:**
- Modify: `apps/desktop/src/features/chat/RawApiChat.tsx`
- Create: `apps/desktop/src/features/chat/RawApiStreamWindow.tsx`
- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/styles.css`
- Test: `apps/desktop/src/features/chat/RawApiStreamWindow.test.tsx`

**Interfaces:**
- Consumes: `openRawApiStreamWindow` and the channel protocol.
- Produces: main chat with an open-window action and a dedicated Raw window renderer.

- [ ] **Step 1: Write the failing test**

```tsx
it("replaces events from a snapshot and clears on a clear message", () => {
  render(<RawApiStreamWindow />);
  publishRawStreamMessage({ kind: "snapshot", events: [sampleEvent] });
  expect(screen.getByText("response.created")).toBeInTheDocument();
  publishRawStreamMessage({ kind: "clear" });
  expect(screen.queryByText("response.created")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @continuity/desktop test -- RawApiStreamWindow.test.tsx`

Expected: FAIL because RawApiStreamWindow does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
if (label === "raw-api-stream") {
  createRoot(root).render(<StrictMode><RawApiStreamWindow /></StrictMode>);
  return;
}
```

Move event rendering from `RawApiChat` into `RawApiStreamWindow`. Publish every received SSE record, answer delta, snapshot response, and clear request through the channel. Replace the in-panel log with an `Open Raw API Stream` button.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @continuity/desktop test -- RawApiStreamWindow.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/RawApiChat.tsx apps/desktop/src/features/chat/RawApiStreamWindow.tsx apps/desktop/src/main.tsx apps/desktop/src/styles.css apps/desktop/src/features/chat/RawApiStreamWindow.test.tsx
git commit -m "Show raw stream in dedicated window"
```

### Task 4: Verify native window behavior

**Files:**
- Modify: `docs/superpowers/specs/2026-08-02-raw-api-stream-window-design.md`

- [ ] **Step 1: Run desktop checks**

Run: `pnpm --filter @continuity/desktop typecheck` and `pnpm --filter @continuity/desktop test`.

Expected: new channel and Raw window tests pass; report existing unrelated typecheck failures if they remain.

- [ ] **Step 2: Run Tauri**

Run: `pnpm --filter @continuity/desktop tauri dev`.

Expected: the main API Chat opens the Raw API Stream window; a weather request produces function-argument deltas, tool_call, tool_result, resumed text, and response.completed in the second window.

- [ ] **Step 3: Commit verification note**

```bash
git add docs/superpowers/specs/2026-08-02-raw-api-stream-window-design.md
git commit -m "Document Raw API Stream window verification"
```
