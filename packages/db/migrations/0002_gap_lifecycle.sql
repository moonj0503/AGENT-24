CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  checkpoint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checkpoints_goal_idx ON checkpoints (goal_id, created_at);

CREATE TABLE IF NOT EXISTS gap_sessions (
  gap_id TEXT PRIMARY KEY,
  work_session_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gap_sessions_goal_idx ON gap_sessions (goal_id, started_at);

CREATE TABLE IF NOT EXISTS action_plans (
  plan_id TEXT PRIMARY KEY,
  gap_id TEXT NOT NULL,
  plan_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gap_actions (
  gap_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_data JSONB NOT NULL,
  status TEXT NOT NULL,
  decision TEXT,
  decision_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gap_id, action_id)
);

CREATE TABLE IF NOT EXISTS recovery_briefs (
  brief_id TEXT PRIMARY KEY,
  gap_id TEXT NOT NULL,
  brief_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recovery_briefs_gap_idx ON recovery_briefs (gap_id, created_at);
