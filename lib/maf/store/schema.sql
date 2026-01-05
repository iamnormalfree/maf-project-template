-- ABOUTME: SQLite schema for tasks, leases, events, and evidence with WAL and FK enablement.
-- ABOUTME: Supports exactly-once-ish leasing and verification evidence capture for orchestration.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('READY','LEASED','RUNNING','VERIFYING','COMMITTED','ROLLBACK','DONE','DEAD')),
  priority INTEGER NOT NULL DEFAULT 100,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  token_budget INTEGER NOT NULL DEFAULT 0,
  cost_budget_cents INTEGER NOT NULL DEFAULT 0,
  policy_label TEXT NOT NULL DEFAULT 'private'
);

CREATE INDEX IF NOT EXISTS idx_tasks_state_prio ON tasks(state, priority, created_at);

CREATE TABLE IF NOT EXISTS leases (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  UNIQUE(task_id),
  UNIQUE(task_id, attempt)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  verifier TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('PASS','FAIL')),
  details_json TEXT NOT NULL,
  PRIMARY KEY (task_id, attempt, verifier)
);

