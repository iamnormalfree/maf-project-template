// ABOUTME: Database layer for MAF file reservation system
// ABOUTME: Provides CRUD operations, transactions, and optimized conflict queries

// Better-sqlite3 import for runtime use
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';

export interface FileReservation {
  id: string;
  filePath: string;
  agentId: string;
  leaseExpiresAt: number;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'expired' | 'released';
  leaseReason?: string;
  metadata?: string; // JSON
}

export interface Agent {
  id: string;
  name: string;
  type: 'coordinator' | 'worker' | 'verifier' | 'escalation_manager';
  status: 'active' | 'inactive' | 'maintenance' | 'error';
  lastSeen?: number;
  capabilities?: string; // JSON array
  metadata?: string; // JSON object
  createdAt: number;
  updatedAt: number;
}

export interface ReservationConflict {
  id: string;
  filePath: string;
  conflictingAgentId: string;
  existingAgentId: string;
  conflictType: 'lease' | 'access' | 'permission' | 'concurrent_modification';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'resolved' | 'escalated' | 'ignored';
  detectedAt: number;
  resolvedAt?: number;
  resolutionStrategy?: string;
  evidencePath?: string;
  createdAt: number;
}

export interface ReservationStoreConfig {
  dbPath: string;
}

export class ReservationStore {
  private db: any = null;
  private preparedStatements = new Map<string, any>();
  private config: ReservationStoreConfig;

