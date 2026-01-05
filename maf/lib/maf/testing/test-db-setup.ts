// ABOUTME: Centralized test database utility providing consistent schema and isolation for MAF tests
// ABOUTME: Uses production canonical schema with unique database paths and proper foreign key constraints

import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Use dynamic require to match existing MAF patterns
function loadDatabaseModule() {
  try {
    const sqliteModule = require('better-sqlite3');
    return sqliteModule.default || sqliteModule;
  } catch (error) {
    if ((error as any).code === 'MODULE_NOT_FOUND') {
      throw new Error(`better-sqlite3 module not found. Install with: npm install better-sqlite3`);
    }
    throw error;
  }
}

export interface TestDatabaseSetup {
  /**
   * Creates a new SQLite database with production canonical schema
   * @param dbPath - Unique path for the test database file
   * @returns Configured Database instance with PRAGMA settings
   */
  createTestDatabase(dbPath: string): any;
  
  /**
   * Sets up database schema using canonical production schema
   * @param db - Database instance to configure
   */
  setupDatabaseWithSchema(db: any): void;
  
  /**
   * Cleans up test database file safely
   * @param dbPath - Path to the database file to remove
   */
  cleanupTestDatabase(dbPath: string): void;
}

/**
 * Test database implementation using production canonical schema
 */
class TestDatabaseSetupImpl implements TestDatabaseSetup {
  private Database: any;

  constructor() {
    this.Database = loadDatabaseModule();
  }

  /**
   * Creates a new SQLite database with production safety settings
   */
  createTestDatabase(dbPath: string): any {
    if (!dbPath || typeof dbPath !== 'string') {
      throw new Error('Database path must be a non-empty string');
    }

    // Ensure parent directory exists
    const parentDir = join(dbPath, '..');
    if (!existsSync(parentDir)) {
      const { mkdirSync } = require('fs');
      mkdirSync(parentDir, { recursive: true });
    }

    try {
      // Initialize database with production safety settings (matches runtime-factory.ts)
      const db = new this.Database(dbPath, {
        readonly: false,
        fileMustExist: false,
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
      });

      // Configure for production safety and performance (matches runtime-factory.ts)
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = 10000');
      db.pragma('temp_store = memory');
      db.pragma('mmap_size = 268435456'); // 256MB

      this.setupDatabaseWithSchema(db);

      return db;
    } catch (error) {
      throw new Error(`Failed to create test database at ${dbPath}: ${error}`);
    }
  }

  /**
   * Loads canonical schema with performance optimizations
   * This mirrors the loadCanonicalSchema function from runtime-factory.ts
   */
  setupDatabaseWithSchema(db: any): void {
    try {
      // Load canonical schema (same as production)
      const baseSchemaPath = join(__dirname, '..', 'store', 'schema.sql');
      const canonicalSchema = readFileSync(baseSchemaPath, 'utf8');
      db.exec(canonicalSchema);
      console.log('Applied canonical schema to test database');

      // Add performance indexes for tests (matches runtime-factory.ts)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_synthetic_file ON tasks(id, state) WHERE id LIKE 'file_%';
        CREATE INDEX IF NOT EXISTS idx_events_synthetic_tasks ON events(task_id, ts) WHERE task_id LIKE 'file_%';
        CREATE INDEX IF NOT EXISTS idx_leases_expiration ON leases(lease_expires_at);
        CREATE INDEX IF NOT EXISTS idx_events_task_ts ON events(task_id, ts);
        CREATE INDEX IF NOT EXISTS idx_tasks_state_priority ON tasks(state, priority DESC, created_at);
      `);
      console.log('Added test performance indexes');

    } catch (error) {
      console.error('Failed to load canonical schema:', error);
      throw new Error(`Test schema loading failed: ${error}`);
    }
  }

  /**
   * Safely removes test database file and associated WAL files
   */
  cleanupTestDatabase(dbPath: string): void {
    if (!dbPath || typeof dbPath !== 'string') {
      return;
    }

    try {
      // Remove main database file
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
        console.log(`Cleaned up test database: ${dbPath}`);
      }

      // Remove WAL files (WAL mode creates separate files)
      const walPath = `${dbPath}-wal`;
      if (existsSync(walPath)) {
        unlinkSync(walPath);
        console.log(`Cleaned up test database WAL: ${walPath}`);
      }

      // Remove SHM files (shared memory for WAL mode)
      const shmPath = `${dbPath}-shm`;
      if (existsSync(shmPath)) {
        unlinkSync(shmPath);
        console.log(`Cleaned up test database SHM: ${shmPath}`);
      }

    } catch (error) {
      console.warn(`Failed to cleanup test database ${dbPath}:`, error);
      // Don't throw - cleanup failures shouldn't fail tests
    }
  }
}

/**
 * Factory function to create test database setup instance
 * Returns a singleton to ensure consistent behavior across tests
 */
let instance: TestDatabaseSetup | null = null;

export function createTestDatabaseSetup(): TestDatabaseSetup {
  if (!instance) {
    instance = new TestDatabaseSetupImpl();
  }
  return instance;
}

/**
 * Convenience function to create a ready-to-use test database
 * Combines database creation and schema setup in one call
 * 
 * @param uniqueName - Unique identifier for the test database
 * @param basePath - Base directory for test databases (optional, defaults to temp)
 * @returns Configured Database instance
 */
export function createReadyTestDatabase(uniqueName: string, basePath?: string): any {
  const setup = createTestDatabaseSetup();
  
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const baseDir = basePath || join(process.cwd(), 'test-temp');
  const dbPath = join(baseDir, `test-${uniqueName}-${timestamp}-${randomSuffix}.db`);

  return setup.createTestDatabase(dbPath);
}

/**
 * Utility to generate unique test database paths
 * 
 * @param testName - Name of the test for identification
 * @param basePath - Base directory for test databases (optional)
 * @returns Unique database file path
 */
export function generateTestDbPath(testName: string, basePath?: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const baseDir = basePath || join(process.cwd(), 'test-temp');
  return join(baseDir, `test-${testName}-${timestamp}-${randomSuffix}.db`);
}

/**
 * Test database helper for common test patterns
 */
export class TestDatabaseHelper {
  private db: any;
  private dbPath: string;
  private setup: TestDatabaseSetup;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.setup = createTestDatabaseSetup();
  }

  /**
   * Initialize the test database
   */
  async initialize(): Promise<void> {
    this.db = this.setup.createTestDatabase(this.dbPath);
  }

  /**
   * Get the database instance
   */
  getDatabase(): any {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a prepared statement with error handling
   */
  execute<T = any>(sql: string, ...params: any[]): T {
    const db = this.getDatabase();
    try {
      const stmt = db.prepare(sql);
      if (sql.trim().toLowerCase().startsWith('select')) {
        return stmt.all(...params) as T;
      } else {
        return stmt.run(...params) as T;
      }
    } catch (error) {
      throw new Error(`Failed to execute SQL "${sql}": ${error}`);
    }
  }

  /**
   * Execute multiple statements in a transaction
   */
  transaction<T>(fn: () => T): T {
    const db = this.getDatabase();
    try {
      return db.transaction(fn)();
    } catch (error) {
      throw new Error(`Transaction failed: ${error}`);
    }
  }

  /**
   * Cleanup database resources
   */
  cleanup(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.warn('Failed to close database:', error);
      }
      this.db = null;
    }
    
    this.setup.cleanupTestDatabase(this.dbPath);
  }

  /**
   * Get database path for reference
   */
  getPath(): string {
    return this.dbPath;
  }
}

// Export default instance for convenience
export default createTestDatabaseSetup();
