// ABOUTME: Consolidated factory for creating MAF runtime state instances with canonical schema alignment.
// ABOUTME: Supports file-based and SQLite-based runtimes with graceful fallback, WAL mode, and synthetic task mapping.

import { createHash } from 'node:crypto';
import type { MafRuntimeState } from './runtime-state';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export interface MafRuntimeConfig {
  type: 'file' | 'sqlite';
  agentMailRoot?: string;
  dbPath?: string;
}

export async function createMafRuntimeState(config: MafRuntimeConfig): Promise<MafRuntimeState> {
  const { type, agentMailRoot = '.agent-mail', dbPath = 'runtime/maf.db' } = config;

  if (!type || !['file', 'sqlite'].includes(type)) {
    throw new Error(`Invalid runtime type: ${type}. Must be 'file' or 'sqlite'`);
  }

  if (type === 'sqlite' && !dbPath) {
    throw new Error('SQLite runtime requires dbPath configuration');
  }

  try {
    if (type === 'sqlite') {
      return await createSqliteRuntimeState(dbPath, agentMailRoot);
    } else {
      const { createFileBasedRuntimeState } = await import('./runtime-state');
      return createFileBasedRuntimeState(agentMailRoot);
    }
  } catch (error) {
    if (type === 'sqlite') {
      console.warn(`SQLite runtime creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.warn('Falling back to file-based runtime');
      
      try {
        const { createFileBasedRuntimeState } = await import('./runtime-state');
        return createFileBasedRuntimeState(agentMailRoot);
      } catch (fallbackError) {
        throw new Error(`Both SQLite and file runtime creation failed: SQLite (${error instanceof Error ? error.message : 'Unknown error'}), File (${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'})`);
      }
    }
    
    throw error;
  }
}

export async function createMafRuntimeStateFromEnv(): Promise<MafRuntimeState> {
  // Environment variable standardization with backward compatibility
  let runtimeType = process.env.MAF_RUNTIME?.toLowerCase() || process.env.MAF_RUNTIME_MODE?.toLowerCase() || 'file';
  const agentMailRoot = process.env.MAF_AGENT_MAIL_ROOT || '.agent-mail';
  const dbPath = process.env.MAF_DB_PATH || join(process.cwd(), '.maf', 'runtime.db');

  // Deprecation warning for old environment variable
  if (process.env.MAF_RUNTIME_MODE && !process.env.MAF_RUNTIME) {
    console.warn('DEPRECATION: MAF_RUNTIME_MODE is deprecated. Use MAF_RUNTIME=sqlite|json instead.');
  }

  // Handle comma-separated runtime types (e.g., "sqlite,json")
  if (runtimeType.includes(',')) {
    const modes = runtimeType.split(',').map(m => m.trim().toLowerCase());
    // Use the first valid mode
    runtimeType = modes.find(m => ['file', 'sqlite', 'json'].includes(m)) || 'file';
  }

  // Support both old and new runtime type values
  const normalizedType = runtimeType === 'json' ? 'file' : runtimeType;
  
  if (!['file', 'sqlite'].includes(normalizedType)) {
    console.warn(`Invalid MAF_RUNTIME value: ${runtimeType}. Using 'file' as fallback`);
    const config: MafRuntimeConfig = {
      type: 'file',
      agentMailRoot,
      dbPath
    };
    return createMafRuntimeState(config);
  }

  const config: MafRuntimeConfig = {
    type: normalizedType as 'file' | 'sqlite',
    agentMailRoot,
    dbPath
  };

  return createMafRuntimeState(config);
}

/**
 * Generate deterministic synthetic task ID for file operations
 */
function syntheticTaskId(filePath: string): string {
  return `file_${createHash('sha256').update(filePath).digest('hex').substring(0, 16)}`;
}

/**
 * Load canonical schema with synthetic task support extensions
 */
function loadCanonicalSchema(db: any): void {
  try {
    // Load canonical schema
    const baseSchemaPath = join(__dirname, '..', 'store', 'schema.sql');
    const canonicalSchema = readFileSync(baseSchemaPath, 'utf8');
    db.exec(canonicalSchema);
    console.log('Applied canonical schema');

    // Add performance indexes for synthetic tasks
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_synthetic_file ON tasks(id, state) WHERE id LIKE 'file_%';
      CREATE INDEX IF NOT EXISTS idx_events_synthetic_tasks ON events(task_id, ts) WHERE task_id LIKE 'file_%';
      CREATE INDEX IF NOT EXISTS idx_leases_expiration ON leases(lease_expires_at);
    `);
    console.log('Added synthetic task performance indexes');

  } catch (error) {
    console.error('Failed to load canonical schema:', error);
    throw new Error(`Schema loading failed: ${error}`);
  }
}

/**
 * Migrate data from legacy runtime_* tables to canonical schema
 */
function migrateLegacyData(db: any): void {
  try {
    // Check if legacy tables exist
    const legacyTables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name LIKE 'runtime_%'
    `).all();

    if (legacyTables.length === 0) {
      console.log('No legacy runtime_* tables found - skipping migration');
      return;
    }

    console.log(`Found ${legacyTables.length} legacy runtime_* tables - migrating to canonical schema`);

    const now = Date.now();

    // Migrate runtime_leases to synthetic tasks + leases
    try {
      const legacyLeases = db.prepare(`
        SELECT * FROM runtime_leases
      `).all();

      for (const lease of legacyLeases) {
        const taskId = syntheticTaskId(lease.file_path);
        
        // Create synthetic task if not exists
        db.prepare(`
          INSERT OR IGNORE INTO tasks (
            id, state, priority, payload_json, created_at, updated_at, policy_label
          ) VALUES (?, 'READY', 100, ?, ?, ?, 'private')
        `).run(
          taskId,
          JSON.stringify({
            type: 'synthetic_file_lease',
            filePath: lease.file_path,
            originalLeaseId: lease.id
          }),
          lease.created_at,
          now
        );

        // Create lease for synthetic task
        db.prepare(`
          INSERT OR REPLACE INTO leases (task_id, agent_id, lease_expires_at, attempt)
          VALUES (?, ?, ?, 1)
        `).run(taskId, lease.agent_id, lease.lease_expires_at);
      }

      console.log(`Migrated ${legacyLeases.length} legacy leases to synthetic tasks`);
    } catch (error) {
      console.warn('Failed to migrate runtime_leases:', error);
    }

    // Drop legacy tables after processing
    for (const table of legacyTables) {
      try {
        db.prepare(`DROP TABLE ${table.name}`).run();
        console.log(`Dropped legacy table: ${table.name}`);
      } catch (error) {
        console.warn(`Failed to drop legacy table ${table.name}:`, error);
      }
    }

    console.log('Legacy data migration completed successfully');

  } catch (error) {
    console.error('Legacy data migration failed:', error);
    // Continue with runtime creation even if migration fails
  }
}

/**
 * SQLite runtime state implementation with canonical schema compliance
 */
function createSqliteRuntimeState(dbPath: string, agentMailRoot: string): MafRuntimeState {
  let db: any = null;

  try {
    // Import better-sqlite3 dynamically
    const sqliteModule = require('better-sqlite3');
    const Database = sqliteModule.default || sqliteModule;

    // Initialize database with production safety settings
    db = new Database(dbPath, {
      readonly: false,
      fileMustExist: false,
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
    });

    // Configure for production safety and performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = memory');
    db.pragma('mmap_size = 268435456'); // 256MB

    // Load canonical schema only (no runtime_* schema)
    loadCanonicalSchema(db);

    // Migrate any legacy runtime_* data to canonical schema
    migrateLegacyData(db);

  } catch (error) {
    console.error('Failed to initialize SQLite runtime state:', error);
    
    if ((error as any).code === 'MODULE_NOT_FOUND') {
      throw new Error(`better-sqlite3 module not found. Install with: npm install better-sqlite3`);
    }
    
    throw new Error(`SQLite initialization failed: ${error}`);
  }

  // Connection pool simulation using prepared statements
  const preparedStatements = new Map<string, any>();

  function getStatement(sql: string): any {
    if (!preparedStatements.has(sql)) {
      preparedStatements.set(sql, db!.prepare(sql));
    }
    return preparedStatements.get(sql);
  }

  // Transaction wrapper with retry logic
  function withTransaction<T>(fn: () => T, maxRetries: number = 3): T {
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return db!.transaction(fn)();
      } catch (error) {
        lastError = error as Error;
        
        // Retry on database locked errors
        if (error instanceof Error && error.message.includes('database is locked')) {
          console.warn(`Database locked, retrying (attempt ${attempt + 1}/${maxRetries})`);
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 100;
          // Synchronous delay for transaction retry
          const start = Date.now();
          while (Date.now() - start < delay) {
            // Busy wait
          }
          continue;
        }
        
        // Non-retryable error, throw immediately
        throw error;
      }
    }
    
    throw lastError!;
  }

  // Return EXACTLY MafRuntimeState interface - no extra methods
  const runtimeState: MafRuntimeState = {
    async enqueue(message) {
      if (!db) throw new Error('Database not initialized');

      try {
        const now = message.timestamp || Date.now();
        const taskId = syntheticTaskId(`message_${message.type}_${now}_${Math.random()}`);

        withTransaction(() => {
          // Create synthetic task for message
          const insertTask = getStatement(`
            INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
            VALUES (?, 'DONE', 75, ?, ?, ?, 'private')
          `);

          insertTask.run(
            taskId,
            JSON.stringify({
              type: 'synthetic_message',
              messageType: message.type,
              timestamp: message.timestamp || now
            }),
            now,
            now
          );

          // Store message as event
          const insertEvent = getStatement(`
            INSERT INTO events (task_id, ts, kind, data_json)
            VALUES (?, ?, 'message_enqueued', ?)
          `);

          insertEvent.run(
            taskId,
            message.timestamp || now,
            JSON.stringify(message)
          );
        });

      } catch (error) {
        console.error('Failed to enqueue message:', error);
        throw new Error(`Message enqueue failed: ${error}`);
      }
    },

    async acquireLease(lease) {
      if (!db) throw new Error('Database not initialized');

      try {
        const now = Date.now();
        const taskId = syntheticTaskId(lease.filePath);

        // Use immediate transaction to minimize race condition window
        withTransaction(() => {
          // Check for existing active lease on this synthetic task with stronger isolation
          const existingLease = getStatement(`
            SELECT agent_id as agentId, lease_expires_at as leaseExpiresAt
            FROM leases l
            JOIN tasks t ON l.task_id = t.id
            WHERE t.id = ? AND t.state IN ('LEASED', 'RUNNING')
            AND l.lease_expires_at > ?
          `).get(taskId, now) as { agentId: string; leaseExpiresAt: number } | undefined;

          if (existingLease) {
            // More explicit error with current agent context
            throw new Error(
              'File already leased by ' + existingLease.agentId + ' until ' + new Date(existingLease.leaseExpiresAt).toISOString() +
              ' (attempted by: ' + lease.agentId + ')'
            );
          }

          // Create or update synthetic task for file lease
          const upsertTask = getStatement(`
            INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
            VALUES (?, 'LEASED', 100, ?, ?, ?, 'private')
            ON CONFLICT(id) DO UPDATE SET
              state = 'LEASED',
              updated_at = ?,
              attempts = attempts + 1
          `);

          upsertTask.run(
            taskId,
            JSON.stringify({
              type: 'synthetic_file_lease',
              filePath: lease.filePath,
              agentId: lease.agentId
            }),
            now,
            now,
            now
          );

          // Create lease for synthetic task with atomic check (no OR REPLACE to prevent conflicts)
          const upsertLease = getStatement(`
            INSERT INTO leases (task_id, agent_id, lease_expires_at, attempt)
            VALUES (?, ?, ?, 1)
          `);

          upsertLease.run(taskId, lease.agentId, lease.expiresAt);

          // Return success - this will be the return value of the transaction
          return { success: true, agentId: lease.agentId };
        });

      } catch (error) {
        // Don't wrap the error - let the original error propagate cleanly
        // This helps distinguish between actual failures and expected contention
        throw error;
      }
    },

    async releaseLease(filePath) {
      if (!db) throw new Error('Database not initialized');

      try {
        const taskId = syntheticTaskId(filePath);
        const now = Date.now();

        const result = withTransaction(() => {
          // Update synthetic task state to DONE
          const updateTask = getStatement(`
            UPDATE tasks 
            SET state = 'READY', updated_at = ?
            WHERE id = ? AND state IN ('LEASED', 'RUNNING')
          `);

          const taskResult = updateTask.run(now, taskId);

          // Remove lease
          const deleteLease = getStatement(`
            DELETE FROM leases WHERE task_id = ?
          `);

          const leaseResult = deleteLease.run(taskId);

          return { taskChanges: taskResult.changes, leaseChanges: leaseResult.changes };
        });
        
        if (result.taskChanges === 0) {
          console.warn('No active lease found for file: ' + filePath);
        }
      } catch (error) {
        console.error('Failed to release lease:', error);
        throw new Error('Lease release failed: ' + error);
      }
    },

    async upsertHeartbeat(heartbeat) {
      if (!db) throw new Error('Database not initialized');

      try {
        const now = Date.now();
        const taskId = syntheticTaskId(`heartbeat_${heartbeat.agentId}`);

        withTransaction(() => {
          // Create or update synthetic task for heartbeat
          const upsertTask = getStatement(`
            INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
            VALUES (?, 'DONE', 50, ?, ?, ?, 'private')
            ON CONFLICT(id) DO UPDATE SET
              updated_at = ?,
              attempts = attempts + 1
          `);

          upsertTask.run(
            taskId,
            JSON.stringify({
              type: 'synthetic_heartbeat',
              agentId: heartbeat.agentId
            }),
            now,
            now,
            now
          );

          // Record heartbeat as event
          const insertEvent = getStatement(`
            INSERT INTO events (task_id, ts, kind, data_json)
            VALUES (?, ?, 'heartbeat', ?)
          `);

          insertEvent.run(
            taskId,
            heartbeat.lastSeen,
            JSON.stringify({
              agentId: heartbeat.agentId,
              status: heartbeat.status,
              contextUsagePercent: heartbeat.contextUsagePercent,
              updatedAt: now
            })
          );
        });
      } catch (error) {
        console.error('Failed to upsert heartbeat:', error);
        throw new Error('Heartbeat update failed: ' + error);
      }
    },

    async refresh() {
      if (!db) throw new Error('Database not initialized');

      try {
        withTransaction(() => {
          const now = Date.now();
          const eventThreshold = now - (24 * 60 * 60 * 1000); // 24 hours ago

          // Clean expired leases and update tasks
          const expiredLeasesResult = getStatement(`
            UPDATE tasks 
            SET state = 'READY', updated_at = ?
            WHERE id IN (
              SELECT t.id FROM tasks t
              JOIN leases l ON t.id = l.task_id
              WHERE t.state IN ('LEASED', 'RUNNING') 
              AND l.lease_expires_at <= ?
            )
          `).run(now, now);

          if (expiredLeasesResult.changes > 0) {
            console.log('Updated expired lease tasks to READY');
          }

          // Remove expired leases
          const deleteExpiredLeases = getStatement(`
            DELETE FROM leases WHERE lease_expires_at <= ?
          `).run(now);

          if (deleteExpiredLeases.changes > 0) {
            console.log('Cleaned ' + deleteExpiredLeases.changes + ' expired leases');
          }

          // Clean old synthetic task events
          const oldEventsResult = getStatement(`
            DELETE FROM events 
            WHERE ts <= ? AND task_id LIKE 'file_%'
          `).run(eventThreshold);

          if (oldEventsResult.changes > 0) {
            console.log('Cleaned ' + oldEventsResult.changes + ' old synthetic task events');
          }
        });

      } catch (error) {
        console.error('Failed to refresh runtime state:', error);
        throw new Error('Runtime refresh failed: ' + error);
      }
    },

    async renew(taskId: string, agentId: string, ttlMs: number): Promise<boolean> {
      if (!db) {
      throw new Error("Database not initialized");
    }
    
    // Additional database connectivity check
    try {
      // Test database connectivity with a simple query
      db.prepare("SELECT 1").get();
    } catch (dbError) {
      throw new Error("Database not initialized");
    }

      // Input validation
      if (!taskId || typeof taskId !== 'string') {
        throw new Error("Invalid taskId: must be non-empty string");
      }
      
      if (!agentId || typeof agentId !== 'string') {
        throw new Error("Invalid agentId: must be non-empty string");
      }
      
      // TTL validation with proper bounds checking
      if (typeof ttlMs !== 'number' || !isFinite(ttlMs)) {
        throw new Error("Invalid TTL: must be a finite number");
      }
      
      if (ttlMs <= 0) {
        console.warn(`Rejecting invalid TTL ${ttlMs} - must be positive`);
        return false;
      }
      
      try {
        const now = Date.now();
        const maxExpiresAt = 8.64e15; // Maximum Date timestamp in ms (per ECMAScript spec)
        const newExpiresAt = now + ttlMs;
        
        // Additional check for overflow prevention
        if (!isFinite(newExpiresAt) || newExpiresAt <= now || newExpiresAt > maxExpiresAt) {
          console.warn(`Rejecting renewal - resulting expiration time ${newExpiresAt} is invalid`);
          return false;
        }

        const result = withTransaction(() => {
          // First, check if lease exists and is still valid (not expired)
          const currentLease = getStatement(`
            SELECT lease_expires_at as leaseExpiresAt, task_id as taskId
            FROM leases 
            WHERE task_id = ? AND agent_id = ?
          `).get(taskId, agentId) as { leaseExpiresAt: number; taskId: string } | undefined;

          if (!currentLease) {
            console.warn(`Failed to renew lease for task ${taskId} by agent ${agentId} - lease not found`);
            return false;
          }
          
          // Check if lease is already expired
          if (currentLease.leaseExpiresAt <= now) {
            console.warn(`Failed to renew lease for task ${taskId} by agent ${agentId} - lease already expired at ${new Date(currentLease.leaseExpiresAt).toISOString()}`);
            return false;
          }

          const updateResult = getStatement(`
            UPDATE leases 
            SET lease_expires_at = ? 
            WHERE task_id = ? AND agent_id = ?
          `).run(newExpiresAt, taskId, agentId);

          if (updateResult.changes === 1) {
            try {
              const logLevel = (process.env.MAF_LOG_LEVEL || process.env.LOG_LEVEL || '').toLowerCase();
              if (logLevel === 'debug') {
                console.log(`Renewed lease for task ${taskId} by agent ${agentId} until ${new Date(newExpiresAt).toISOString()}`);
              }
            } catch (dateError) {
              const logLevel = (process.env.MAF_LOG_LEVEL || process.env.LOG_LEVEL || '').toLowerCase();
              if (logLevel === 'debug') {
                console.log(`Renewed lease for task ${taskId} by agent ${agentId} until ${newExpiresAt}`);
              }
            }
            return true;
          } else {
            console.warn(`Failed to renew lease for task ${taskId} by agent ${agentId} - not found or not owned`);
            return false;
          }
        });

        return result;
      } catch (error) {
        // Handle database errors gracefully
        if (error instanceof Error && error.message.includes('NOT NULL constraint failed')) {
          console.warn(`Cannot renew corrupted lease for task ${taskId} by agent ${agentId} - data corruption detected`);
          return false;
        }
        
        if (error instanceof Error && error.message.includes('database is locked')) {
          throw new Error(`Database busy during lease renewal for task ${taskId}: ${error.message}`);
        }
        
        console.error("Failed to renew lease:", error);
        throw new Error("Lease renewal failed: " + error);
      }
    },

    expireLeases(now: number): number {
      if (!db) throw new Error("Database not initialized");

      try {
        return withTransaction(() => {
          // Update expired lease tasks to READY state
          const expiredTasksResult = getStatement(`
            UPDATE tasks 
            SET state = 'READY', updated_at = ? 
            WHERE id IN (
              SELECT t.id FROM tasks t 
              JOIN leases l ON t.id = l.task_id 
              WHERE t.state IN ('LEASED', 'RUNNING') 
              AND l.lease_expires_at <= ? 
            )
          `).run(now, now);

          // Remove expired leases
          const deleteExpiredLeases = getStatement(`
            DELETE FROM leases WHERE lease_expires_at <= ?
          `).run(now);

          const totalExpired = expiredTasksResult.changes + deleteExpiredLeases.changes;
          if (totalExpired > 0) {
            console.log(`Expired lease tasks to READY and removed ${deleteExpiredLeases.changes} expired leases`);
          }

          return totalExpired;
        });
      } catch (error) {
        console.error("Failed to expire leases:", error);
        throw new Error("Lease expiration failed: " + error);
      }
    },
  };

  return runtimeState;
}

