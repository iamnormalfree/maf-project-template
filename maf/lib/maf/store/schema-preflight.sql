-- ABOUTME: Extended SQLite schema for MAF Agent-Mail preflight system
-- ABOUTME: Adds preflight configurations, executions, escalations, and smoke testing support

-- Preflight configurations table
CREATE TABLE IF NOT EXISTS preflight_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  config_type TEXT NOT NULL CHECK (config_type IN ('smoke_test','reservation_check','escalation_path')),
  config_json TEXT NOT NULL,
  environment_overrides TEXT, -- JSON object for environment-specific overrides
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT,
  metadata TEXT -- JSON for additional metadata
);

-- Preflight execution tracking
CREATE TABLE IF NOT EXISTS preflight_executions (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES preflight_configs(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  execution_context TEXT, -- JSON object containing execution context
  status TEXT NOT NULL CHECK (status IN ('pending','running','passed','failed','skipped','timeout')),
  started_at INTEGER,
  completed_at INTEGER,
  result_json TEXT, -- JSON object with execution results
  evidence_path TEXT, -- Path to evidence files
  error_message TEXT,
  created_at INTEGER NOT NULL
);

-- Escalation paths configuration
CREATE TABLE IF NOT EXISTS escalation_paths (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  trigger_conditions TEXT NOT NULL, -- JSON array of trigger conditions
  escalation_steps TEXT NOT NULL, -- JSON array defining escalation steps
  timeout_minutes INTEGER NOT NULL DEFAULT 30,
  max_escalation_level INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT
);

-- Escalation tracking
CREATE TABLE IF NOT EXISTS escalation_tracking (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES preflight_executions(id) ON DELETE CASCADE,
  path_id TEXT NOT NULL REFERENCES escalation_paths(id) ON DELETE CASCADE,
  current_level INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('active','resolved','expired','cancelled')),
  triggered_at INTEGER NOT NULL,
  escalated_at INTEGER,
  resolved_at INTEGER,
  context_json TEXT, -- JSON object with escalation context
  notes TEXT,
  created_at INTEGER NOT NULL
);

-- Smoke tests configuration and results
CREATE TABLE IF NOT EXISTS smoke_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  test_type TEXT NOT NULL CHECK (test_type IN ('api','database','file_system','integration','performance')),
  test_definition TEXT NOT NULL, -- JSON object defining the test
  timeout_seconds INTEGER NOT NULL DEFAULT 60,
  retry_count INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT
);

-- Agents registry for preflight system
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('coordinator','worker','verifier','escalation_manager')),
  capabilities TEXT, -- JSON array of agent capabilities
  status TEXT NOT NULL CHECK (status IN ('active','inactive','maintenance','error')),
  last_seen INTEGER,
  metadata TEXT, -- JSON object for additional agent metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Reservation conflicts tracking
CREATE TABLE IF NOT EXISTS reservation_conflicts (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  conflicting_agent_id TEXT NOT NULL,
  existing_agent_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL CHECK (conflict_type IN ('lease','access','permission','concurrent_modification')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL CHECK (status IN ('pending','resolved','escalated','ignored')),
  detected_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution_strategy TEXT,
  evidence_path TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_preflight_configs_type_active ON preflight_configs(config_type, is_active);
CREATE INDEX IF NOT EXISTS idx_preflight_executions_config_status ON preflight_executions(config_id, status);
CREATE INDEX IF NOT EXISTS idx_preflight_executions_agent_status ON preflight_executions(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_escalation_paths_active ON escalation_paths(is_active);
CREATE INDEX IF NOT EXISTS idx_escalation_tracking_execution_status ON escalation_tracking(execution_id, status);
CREATE INDEX IF NOT EXISTS idx_smoke_tests_type_active ON smoke_tests(test_type, is_active);
CREATE INDEX IF NOT EXISTS idx_agents_type_status ON agents(type, status);
CREATE INDEX IF NOT EXISTS idx_reservation_conflicts_file_status ON reservation_conflicts(file_path, status);
CREATE INDEX IF NOT EXISTS idx_reservation_conflicts_detected_at ON reservation_conflicts(detected_at);

-- Foreign key relationships to existing reservations table
-- Note: This assumes the reservations table exists in the base schema
-- ALTER TABLE reservations ADD COLUMN preflight_agent_id TEXT REFERENCES agents(id);
-- ALTER TABLE reservations ADD COLUMN preflight_required BOOLEAN NOT NULL DEFAULT 0;
-- ALTER TABLE reservations ADD COLUMN preflight_status TEXT CHECK (preflight_status IN ('pending','passed','failed','skipped'));
