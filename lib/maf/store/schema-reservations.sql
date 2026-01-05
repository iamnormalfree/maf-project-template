-- ABOUTME: SQLite schema extensions for file reservation system
-- ABOUTME: Supports file leasing, conflict detection, and agent coordination

-- File reservations table for lease management
CREATE TABLE IF NOT EXISTS file_reservations (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','expired','released')),
  lease_reason TEXT,
  metadata TEXT -- JSON for additional reservation metadata
);

-- Agents table for reservation system coordination
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('coordinator','worker','verifier','escalation_manager')),
  status TEXT NOT NULL CHECK (status IN ('active','inactive','maintenance','error')),
  last_seen INTEGER,
  capabilities TEXT, -- JSON array of agent capabilities
  metadata TEXT, -- JSON object for additional agent metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Reservation conflicts tracking for audit trail
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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_file_reservations_path_status ON file_reservations(file_path, status);
CREATE INDEX IF NOT EXISTS idx_file_reservations_agent_expires ON file_reservations(agent_id, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_file_reservations_expires_at ON file_reservations(lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_agents_type_status ON agents(type, status);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);
CREATE INDEX IF NOT EXISTS idx_reservation_conflicts_file_status ON reservation_conflicts(file_path, status);
CREATE INDEX IF NOT EXISTS idx_reservation_conflicts_detected_at ON reservation_conflicts(detected_at);

-- Foreign key relationships
-- Note: These will be added via ALTER TABLE after base tables exist
-- ALTER TABLE file_reservations ADD CONSTRAINT fk_reservations_agent FOREIGN KEY (agent_id) REFERENCES agents(id);
-- ALTER TABLE reservation_conflicts ADD CONSTRAINT fk_conflicts_conflicting_agent FOREIGN KEY (conflicting_agent_id) REFERENCES agents(id);
-- ALTER TABLE reservation_conflicts ADD CONSTRAINT fk_conflicts_existing_agent FOREIGN KEY (existing_agent_id) REFERENCES agents(id);
