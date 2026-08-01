CREATE TABLE IF NOT EXISTS action_results (
  gap_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  result_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gap_id, action_id)
);

CREATE INDEX IF NOT EXISTS action_results_gap_idx ON action_results (gap_id, created_at);
