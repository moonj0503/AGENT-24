# Raw API Stream dedicated-window design

## Goal

Move Raw API Stream out of the main API Chat layout into a dedicated Tauri webview window while preserving live, unmodified event payloads.

## Architecture

- The main window owns the chat SSE request and accumulates raw events for the active turn.
- A hidden raw-api-stream Tauri window is declared in tauri.conf.json; it loads the same React bundle with the window query set to raw-api-stream.
- The main window opens and focuses that window through a Rust Tauri command.
- Both webviews use a named BroadcastChannel. The main window publishes every received raw event and, when requested, a full snapshot of the current event list.
- The Raw window renders the event list only. It supports JSON expansion, automatic bottom scroll, and a clear button. Clearing emits a channel message so the main window clears its in-memory event list too.

## Error handling

- A failure to open the native window is surfaced in the main chat view.
- SSE/OpenAI/tool errors remain raw error records and are broadcast like every other record.
- In a non-Tauri browser fallback, the open button opens the Raw route in a browser tab.

## Test plan

- Unit-test message routing: event append, snapshot replacement, and cross-window clear.
- Keep existing API stream validation for tool argument deltas, tool_call/result, resumed text, and completion.
- Manually verify the main button opens a visible standalone Tauri window and events scroll there during a weather request.
