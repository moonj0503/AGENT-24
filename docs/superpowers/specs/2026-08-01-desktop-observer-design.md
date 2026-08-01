# Desktop Observer Design

## Scope

Member 1 owns `apps/desktop/src-tauri/**`. This feature observes the active Windows application and window title, measures user idle time, applies privacy rules locally, stores only sanitized activity events locally, and exposes Tauri commands for the desktop UI. It does not call OpenAI, backend HTTP endpoints, or modify shared contracts.

## Architecture

The implementation separates platform access from deterministic processing:

- `platform/windows.rs` wraps the Windows APIs needed to read the foreground window, its title, its owning process, and the time since last user input.
- `observer` compares successive sanitized snapshots and produces `ACTIVE_WINDOW_CHANGED`, `USER_ACTIVITY`, or `USER_IDLE` activity events.
- `privacy` rejects blocked applications before event creation, and redacts email addresses, phone numbers, and long numeric identifiers in titles.
- `storage` persists sanitized events to a local SQLite database and returns recent events in newest-first order.
- `commands` exposes `get_current_activity`, `get_recent_activity_events`, and a mock-observer switch to the React layer through Tauri IPC.

All modules use local Rust types. Their serialized event form matches the already-frozen `ActivityEvent` contract: ISO 8601 timestamp, known event type, application category, optional resource, and non-negative idle seconds.

## Privacy and Safety

The default blocked application list includes password managers, authentication applications, and private/incognito browser windows. A blocked snapshot produces no event and is never stored. A non-blocked title is redacted before it reaches observer state, commands, or storage. The observer reads metadata only; it does not capture keystrokes, document contents, screenshots, or full browsing history.

## Windows Behaviour

On Windows, the platform adapter uses the foreground-window and last-input Win32 APIs. If no readable foreground window exists, it returns no snapshot rather than an error event. On other operating systems, the adapter returns an explicit unsupported-platform error; the mock observer remains available for development and demos.

## Event Behaviour

Each poll creates an event only when the observed state changes: a new allowed foreground application/window creates `ACTIVE_WINDOW_CHANGED`; a transition across the configured idle threshold creates `USER_IDLE` or `USER_ACTIVITY`. Identical polls create no duplicate event. Mock mode returns a deterministic, sanitized sequence using the same conversion pipeline.

## Testing

Unit tests cover title parsing/category classification, blocked-app matching, each redaction class, and event conversion/deduplication. Windows API calls remain behind a small interface so these tests do not require a live desktop session. A Windows-only smoke path verifies that current activity and idle duration can be read at runtime.

## Non-goals

This feature does not alter frontend project-selection behaviour, shared TypeScript contracts, backend routing, or agent code. Those areas are owned by other team members.
