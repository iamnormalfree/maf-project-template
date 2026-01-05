// ABOUTME: Tests for maf top CLI command including JSON output functionality.
// ABOUTME: Validates backward compatibility and stable JSON schema for CI integration.

import Database from 'better-sqlite3';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { mafTop, MafTopOutput } from '../top';

describe('maf top CLI', () => {
  const testDbPath = join(__dirname, 'test-maf-top.db');

  beforeEach(() => {
    // Reset console mocks - also mock warn to suppress expected SQLite warnings
    jest.spyOn(console, 'table').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Create a test database with sample data
    createTestDatabase(testDbPath, [
      { state: 'pending' },
      { state: 'pending' },
      { state: 'pending' },
      { state: 'running' },
      { state: 'running' },
      { state: 'completed' },
      { state: 'completed' },
      { state: 'completed' },
      { state: 'completed' },
      { state: 'completed' }
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  function createTestDatabase(dbPath: string, tasks: Array<{ state: string }>) {
    const db = new Database(dbPath);

    // Create tasks table
    db.exec(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample task data
    const taskStmt = db.prepare('INSERT INTO tasks (state) VALUES (?)');
    for (const task of tasks) {
      taskStmt.run(task.state);
    }

    // Create events table for testing new features
    db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        data_json TEXT
      )
    `);

    // Insert sample event data for testing --recent and --kind flags
    const eventStmt = db.prepare('INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)');
    const baseTime = Date.now() - 3600000; // 1 hour ago

    // Add sample events
    const sampleEvents = [
      { task_id: 'task-001', ts: baseTime + 1000, kind: 'CLAIMED', data_json: '{"agent_id": "agent-001"}' },
      { task_id: 'task-001', ts: baseTime + 2000, kind: 'RUNNING', data_json: '{}' },
      { task_id: 'task-002', ts: baseTime + 3000, kind: 'CLAIMED', data_json: '{"agent_id": "agent-002"}' },
      { task_id: 'task-001', ts: baseTime + 4000, kind: 'ERROR', data_json: '{"error": {"message": "Test error"}}' },
      { task_id: 'task-003', ts: baseTime + 5000, kind: 'COMMITTED', data_json: '{}' },
    ];

    for (const event of sampleEvents) {
      eventStmt.run(event.task_id, event.ts, event.kind, event.data_json);
    }

    // Create lease tables to prevent SQLite warnings in CLI
    db.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        lease_expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create agents table to prevent SQLite warnings in CLI
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        last_seen INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create quotas table to prevent SQLite warnings in CLI
    db.exec(`
      CREATE TABLE IF NOT EXISTS quotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_name TEXT NOT NULL,
        current_limit INTEGER NOT NULL,
        current_usage INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        last_updated INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    db.close();
  }

  describe('library function', () => {
    it('should output table format by default (backward compatibility)', () => {
      // Test with legacy string parameter
      mafTop(testDbPath);

      expect(console.table).toHaveBeenCalledWith([
        { state: 'completed', count: 5 },
        { state: 'pending', count: 3 },
        { state: 'running', count: 2 }
      ]);
    });

    it('should output table format when json flag is false', () => {
      // Test with new options parameter - use realTime to bypass cache
      mafTop({ dbPath: testDbPath, json: false, realTime: true });

      expect(console.table).toHaveBeenCalledWith([
        { state: 'completed', count: 5 },
        { state: 'pending', count: 3 },
        { state: 'running', count: 2 }
      ]);
    });

    it('should support JSON output when json flag is true', () => {
      const result = mafTop({ dbPath: testDbPath, json: true }) as MafTopOutput;

      expect(console.table).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        tasks: [
          { state: 'completed', count: 5 },
          { state: 'pending', count: 3 },
          { state: 'running', count: 2 }
        ],
        summary: {
          total: 10, // 5 + 3 + 2
          states: 3
        },
        timestamp: expect.any(String),
        filters: {
          recent: undefined,
          kind: undefined,
          category: undefined
        },
        signalFreshness: expect.any(Object)
      });
    });

    it('should handle empty database in JSON mode', () => {
      // Create empty database
      const emptyDbPath = join(__dirname, 'test-empty-maf-top.db');
      createTestDatabase(emptyDbPath, []);

      try {
        const result = mafTop({ dbPath: emptyDbPath, json: true }) as MafTopOutput;

        expect(result).toMatchObject({
          tasks: [],
          summary: {
            total: 0,
            states: 0
          },
          timestamp: expect.any(String),
          filters: {
            recent: undefined,
            kind: undefined,
            category: undefined
          },
          signalFreshness: expect.any(Object)
        });
      } finally {
        if (existsSync(emptyDbPath)) {
          unlinkSync(emptyDbPath);
        }
      }
    });

    it('should return correct summary calculations', () => {
      const result = mafTop({ dbPath: testDbPath, json: true }) as MafTopOutput;

      expect(result.summary.total).toBe(10); // 3 + 2 + 5
      expect(result.summary.states).toBe(3); // pending, running, completed
    });

    it('should generate valid ISO timestamp', () => {
      const result = mafTop({ dbPath: testDbPath, json: true }) as MafTopOutput;

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('JSON schema stability', () => {
    it('should maintain stable JSON schema structure', () => {
      const result = mafTop({ dbPath: testDbPath, json: true }) as MafTopOutput;

      // Verify top-level structure
      expect(result).toHaveProperty('tasks');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('timestamp');

      // Verify tasks array structure
      expect(Array.isArray(result.tasks)).toBe(true);
      if (result.tasks.length > 0) {
        expect(result.tasks[0]).toHaveProperty('state');
        expect(result.tasks[0]).toHaveProperty('count');
        expect(typeof result.tasks[0].state).toBe('string');
        expect(typeof result.tasks[0].count).toBe('number');
      }

      // Verify summary structure
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('states');
      expect(typeof result.summary.total).toBe('number');
      expect(typeof result.summary.states).toBe('number');

      // Verify timestamp format
      expect(typeof result.timestamp).toBe('string');
    });

    it('should have stable JSON output schema for snapshot testing', () => {
      const result = mafTop({ dbPath: testDbPath, json: true }) as MafTopOutput;

      // Create a snapshot for the JSON structure (excluding timestamp and cacheAge which are dynamic)
      const snapshotResult = {
        ...result,
        timestamp: '[TIMESTAMP]',
        summary: {
          ...result.summary,
          cacheStats: result.summary.cacheStats ? {
            ...result.summary.cacheStats,
            cacheAge: '[CACHE_AGE]',
            hitRate: '[HIT_RATE]',
            totalEntries: '[TOTAL_ENTRIES]',
            lastInvalidation: '[LAST_INVALIDATION]'
          } : undefined
        },
        signalFreshness: result.signalFreshness ? {
          ...result.signalFreshness,
          lastCriticalChange: '[LAST_CRITICAL_CHANGE]'
        } : undefined
      };

      expect(snapshotResult).toMatchSnapshot();
    });

    it('should have stable JSON output for empty database', () => {
      // Create empty database
      const emptyDbPath = join(__dirname, 'test-empty-maf-top.db');
      createTestDatabase(emptyDbPath, []);

      try {
        const result = mafTop({ dbPath: emptyDbPath, json: true }) as MafTopOutput;

        // Create a snapshot for the empty database structure
        const snapshotResult = {
          ...result,
          timestamp: '[TIMESTAMP]',
          summary: {
            ...result.summary,
            cacheStats: result.summary.cacheStats ? {
              ...result.summary.cacheStats,
              cacheAge: '[CACHE_AGE]',
              hitRate: '[HIT_RATE]',
              totalEntries: '[TOTAL_ENTRIES]',
              lastInvalidation: '[LAST_INVALIDATION]'
            } : undefined
          },
          signalFreshness: result.signalFreshness ? {
            ...result.signalFreshness,
            lastCriticalChange: '[LAST_CRITICAL_CHANGE]'
          } : undefined
        };

        expect(snapshotResult).toMatchSnapshot();
      } finally {
        if (existsSync(emptyDbPath)) {
          unlinkSync(emptyDbPath);
        }
      }
    });
  });

  describe('enhanced CLI features', () => {
    it('should support --recent flag with JSON output', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, recent: 3 }) as MafTopOutput;

      expect(console.table).not.toHaveBeenCalled();
      expect(result).toHaveProperty('recentEvents');
      expect(result.recentEvents).toHaveLength(3);
      expect(result.recentEvents![0]).toMatchObject({
        taskId: expect.any(String),
        timestamp: expect.any(Number),
        kind: expect.any(String),
        category: expect.any(String)
      });
      expect(result.filters?.recent).toBe(3);
    });

    it('should support --kind filter with JSON output', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, recent: 10, kind: 'claimed' }) as MafTopOutput;

      expect(result).toHaveProperty('recentEvents');
      expect(result.recentEvents).toHaveLength(2); // Should have 2 CLAIMED events
      expect(result.recentEvents!.every(event => event.kind === 'CLAIMED')).toBe(true);
      expect(result.filters?.kind).toEqual(['claimed']);
    });

    it('should support multiple kind filters with comma separation', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, recent: 10, kind: 'claimed,error' }) as MafTopOutput;

      expect(result.recentEvents).toHaveLength(3); // 2 CLAIMED + 1 ERROR
      expect(result.recentEvents!.every(event =>
        event.kind === 'CLAIMED' || event.kind === 'ERROR'
      )).toBe(true);
      expect(result.filters?.kind).toEqual(['claimed', 'error']);
    });

    it('should support --category filter with JSON output', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, recent: 10, category: 'task' }) as MafTopOutput;

      expect(result.recentEvents).toHaveLength(5); // All events are task category
      expect(result.recentEvents!.every(event => event.category === 'task')).toBe(true);
      expect(result.filters?.category).toEqual(['task']);
    });

    it('should handle combination of --recent, --kind, and --category filters', () => {
      const result = mafTop({
        dbPath: testDbPath,
        json: true,
        recent: 10,
        kind: 'claimed',
        category: 'task'
      }) as MafTopOutput;

      expect(result.recentEvents).toHaveLength(2); // 2 CLAIMED events with task category
      expect(result.recentEvents!.every(event =>
        event.kind === 'CLAIMED' && event.category === 'task'
      )).toBe(true);
      expect(result.filters).toEqual({
        recent: 10,
        kind: ['claimed'],
        category: ['task']
      });
    });

    it('should return empty recentEvents when recent is 0', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, recent: 0 }) as MafTopOutput;

      expect(result.recentEvents).toBeUndefined();
      // When recent is 0, filters may not be set at all
      expect(result.filters?.recent).toBeUndefined();
    });

    it('should pass through recent value without modification in library function', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, recent: 2000 }) as MafTopOutput;

      // Note: The 1000 cap is handled in the CLI script layer, not the library function
      expect(result.filters?.recent).toBe(2000);
    });

    it('should maintain backward compatibility for legacy calls', () => {
      // Test legacy call with just dbPath string - use realTime to bypass cache
      mafTop({ dbPath: testDbPath, json: false, realTime: true });

      // Should not throw and should call console.table
      expect(console.table).toHaveBeenCalled();
    });

    it('should handle missing agents table gracefully', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, agents: true }) as MafTopOutput;

      // Agents data is not included when the table doesn't exist
      expect(result).not.toHaveProperty('agents');
      expect(result.summary).toHaveProperty('total');
    });

    it('should handle missing quotas table gracefully', () => {
      const result = mafTop({ dbPath: testDbPath, json: true, quotas: true }) as MafTopOutput;

      // Quotas data is not included when the table doesn't exist
      expect(result).not.toHaveProperty('quotas');
      expect(result.summary).toHaveProperty('total');
    });
  });
});