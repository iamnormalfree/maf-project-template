// ABOUTME: Integration tests for DAG enhanced scheduler
// ABOUTME: Tests integration with database schema and dependency-aware task reservation

import Database from 'better-sqlite3';
import { DAGEnhancedScheduler } from '../dag-enhanced-scheduler';
import { DAGSchema } from '../dag-schema';
import { TaskState } from '../../core/state';

describe('DAGEnhancedScheduler Integration', () => {
  let db: Database.Database;
  let scheduler: DAGEnhancedScheduler;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize core tables
    db.prepare(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        "constraint" TEXT,
        "priority" INTEGER DEFAULT 0,
        "state" TEXT DEFAULT 'READY',
        attempts INTEGER DEFAULT 0,
        files TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        data_json TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `).run();

    db.prepare(`
      CREATE TABLE leases (
        task_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        lease_expires_at INTEGER NOT NULL,
        attempt INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `).run();

    // Initialize DAG schema
    DAGSchema.initializeTables(db);

    scheduler = new DAGEnhancedScheduler(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Database Integration', () => {
    test('should initialize schema correctly', () => {
      const schemaValidation = DAGSchema.validateSchema(db);
      expect(schemaValidation.isValid).toBe(true);
      expect(schemaValidation.errors).toHaveLength(0);
    });

    test('should persist dependencies to database', () => {
      // Add both tasks first
      const taskId = 'test-task-1';
      const dependencyTaskId = 'test-task-2';

      db.prepare(`
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(
        taskId, 'Test Task 1', Date.now(), Date.now(),
        dependencyTaskId, 'Test Task 2', Date.now(), Date.now()
      );

      const dependencyAdded = scheduler.addDependency(taskId, dependencyTaskId, 'hard', 'Test dependency');
      expect(dependencyAdded).toBe(true);

      // Verify dependency was saved
      const dependencies = DAGSchema.getTaskDependencies(db, taskId);
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].task_id).toBe(taskId);
      expect(dependencies[0].depends_on_task_id).toBe(dependencyTaskId);
      expect(dependencies[0].dependency_type).toBe('hard');
      expect(dependencies[0].description).toBe('Test dependency');
    });

    test('should remove dependencies from database', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(taskId1, 'Task 1', Date.now(), Date.now(), taskId2, 'Task 2', Date.now(), Date.now());

      // Add dependency
      scheduler.addDependency(taskId1, taskId2, 'soft');

      // Remove dependency
      const removed = scheduler.removeDependency(taskId1, taskId2);
      expect(removed).toBe(true);

      // Verify removal
      const dependencies = DAGSchema.getTaskDependencies(db, taskId1);
      expect(dependencies).toHaveLength(0);
    });
  });

  describe('Task Reservation with Dependencies', () => {
    test('should reserve tasks without dependencies', () => {
      const taskId = 'independent-task';
      db.prepare(`
        INSERT INTO tasks (id, title, "priority", "state", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 'Independent Task', 1, TaskState.READY, Date.now(), Date.now());

      const reservation = scheduler.reserveWithDependencies('agent-1');
      expect(reservation).not.toBeNull();
      expect(reservation!.task.id).toBe(taskId);
      expect(reservation!.canExecute).toBe(true);
      expect(reservation!.blockedBy).toHaveLength(0);
    });

    test('should not reserve tasks with unmet dependencies', () => {
      const taskWithDep = 'task-with-dep';
      const dependencyTask = 'dependency-task';

      // Add both tasks
      db.prepare(`
        INSERT INTO tasks (id, title, "priority", "state", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `).run(
        dependencyTask, 'Dependency Task', 1, TaskState.READY, Date.now(), Date.now(),
        taskWithDep, 'Task With Dependency', 2, TaskState.READY, Date.now(), Date.now()
      );

      // Add dependency
      scheduler.addDependency(taskWithDep, dependencyTask, 'hard');

      const reservation = scheduler.reserveWithDependencies('agent-1');

      // Should get the dependency task first
      expect(reservation).not.toBeNull();
      expect(reservation!.task.id).toBe(dependencyTask);
      expect(reservation!.canExecute).toBe(true);
    });

    test('should detect blocked tasks correctly', () => {
      const dependentTask = 'dependent-task';
      const dependencyTask = 'dependency-task';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, "constraint", "priority", "state", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
      `).run(
        dependencyTask, 'Dependency Task', 'constraint-a', 1, TaskState.READY, Date.now(), Date.now(),
        dependentTask, 'Dependent Task', 'constraint-a', 2, TaskState.READY, Date.now(), Date.now()
      );

      // Add dependency
      scheduler.addDependency(dependentTask, dependencyTask, 'hard');

      const blockedTasks = scheduler.getBlockedTasks('constraint-a');
      expect(blockedTasks).toHaveLength(1);
      expect(blockedTasks[0].id).toBe(dependentTask);
      expect(blockedTasks[0].dependencies).toHaveLength(1);
      expect(blockedTasks[0].dependencies[0].dependsOn).toBe(dependencyTask);
    });

    test('should provide ready tasks correctly', () => {
      const readyTask1 = 'ready-task-1';
      const readyTask2 = 'ready-task-2';
      const blockedTask = 'blocked-task';
      const dependencyTask = 'dependency-task';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, "constraint", "priority", "state", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
      `).run(
        readyTask1, 'Ready Task 1', 'constraint-a', 1, TaskState.READY, Date.now(), Date.now(),
        readyTask2, 'Ready Task 2', 'constraint-a', 2, TaskState.READY, Date.now(), Date.now(),
        blockedTask, 'Blocked Task', 'constraint-a', 3, TaskState.READY, Date.now(), Date.now(),
        dependencyTask, 'Dependency Task', 'constraint-a', 4, TaskState.READY, Date.now(), Date.now()
      );

      // Add dependency
      scheduler.addDependency(blockedTask, dependencyTask, 'hard');

      const readyTasks = scheduler.getReadyTasks('constraint-a');
      expect(readyTasks).toHaveLength(3);
      expect(readyTasks.map(t => t.id).sort()).toEqual([readyTask1, readyTask2, dependencyTask].sort());
    });
  });

  describe('Dependency Validation', () => {
    test('should validate dependency graph', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';
      const taskId3 = 'task-3';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(taskId1, 'Task 1', Date.now(), Date.now(), taskId2, 'Task 2', Date.now(), Date.now(), taskId3, 'Task 3', Date.now(), Date.now());

      // Add valid dependencies
      scheduler.addDependency(taskId2, taskId1, 'hard');
      scheduler.addDependency(taskId3, taskId2, 'hard');

      const validation = scheduler.validateDependencies();
      expect(validation.isValid).toBe(true);
      expect(validation.cycles).toHaveLength(0);
      expect(validation.sortedTasks).toHaveLength(3);
    });

    test('should prevent cycle creation', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(taskId1, 'Task 1', Date.now(), Date.now(), taskId2, 'Task 2', Date.now(), Date.now());

      // Add first dependency
      scheduler.addDependency(taskId2, taskId1, 'hard');

      // Attempt to create cycle
      expect(() => {
        scheduler.addDependency(taskId1, taskId2, 'hard');
      }).toThrow('Adding dependency task-1 -> task-2 would create a cycle');
    });

    test('should handle missing dependencies in validation', () => {
      const taskId = 'task-with-missing-dep';
      const missingTaskId = 'non-existent-task';

      // Add task
      db.prepare(`
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(taskId, 'Task with missing dependency', Date.now(), Date.now());

      // Add the missing task first
      db.prepare(`
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(missingTaskId, 'Non-existent Task', Date.now(), Date.now());

      // Add dependency through scheduler
      scheduler.addDependency(taskId, missingTaskId, 'hard');

      // Now remove the missing task from database to create orphaned dependency
      db.prepare('DELETE FROM tasks WHERE id = ?').run(missingTaskId);

      // Force validation to detect the orphaned dependency
      const validation = scheduler.validateDependencies();
      expect(validation.isValid).toBe(false);
      expect(validation.missingDependencies.length).toBeGreaterThan(0);
    });
  });

  describe('Enhanced pickNextTask', () => {
    test('should include dependency information in task selection', async () => {
      const independentTask = 'independent-task';
      const dependentTask = 'dependent-task';
      const dependencyTask = 'dependency-task';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, "priority", "state", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `).run(
        independentTask, 'Independent Task', 1, TaskState.READY, Date.now(), Date.now(),
        dependencyTask, 'Dependency Task', 2, TaskState.READY, Date.now(), Date.now(),
        dependentTask, 'Dependent Task', 3, TaskState.READY, Date.now(), Date.now()
      );

      // Add dependency
      scheduler.addDependency(dependentTask, dependencyTask, 'hard');

      const nextTask = await scheduler.pickNextTask('agent-1');

      // Should get highest priority executable task
      expect(nextTask).not.toBeNull();
      expect([independentTask, dependencyTask]).toContain(nextTask!.beadId);
      expect(nextTask!.dependencies).toBeDefined();
      expect(nextTask!.blockedBy).toBeDefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide comprehensive dependency status', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';
      const taskId3 = 'task-3';

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, "constraint", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
      `).run(
        taskId1, 'Task 1', 'constraint-a', Date.now(), Date.now(),
        taskId2, 'Task 2', 'constraint-a', Date.now(), Date.now(),
        taskId3, 'Task 3', 'constraint-b', Date.now(), Date.now()
      );

      // Add dependencies
      scheduler.addDependency(taskId2, taskId1, 'hard');
      scheduler.addDependency(taskId3, taskId2, 'soft');

      const status = scheduler.getDependencyStatus();

      expect(status.validation.isValid).toBe(true);
      expect(status.statistics.totalTasks).toBe(3);
      expect(status.statistics.totalDependencies).toBe(2);
      expect(status.statistics.hardDependencies).toBe(1);
      expect(status.statistics.softDependencies).toBe(1);
      expect(status.readyTasks).toBeGreaterThan(0);
      expect(status.totalTasks).toBe(3);
    });

    test('should calculate dependency statistics correctly', () => {
      const dbStats = DAGSchema.getDependencyStatistics(db);

      expect(dbStats.totalDependencies).toBe(0);
      expect(dbStats.hardDependencies).toBe(0);
      expect(dbStats.softDependencies).toBe(0);
      expect(dbStats.tasksWithDependencies).toBe(0);
      expect(dbStats.tasksWithDependents).toBe(0);
      expect(dbStats.orphanedDependencies).toBe(0);
    });
  });

  describe('Cache Management', () => {
    test('should clean validation cache', () => {
      const initialCount = DAGSchema.cleanValidationCache(db, 0);
      expect(initialCount).toBe(0); // No old entries initially

      // Use a fixed timestamp from the past for predictable testing
      const pastTimestamp = Date.now() - 5000; // 5 seconds ago
      
      // Add some cache entries for testing by directly inserting with old timestamp
      db.prepare(`
        INSERT INTO dag_validations (
          id, validation_hash, validation_result, is_valid,
          cycles_detected, validation_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-cache-entry',
        'test-hash-123',
        JSON.stringify({
          isValid: true,
          cycles: [],
          missingDependencies: [],
          orphanedTasks: [],
          sortedTasks: [],
          errors: []
        }),
        1,
        0,
        pastTimestamp,
        pastTimestamp
      );

      // Clean with duration (older than 1 second) should remove the entry
      const cleanedCount = DAGSchema.cleanValidationCache(db, 1000); // 1 second
      expect(cleanedCount).toBe(1);
    });
  });

  describe('Complex Dependency Scenarios', () => {
    test('should handle mixed constraint dependencies', () => {
      const taskA1 = 'task-a1'; // constraint-a
      const taskA2 = 'task-a2'; // constraint-a, depends on task-a1
      const taskB1 = 'task-b1'; // constraint-b
      const taskB2 = 'task-b2'; // constraint-b, depends on task-a2 (cross-constraint)

      // Add tasks
      db.prepare(`
        INSERT INTO tasks (id, title, "constraint", "priority", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `).run(
        taskA1, 'A1', 'constraint-a', 1, Date.now(), Date.now(),
        taskA2, 'A2', 'constraint-a', 2, Date.now(), Date.now(),
        taskB1, 'B1', 'constraint-b', 1, Date.now(), Date.now(),
        taskB2, 'B2', 'constraint-b', 2, Date.now(), Date.now()
      );

      // Add dependencies
      scheduler.addDependency(taskA2, taskA1, 'hard');
      scheduler.addDependency(taskB2, taskA2, 'hard'); // Cross-constraint dependency

      const constraintATasks = scheduler.getTasksInExecutionOrder('constraint-a');
      expect(constraintATasks.map(t => t.id)).toEqual([taskA1, taskA2]);

      const constraintBTasks = scheduler.getTasksInExecutionOrder('constraint-b');
      // taskB1 has no dependencies, taskB2 depends on taskA2 (from constraint-a)
      expect(constraintBTasks.map(t => t.id)).toContain(taskB1);
      expect(constraintBTasks.map(t => t.id)).toContain(taskB2);
    });
  });
});