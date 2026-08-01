# Observation persistence and resilience

The desktop stores one versioned observation-workflow state document in its existing local SQLite database (`continuity-activity.db`). Native builds use the `observation_workflow_state` table; browser previews and tests use an in-memory adapter.

Persisted data is limited to sanitized `ActivityEvent` metadata, the current work-session identifier and creation time, upload/inference queues, confirmed Goal, candidate stability state, pause preference, confirmation snooze expiry, same-day ignored candidate signatures, and normalized blocked-application identifiers. The local upload queue keeps at most 5,000 events and seven days of data, discarding the oldest entries first.

API keys, raw window titles, raw keystrokes, screenshots, clipboard contents, document bodies, and message bodies are never part of the persistence schema. Applications on the user block list are discarded before entering the queue. The native observer's existing privacy filter remains the first collection boundary.

Observation can be paused or resumed from Permissions. The same screen accepts a normalized process/application name for the privacy block list and provides explicit actions to clear local observation history, either preserving or also clearing the confirmed Goal. These actions do not clear server data.

Uploads retain their original event IDs and use a deterministic SHA-256 idempotency key derived only from the work-session ID and sorted event IDs. Upload and inference retries use independent bounded exponential backoff: two seconds initially, doubling to two minutes for six attempts, followed by five-minute slow mode. Collection continues while network delivery is backing off.

The work-session ID normally survives restarts and rotates after 24 hours. Malformed, corrupt, or unknown-version state is ignored safely and replaced with defaults; errors shown to the user never include stored payloads.
