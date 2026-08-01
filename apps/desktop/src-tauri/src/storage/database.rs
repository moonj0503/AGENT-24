use rusqlite::{Connection, Result};

pub fn initialize(connection: &Connection) -> Result<()> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS activity_events (
            event_id TEXT PRIMARY KEY NOT NULL,
            event_type TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            application_name TEXT NOT NULL,
            application_category TEXT NOT NULL,
            resource_title TEXT,
            resource_kind TEXT,
            idle_seconds INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS observation_workflow_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            state_json TEXT NOT NULL
        );
        ",
    )
}