export async function isSqliteRuntimeAvailable(): Promise<boolean> {
  try {
    await import('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

// Export createSqliteRuntimeState for testing and direct use
export { createSqliteRuntimeState };

// Legacy export for backward compatibility
export function createRuntimeFactory(dbPath?: string): MafRuntimeState {
  const runtimeMode = process.env.MAF_RUNTIME_MODE || process.env.MAF_RUNTIME || 'sqlite';
  const modes = runtimeMode.split(',').map(m => m.trim().toLowerCase());

  const attachRuntimeInfo = (runtime: any, type: 'sqlite' | 'file', details: Record<string, any>) => {
    if (typeof runtime.getRuntimeInfo !== 'function') {
      runtime.getRuntimeInfo = () => ({ type, ...details });
    }
    return runtime;
  };

  // Try each mode in order until one succeeds
  for (const mode of modes) {
    try {
      if (mode === 'sqlite') {
        if (!dbPath) {
          dbPath = join(process.cwd(), '.maf', 'runtime.db');
        }
        const runtime = createSqliteRuntimeState(dbPath, '.agent-mail');
        return attachRuntimeInfo(runtime, 'sqlite', { dbPath, agentMailRoot: '.agent-mail' });
      } else if (mode === 'json' || mode === 'file') {
        const { createFileBasedRuntimeState } = require('./runtime-state');
        const agentMailRoot = process.env.MAF_AGENT_MAIL_ROOT || '.agent-mail';
        const runtime = createFileBasedRuntimeState(agentMailRoot);
        return attachRuntimeInfo(runtime, 'file', { agentMailRoot });
      }
    } catch (error) {
      console.warn(`Failed to initialize ${mode} runtime mode:`, error);
      if (mode === 'sqlite') {
        try {
          const { createFileBasedRuntimeState } = require('./runtime-state');
          console.warn('Falling back to file-based runtime due to SQLite issue');
          const agentMailRoot = process.env.MAF_AGENT_MAIL_ROOT || '.agent-mail';
          const runtime = createFileBasedRuntimeState(agentMailRoot);
          return attachRuntimeInfo(runtime, 'file', { agentMailRoot });
        } catch (fallbackError) {
          console.warn('File-based runtime fallback failed:', fallbackError);
        }
      }

      if (mode === modes[modes.length - 1] || process.env.NODE_ENV === 'production') {
        throw error;
      }

      continue;
    }
  }

  throw new Error('No suitable runtime mode could be initialized');
}

/**
 * Extended runtime state interface for backward compatibility
 * Note: This is a legacy interface - new code should not depend on close() method
 */
export interface MafRuntimeStateWithCleanup extends MafRuntimeState {
  /** @deprecated Use proper resource management instead of explicit close() */
  close(): void;
}

/**
 * Legacy helper function for backward compatibility
 * @deprecated Use createMafRuntimeState or createSqliteRuntimeState instead
 */
export function createSqliteRuntimeStateWithCleanup(dbPath: string): MafRuntimeStateWithCleanup {
  const runtimeState = createSqliteRuntimeState(dbPath, '.agent-mail');

  return Object.assign(runtimeState, {
    close: () => {
      // Legacy compatibility method - canonical MafRuntimeState does not expose close()
      // Resources are managed automatically; explicit cleanup is not needed
      console.warn('close() method is deprecated. Resources are managed automatically in SQLite runtime.');
    }
  }) as MafRuntimeStateWithCleanup;
}
