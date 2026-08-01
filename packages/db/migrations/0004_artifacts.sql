CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id TEXT PRIMARY KEY,
  gap_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS artifacts_gap_idx ON artifacts (gap_id, created_at);
CREATE INDEX IF NOT EXISTS artifacts_action_idx ON artifacts (gap_id, action_id);