  constructor(config: ReservationStoreConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const dbDir = dirname(this.config.dbPath);
      try {
        mkdirSync(dbDir, { recursive: true });
      } catch (error) {
        // Directory might already exist, which is fine
      }

      this.db = new Database(this.config.dbPath, {
        readonly: false,
        fileMustExist: false
      });

      // Configure for production safety and performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = memory');

      // Load schema
      await this.loadSchema();
      
      // Create prepared statements
      this.prepareStatements();
      
    } catch (error) {
      throw new Error('Failed to initialize reservation store: ' + error);
    }
  }

  private async loadSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Load base schema
      const baseSchemaPath = join(__dirname, 'schema.sql');
      try {
        const baseSchema = readFileSync(baseSchemaPath, 'utf8');
        this.db.exec(baseSchema);
      } catch (error) {
        // Base schema might not exist - continue
        console.warn('Could not load base schema:', error);
      }

      // Load preflight schema
      const preflightSchemaPath = join(__dirname, 'schema-preflight.sql');
      try {
        const preflightSchema = readFileSync(preflightSchemaPath, 'utf8');
        this.db.exec(preflightSchema);
      } catch (error) {
        console.warn('Could not load preflight schema:', error);
      }

      // Load reservations schema
      const reservationsSchemaPath = join(__dirname, 'schema-reservations.sql');
      try {
        const reservationsSchema = readFileSync(reservationsSchemaPath, 'utf8');
        this.db.exec(reservationsSchema);
      } catch (error) {
        console.warn('Could not load reservations schema:', error);
      }

      // Create basic tables if schemas don't exist
      this.createBasicTables();

    } catch (error) {
      throw new Error('Schema loading failed: ' + error);
    }
  }

  private createBasicTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create file_reservations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_reservations (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        agent_id TEXT NOT NULL,
        lease_expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','expired','released')),
        lease_reason TEXT,
        metadata TEXT
      )
    `);

    // Create agents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('coordinator','worker','verifier','escalation_manager')),
        status TEXT NOT NULL CHECK (status IN ('active','inactive','maintenance','error')),
        last_seen INTEGER,
        capabilities TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_reservations_path_status ON file_reservations(file_path, status);
      CREATE INDEX IF NOT EXISTS idx_file_reservations_agent_expires ON file_reservations(agent_id, lease_expires_at);
      CREATE INDEX IF NOT EXISTS idx_file_reservations_expires_at ON file_reservations(lease_expires_at);
      CREATE INDEX IF NOT EXISTS idx_agents_type_status ON agents(type, status);
      CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);
    `);
  }

  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    // File reservation statements
    this.preparedStatements.set('createReservation', this.db.prepare(`
      INSERT OR FAIL INTO file_reservations (
        id, file_path, agent_id, lease_expires_at, created_at, updated_at, 
        status, lease_reason, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.preparedStatements.set('getReservation', this.db.prepare(`
      SELECT * FROM file_reservations WHERE file_path = ?
    `));

    this.preparedStatements.set('updateReservation', this.db.prepare(`
      UPDATE file_reservations 
      SET agent_id = ?, lease_expires_at = ?, updated_at = ?, status = ?, lease_reason = ?, metadata = ?
      WHERE file_path = ?
    `));

    this.preparedStatements.set('deleteReservation', this.db.prepare(`
      DELETE FROM file_reservations WHERE file_path = ?
    `));

    this.preparedStatements.set('cleanupExpired', this.db.prepare(`
      DELETE FROM file_reservations 
      WHERE status = 'active' AND lease_expires_at <= ?
    `));

    // Agent statements
    this.preparedStatements.set('createAgent', this.db.prepare(`
      INSERT OR REPLACE INTO agents (
        id, name, type, status, last_seen, capabilities, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.preparedStatements.set('getAgent', this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `));

    this.preparedStatements.set('updateAgentHeartbeat', this.db.prepare(`
      UPDATE agents SET last_seen = ?, updated_at = ? WHERE id = ?
    `));

    // Conflict statements
    this.preparedStatements.set('createConflict', this.db.prepare(`
      INSERT INTO reservation_conflicts (
        id, file_path, conflicting_agent_id, existing_agent_id, conflict_type,
        severity, status, detected_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));
  }

  private getStatement(sql: string): any {
    const stmt = this.preparedStatements.get(sql);
    if (!stmt) {
      throw new Error('Prepared statement not found: ' + sql);
    }
    return stmt;
  }

  async createReservation(reservation: Omit<FileReservation, 'id'> & { id?: string }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = this.getReservationSync(reservation.filePath);
    if (existing) {
      throw new Error('UNIQUE constraint failed: file_reservations.file_path');
    }

    const id = (reservation as FileReservation).id || randomUUID();
    const now = Date.now();

    this.getStatement('createReservation').run(
      id,
      reservation.filePath,
      reservation.agentId,
      reservation.leaseExpiresAt,
      reservation.createdAt || now,
      reservation.updatedAt || now,
      reservation.status,
      reservation.leaseReason,
      reservation.metadata
    );
  }

  createReservationSync(reservation: Omit<FileReservation, 'id'> & { id?: string }): void {
    if (!this.db) throw new Error('Database not initialized');

    const existing = this.getReservationSync(reservation.filePath);
    if (existing) {
      throw new Error('UNIQUE constraint failed: file_reservations.file_path');
    }

    const id = (reservation as FileReservation).id || randomUUID();
    const now = Date.now();

    this.getStatement('createReservation').run(
      id,
      reservation.filePath,
      reservation.agentId,
      reservation.leaseExpiresAt,
      reservation.createdAt || now,
      reservation.updatedAt || now,
      reservation.status,
      reservation.leaseReason,
      reservation.metadata
    );
  }

  async getReservation(filePath: string): Promise<FileReservation | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.getStatement('getReservation').get(filePath) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      filePath: row.file_path,
      agentId: row.agent_id,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      leaseReason: row.lease_reason || undefined,
      metadata: row.metadata || undefined
    };
  }

  getReservationSync(filePath: string): FileReservation | undefined {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.getStatement('getReservation').get(filePath) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      filePath: row.file_path,
      agentId: row.agent_id,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      leaseReason: row.lease_reason || undefined,
      metadata: row.metadata || undefined
    };
  }

  async updateReservation(filePath: string, updates: Partial<FileReservation>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.getReservation(filePath);
    if (!existing) {
      throw new Error('Reservation not found for file: ' + filePath);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };

    this.getStatement('updateReservation').run(
      updated.agentId,
      updated.leaseExpiresAt,
      updated.updatedAt,
      updated.status,
      updated.leaseReason,
      updated.metadata,
      filePath
    );
  }

  updateReservationSync(filePath: string, updates: Partial<FileReservation>): void {
    if (!this.db) throw new Error('Database not initialized');

    const existing = this.getReservationSync(filePath);
    if (!existing) {
      throw new Error('Reservation not found for file: ' + filePath);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };

    this.getStatement('updateReservation').run(
      updated.agentId,
      updated.leaseExpiresAt,
      updated.updatedAt,
      updated.status,
      updated.leaseReason,
      updated.metadata,
      filePath
    );
  }

  async deleteReservation(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.getStatement('deleteReservation').run(filePath);
  }

  async findConflicts(filePaths: string[], agentId: string): Promise<Array<{
    filePath: string;
    agentId: string;
    leaseExpiresAt: number;
  }>> {
    if (!this.db) throw new Error('Database not initialized');

    if (filePaths.length === 0) return [];

    const now = Date.now();
    
    // Handle large file lists by chunking
    const chunkSize = 900; // SQLite has a limit on bind parameters
    const conflicts: Array<{
      filePath: string;
      agentId: string;
      leaseExpiresAt: number;
    }> = [];

    for (let i = 0; i < filePaths.length; i += chunkSize) {
      const chunk = filePaths.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      
      const sql = `
        SELECT file_path, agent_id, lease_expires_at 
        FROM file_reservations 
        WHERE file_path IN (${placeholders}) 
        AND status = 'active' 
        AND lease_expires_at > ?
        AND agent_id != ?
      `;
      
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...chunk, now, agentId) as Array<{
        file_path: string;
        agent_id: string;
        lease_expires_at: number;
      }>;

      conflicts.push(...rows.map(row => ({
        filePath: row.file_path,
        agentId: row.agent_id,
        leaseExpiresAt: row.lease_expires_at
      })));
    }

    return conflicts;
  }

  async createAgent(agent: Omit<Agent, 'id'> & { id?: string }): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = agent.id || randomUUID();
    const now = Date.now();

    this.getStatement('createAgent').run(
      id,
      agent.name,
      agent.type,
      agent.status,
      agent.lastSeen || now,
      JSON.stringify(agent.capabilities || []),
      JSON.stringify(agent.metadata || {}),
      agent.createdAt || now,
      agent.updatedAt || now
    );

    return id;
  }

  async getAgent(agentId: string): Promise<Agent | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.getStatement('getAgent').get(agentId) as any;
    if (!row) return undefined;

    const capabilities = typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities || [];
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      lastSeen: row.last_seen,
      capabilities,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async updateAgentHeartbeat(agentId: string, lastSeen: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.getStatement('updateAgentHeartbeat').run(lastSeen, Date.now(), agentId);
  }

  async executeTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec('BEGIN');

    try {
      const result = fn();
      const resolved = result instanceof Promise ? await result : result;
      this.db.exec('COMMIT');
      return resolved;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async cleanupExpiredReservations(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const result = this.getStatement('cleanupExpired').run(now);
    
    return result.changes;
  }

  async getTables(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    return rows.map(row => row.name);
  }

  async getIndexes(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
    return rows.map(row => row.name);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.preparedStatements.clear();
      this.db.close();
      this.db = null;
    }
  }
}
