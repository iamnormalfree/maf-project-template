// ABOUTME: Example usage patterns for the centralized test database utility
// ABOUTME: This file demonstrates how tests should use the new utility

import { createTestDatabaseSetup, createReadyTestDatabase, TestDatabaseHelper } from './test-db-setup';

// Example 1: Basic usage pattern
export function basicTestPattern() {
  const setup = createTestDatabaseSetup();
  const dbPath = '/tmp/test-example-' + Date.now() + '.db';
  
  try {
    // Create test database with production schema
    const db = setup.createTestDatabase(dbPath);
    
    // Use database for testing
    const result = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
    console.log('Tasks count:', result.count);
    
    // Database will be automatically cleaned up in finally block
    
  } finally {
    // Always cleanup after test
    setup.cleanupTestDatabase(dbPath);
  }
}

// Example 2: Convenience function usage
export function conveniencePattern() {
  // One-liner to create ready-to-use database
  const db = createReadyTestDatabase('my-test');
  
  try {
    // Database is ready with production schema
    const insertResult = db.prepare(`
      INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
      VALUES (?, 'READY', 100, ?, ?, ?, 'test')
    `).run('test-task-1', JSON.stringify({type: 'test'}), Date.now(), Date.now());
    
    console.log('Inserted task:', insertResult);
    
  } finally {
    // Note: createReadyTestDatabase doesn't auto-track cleanup
    // You need to manage the database path yourself or use TestDatabaseHelper
    db.close();
  }
}

// Example 3: Helper class usage (recommended for tests)
export async function helperPattern() {
  const helper = new TestDatabaseHelper('/tmp/test-helper-' + Date.now() + '.db');
  
  try {
    // Initialize database
    await helper.initialize();
    
    // Use helper methods
    const taskCount = helper.execute<{ count: number }>('SELECT COUNT(*) as count FROM tasks');
    console.log('Task count:', taskCount.count);
    
    // Transaction support
    const result = helper.transaction(() => {
      const taskId = 'txn-task-' + Date.now();
      helper.execute(`
        INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
        VALUES (?, 'READY', 100, ?, ?, ?, 'test')
      `, taskId, JSON.stringify({type: 'transaction-test'}), Date.now(), Date.now());
      
      return helper.execute<{ id: string }>('SELECT id FROM tasks WHERE id = ?', taskId);
    });
    
    console.log('Transaction result:', result);
    
  } finally {
    // Automatic cleanup - closes database and removes files
    helper.cleanup();
  }
}

// Example 4: Test with beforeEach/afterEach pattern (Jest-like)
export class ExampleTestSuite {
  private db: any;
  private setup: any;
  private dbPath!: string;
  
  beforeEach() {
    this.setup = createTestDatabaseSetup();
    this.dbPath = '/tmp/test-suite-' + Date.now() + '.db';
    this.db = this.setup.createTestDatabase(this.dbPath);
  }
  
  afterEach() {
    if (this.db) {
      this.db.close();
    }
    this.setup.cleanupTestDatabase(this.dbPath);
  }
  
  testExample() {
    // Database is ready with production schema
    const result = this.db.prepare('SELECT name FROM sqlite_master WHERE type="table"').all();
    console.log('Tables:', result);
    
    // Test your logic here
  }
}
