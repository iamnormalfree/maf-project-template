// ABOUTME: Database security wrapper for MAF reservation system
// ABOUTME: Provides secure database access controls and path validation

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export interface DatabaseSecurityConfig {
  allowedPaths: string[];
  maxConnections: number;
  enableAccessLogging: boolean;
  connectionTimeout: number;
}

export class DatabaseSecurityWrapper {
  private readonly config: DatabaseSecurityConfig;
  private readonly connectionPool = new Map<string, InstanceType<typeof Database>>();
  private readonly accessLog: Array<{
    timestamp: number;
    path: string;
    operation: 'connect' | 'query' | 'close';
    success: boolean;
    reason?: string;
  }> = [];

  constructor(config: Partial<DatabaseSecurityConfig> = {}) {
    this.config = {
      allowedPaths: ['/mnt/maf_data/', '/tmp/maf_reservations/', './data/'],
      maxConnections: 10,
      enableAccessLogging: true,
      connectionTimeout: 30000,
      ...config
    };
  }

  async createSecureConnection(dbPath: string): Promise<InstanceType<typeof Database>> {
    const operation = 'connect';
    
    if (!this.isValidDatabasePath(dbPath)) {
      this.logAccess(operation, dbPath, false, 'Invalid database path');
      throw new SecurityError(`Invalid database path: ${dbPath}`);
    }

    if (this.connectionPool.size >= this.config.maxConnections) {
      this.logAccess(operation, dbPath, false, 'Connection pool exhausted');
      throw new SecurityError('Database connection pool exhausted');
    }

    try {
      const db = new Database(dbPath, {
        readonly: false,
        fileMustExist: false,
        timeout: this.config.connectionTimeout
      });

      // Apply security configuration
      this.configureSecureDatabase(db);

      this.connectionPool.set(dbPath, db);
      this.logAccess(operation, dbPath, true);
      
      return db;
    } catch (error) {
      this.logAccess(operation, dbPath, false, error instanceof Error ? error.message : 'Unknown error');
      throw new SecurityError(`Failed to create secure database connection: ${error}`);
    }
  }

  private configureSecureDatabase(db: InstanceType<typeof Database>): void {
    // Enable security-related SQLite pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = memory');
    db.pragma('secure_delete = ON'); // Security enhancement
    db.pragma('auto_vacuum = FULL'); // Prevent data remnant leaks
  }

  private isValidDatabasePath(path: string): boolean {
    // Normalize path to prevent directory traversal
    const normalizedPath = require('path').resolve(path);
    
    return this.config.allowedPaths.some(allowed => {
      const normalizedAllowed = require('path').resolve(allowed);
      return normalizedPath.startsWith(normalizedAllowed);
    });
  }

  async executeSecureQuery(dbPath: string, query: string, params: any[] = []): Promise<any> {
    const operation = 'query';
    
    if (!this.connectionPool.has(dbPath)) {
      this.logAccess(operation, dbPath, false, 'No active database connection');
      throw new SecurityError('No active database connection for path');
    }

    // Basic SQL injection prevention
    if (this.containsSqlInjection(query)) {
      this.logAccess(operation, dbPath, false, 'Potential SQL injection detected');
      throw new SecurityError('Potential SQL injection detected');
    }

    const db = this.connectionPool.get(dbPath)!;
    
    try {
      const result = db.prepare(query).all(...params);
      this.logAccess(operation, dbPath, true);
      return result;
    } catch (error) {
      this.logAccess(operation, dbPath, false, error instanceof Error ? error.message : 'Query failed');
      throw error;
    }
  }

  private containsSqlInjection(query: string): boolean {
    const suspiciousPatterns = [
      /drop\s+table/i,
      /delete\s+from/i,
      /update\s+set/i,
      /insert\s+into/i,
      /exec\s*\(/i,
      /xp_cmdshell/i,
      /--/,
      /\/\*/,
      /\*\//
    ];

    return suspiciousPatterns.some(pattern => pattern.test(query));
  }

  async closeConnection(dbPath: string): Promise<void> {
    const operation = 'close';
    
    const db = this.connectionPool.get(dbPath);
    if (!db) {
      this.logAccess(operation, dbPath, false, 'No active connection to close');
      return;
    }

    try {
      db.close();
      this.connectionPool.delete(dbPath);
      this.logAccess(operation, dbPath, true);
    } catch (error) {
      this.logAccess(operation, dbPath, false, error instanceof Error ? error.message : 'Close failed');
      throw error;
    }
  }

  private logAccess(
    operation: 'connect' | 'query' | 'close',
    path: string,
    success: boolean,
    reason?: string
  ): void {
    if (!this.config.enableAccessLogging) return;

    this.accessLog.push({
      timestamp: Date.now(),
      operation,
      path: this.sanitizePathForLogging(path),
      success,
      reason
    });

    // Keep log size manageable
    if (this.accessLog.length > 1000) {
      this.accessLog.splice(0, 500); // Remove oldest 500 entries
    }
  }

  private sanitizePathForLogging(path: string): string {
    // Remove sensitive path components for security
    return path.replace(/\/(passwords?|secrets?|keys?|tokens?)\//gi, '/***/');
  }

  getAccessLog(): Array<{
    timestamp: number;
    operation: string;
    path: string;
    success: boolean;
    reason?: string;
  }> {
    return [...this.accessLog]; // Return copy to prevent external modification
  }

  getSecurityReport(): {
    totalConnections: number;
    activeConnections: number;
    failedOperations: number;
    securityViolations: number;
    recentActivity: Array<{ timestamp: number; type: string; success: boolean }>;
  } {
    const recentActivity = this.accessLog.slice(-50).map(entry => ({
      timestamp: entry.timestamp,
      type: entry.operation,
      success: entry.success
    }));

    return {
      totalConnections: this.accessLog.filter(e => e.operation === 'connect').length,
      activeConnections: this.connectionPool.size,
      failedOperations: this.accessLog.filter(e => !e.success).length,
      securityViolations: this.accessLog.filter(e => 
        e.reason?.includes('SQL injection') || 
        e.reason?.includes('Invalid path')
      ).length,
      recentActivity
    };
  }

  async emergencyCleanup(): Promise<void> {
    // Close all connections and clear pools
    for (const [path, db] of this.connectionPool.entries()) {
      try {
        db.close();
      } catch (error) {
        console.error(`Failed to close database ${path}:`, error);
      }
    }
    this.connectionPool.clear();
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
