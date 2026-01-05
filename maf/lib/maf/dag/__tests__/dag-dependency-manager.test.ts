// ABOUTME: Comprehensive tests for DAG dependency manager
// ABOUTME: Tests core functionality, cycle detection, and topological sorting

import { DAGDependencyManager, DAGTask, TaskDependency } from '../dag-dependency-manager';

describe('DAGDependencyManager', () => {
  let manager: DAGDependencyManager;

  beforeEach(() => {
    manager = new DAGDependencyManager();
  });

  describe('Basic Operations', () => {
    test('should add tasks successfully', () => {
      const task: DAGTask = {
        id: 'task-1',
        title: 'Test Task 1',
        description: 'A test task',
        constraint: 'constraint-a',
        priority: 1,
        dependencies: []
      };

      manager.addTask(task);

      expect(manager.getStatistics().totalTasks).toBe(1);
    });

    test('should remove tasks successfully', () => {
      const task: DAGTask = {
        id: 'task-1',
        title: 'Test Task 1',
        description: 'A test task',
        priority: 1,
        dependencies: []
      };

      manager.addTask(task);
      const removed = manager.removeTask('task-1');

      expect(removed).toBe(true);
      expect(manager.getStatistics().totalTasks).toBe(0);
    });

    test('should return false when removing non-existent task', () => {
      const removed = manager.removeTask('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Dependency Management', () => {
    test('should add simple dependencies', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: []
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addDependency('task-2', 'task-1');

      const stats = manager.getStatistics();
      expect(stats.totalDependencies).toBe(1);
      expect(stats.maxDependencyDepth).toBe(2);
    });

    test('should remove dependencies', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: []
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addDependency('task-2', 'task-1');

      const removed = manager.removeDependency('task-2', 'task-1');
      expect(removed).toBe(true);
      expect(manager.getStatistics().totalDependencies).toBe(0);
    });

    test('should throw error when adding dependency to non-existent task', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      manager.addTask(task1);

      expect(() => {
        manager.addDependency('task-1', 'non-existent');
      }).toThrow('Cannot add dependency: missing task(s)');
    });

    test('should add dependencies through task definition', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'task-1',
          dependencyType: 'hard',
          description: 'Task 2 depends on Task 1'
        }]
      };

      manager.addTask(task1);
      manager.addTask(task2);

      const stats = manager.getStatistics();
      expect(stats.totalDependencies).toBe(1);
    });
  });

  describe('Graph Validation', () => {
    test('should validate simple acyclic graph', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'task-1',
          dependencyType: 'hard'
        }]
      };

      const task3: DAGTask = {
        id: 'task-3',
        title: 'Task 3',
        priority: 3,
        dependencies: [{
          taskId: 'task-3',
          dependsOn: 'task-2',
          dependencyType: 'hard'
        }]
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addTask(task3);

      const validation = manager.validateGraph();
      expect(validation.isValid).toBe(true);
      expect(validation.cycles).toHaveLength(0);
      expect(validation.sortedTasks).toHaveLength(3);
      expect(validation.sortedTasks[0].id).toBe('task-1');
      expect(validation.sortedTasks[1].id).toBe('task-2');
      expect(validation.sortedTasks[2].id).toBe('task-3');
    });

    test('should detect simple cycles', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: []
      };

      manager.addTask(task1);
      manager.addTask(task2);

      // Create cycle by adding dependencies
      manager.addDependency('task-1', 'task-2', 'hard');
      manager.addDependency('task-2', 'task-1', 'hard');

      const validation = manager.validateGraph();
      expect(validation.isValid).toBe(false);
      expect(validation.cycles.length).toBeGreaterThan(0);
      expect(validation.errors).toContain('Found 1 cycle(s) in dependency graph');
    });

    test('should detect missing dependencies', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      manager.addTask(task1);

      // Add dependency to non-existent task
      try {
        manager.addDependency('task-1', 'missing-task', 'hard');
      } catch (error) {
        // Expected to throw, but let's check error handling
        expect(error).toBeInstanceOf(Error);
      }

      // For testing missing dependencies, we need to manually add one that bypasses validation
      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'non-existent-task',
          dependencyType: 'hard'
        }]
      };

      manager.addTask(task2);

      const validation = manager.validateGraph();
      expect(validation.isValid).toBe(false);
      expect(validation.missingDependencies).toContain('task-2 depends on missing task non-existent-task');
    });

    test('should identify orphaned tasks', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Orphaned Task',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Connected Task',
        priority: 2,
        dependencies: []
      };

      const task3: DAGTask = {
        id: 'task-3',
        title: 'Dependent Task',
        priority: 3,
        dependencies: [{
          taskId: 'task-3',
          dependsOn: 'task-2',
          dependencyType: 'hard'
        }]
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addTask(task3);

      const validation = manager.validateGraph();
      expect(validation.orphanedTasks).toContain('task-1');
      expect(validation.orphanedTasks).not.toContain('task-2');
      expect(validation.orphanedTasks).not.toContain('task-3');
    });
  });

  describe('Cycle Prediction', () => {
    test('should predict cycles correctly', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: []
      };

      manager.addTask(task1);
      manager.addTask(task2);

      // Create initial dependency
      manager.addDependency('task-2', 'task-1', 'hard');

      // This would create a cycle (task-1 -> task-2 would complete the cycle)
      const wouldCreateCycle = manager.wouldCreateCycle('task-1', 'task-2');
      expect(wouldCreateCycle).toBe(true);

      // This would not create a cycle
      const task3: DAGTask = {
        id: 'task-3',
        title: 'Task 3',
        priority: 3,
        dependencies: []
      };

      manager.addTask(task3);
      const wouldNotCreateCycle = manager.wouldCreateCycle('task-3', 'task-1');
      expect(wouldNotCreateCycle).toBe(false);
    });

    test('should detect self-dependency as cycle', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      manager.addTask(task1);

      const wouldCreateCycle = manager.wouldCreateCycle('task-1', 'task-1');
      expect(wouldCreateCycle).toBe(true);
    });
  });

  describe('Task Execution Order', () => {
    test('should return tasks in dependency order', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Database Setup',
        constraint: 'constraint-a',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'API Implementation',
        constraint: 'constraint-a',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'task-1',
          dependencyType: 'hard'
        }]
      };

      const task3: DAGTask = {
        id: 'task-3',
        title: 'Frontend Integration',
        constraint: 'constraint-a',
        priority: 3,
        dependencies: [{
          taskId: 'task-3',
          dependsOn: 'task-2',
          dependencyType: 'hard'
        }]
      };

      const task4: DAGTask = {
        id: 'task-4',
        title: 'Documentation',
        constraint: 'constraint-b',
        priority: 0, // Lower priority = should come first among independent tasks
        dependencies: []
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addTask(task3);
      manager.addTask(task4);

      const allTasks = manager.getTasksInDependencyOrder();
      expect(allTasks).toHaveLength(4);

      // task-1 (priority 1) and task-4 (priority 0) are independent, should come first
      // task-4 has lower priority (0) so it should come before task-1 (priority 1)
      expect(allTasks[0].id).toBe('task-4'); // priority 0, no dependencies
      expect(allTasks[1].id).toBe('task-1'); // priority 1, no dependencies
      expect(allTasks[2].id).toBe('task-2'); // depends on task-1, priority 2
      expect(allTasks[3].id).toBe('task-3'); // depends on task-2, priority 3

      const constraintATasks = manager.getTasksInDependencyOrder('constraint-a');
      expect(constraintATasks).toHaveLength(3);
      expect(constraintATasks[0].id).toBe('task-1');
      expect(constraintATasks[1].id).toBe('task-2');
      expect(constraintATasks[2].id).toBe('task-3');
    });

    test('should return executable tasks', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'task-1',
          dependencyType: 'hard'
        }]
      };

      const task3: DAGTask = {
        id: 'task-3',
        title: 'Task 3',
        priority: 3,
        dependencies: []
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addTask(task3);

      const executableTasks = manager.getExecutableTasks();
      expect(executableTasks).toHaveLength(2);
      expect(executableTasks.map(t => t.id).sort()).toEqual(['task-1', 'task-3'].sort());
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should calculate statistics correctly', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'task-1',
          dependencyType: 'hard'
        }]
      };

      const task3: DAGTask = {
        id: 'task-3',
        title: 'Task 3',
        priority: 3,
        dependencies: [{
          taskId: 'task-3',
          dependsOn: 'task-2',
          dependencyType: 'soft'
        }]
      };

      manager.addTask(task1);
      manager.addTask(task2);
      manager.addTask(task3);

      const stats = manager.getStatistics();
      expect(stats.totalTasks).toBe(3);
      expect(stats.totalDependencies).toBe(2);
      expect(stats.averageDependenciesPerTask).toBe(2/3);
      expect(stats.maxDependencyDepth).toBe(3);
      expect(stats.cyclicComponents).toBe(0);
    });

    test('should clear graph completely', () => {
      const task1: DAGTask = {
        id: 'task-1',
        title: 'Task 1',
        priority: 1,
        dependencies: []
      };

      const task2: DAGTask = {
        id: 'task-2',
        title: 'Task 2',
        priority: 2,
        dependencies: [{
          taskId: 'task-2',
          dependsOn: 'task-1',
          dependencyType: 'hard'
        }]
      };

      manager.addTask(task1);
      manager.addTask(task2);

      expect(manager.getStatistics().totalTasks).toBe(2);
      expect(manager.getStatistics().totalDependencies).toBe(1);

      manager.clear();

      expect(manager.getStatistics().totalTasks).toBe(0);
      expect(manager.getStatistics().totalDependencies).toBe(0);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle diamond dependency pattern', () => {
      // A -> B and A -> C, B -> D, C -> D
      const taskA: DAGTask = {
        id: 'task-A',
        title: 'Task A',
        priority: 1,
        dependencies: []
      };

      const taskB: DAGTask = {
        id: 'task-B',
        title: 'Task B',
        priority: 2,
        dependencies: [{
          taskId: 'task-B',
          dependsOn: 'task-A',
          dependencyType: 'hard'
        }]
      };

      const taskC: DAGTask = {
        id: 'task-C',
        title: 'Task C',
        priority: 3,
        dependencies: [{
          taskId: 'task-C',
          dependsOn: 'task-A',
          dependencyType: 'hard'
        }]
      };

      const taskD: DAGTask = {
        id: 'task-D',
        title: 'Task D',
        priority: 4,
        dependencies: [
          {
            taskId: 'task-D',
            dependsOn: 'task-B',
            dependencyType: 'hard'
          },
          {
            taskId: 'task-D',
            dependsOn: 'task-C',
            dependencyType: 'hard'
          }
        ]
      };

      manager.addTask(taskA);
      manager.addTask(taskB);
      manager.addTask(taskC);
      manager.addTask(taskD);

      const validation = manager.validateGraph();
      expect(validation.isValid).toBe(true);

      const sortedTasks = manager.getTasksInDependencyOrder();
      expect(sortedTasks[0].id).toBe('task-A');
      expect(sortedTasks[3].id).toBe('task-D');
      // B and C can be in either order
      expect(['task-B', 'task-C']).toContain(sortedTasks[1].id);
      expect(['task-B', 'task-C']).toContain(sortedTasks[2].id);
    });

    test('should handle multiple independent chains', () => {
      // Chain 1: A -> B -> C
      // Chain 2: D -> E -> F
      const tasks: DAGTask[] = [
        { id: 'task-A', title: 'A', priority: 1, dependencies: [] },
        { id: 'task-B', title: 'B', priority: 2, dependencies: [{ taskId: 'task-B', dependsOn: 'task-A', dependencyType: 'hard' }] },
        { id: 'task-C', title: 'C', priority: 3, dependencies: [{ taskId: 'task-C', dependsOn: 'task-B', dependencyType: 'hard' }] },
        { id: 'task-D', title: 'D', priority: 4, dependencies: [] },
        { id: 'task-E', title: 'E', priority: 5, dependencies: [{ taskId: 'task-E', dependsOn: 'task-D', dependencyType: 'hard' }] },
        { id: 'task-F', title: 'F', priority: 6, dependencies: [{ taskId: 'task-F', dependsOn: 'task-E', dependencyType: 'hard' }] }
      ];

      tasks.forEach(task => manager.addTask(task));

      const validation = manager.validateGraph();
      expect(validation.isValid).toBe(true);

      const sortedTasks = manager.getTasksInDependencyOrder();
      expect(sortedTasks).toHaveLength(6);

      // Verify order constraints
      const orderMap = new Map(sortedTasks.map((task, index) => [task.id, index]));
      expect(orderMap.get('task-A')).toBeLessThan(orderMap.get('task-B'));
      expect(orderMap.get('task-B')).toBeLessThan(orderMap.get('task-C'));
      expect(orderMap.get('task-D')).toBeLessThan(orderMap.get('task-E'));
      expect(orderMap.get('task-E')).toBeLessThan(orderMap.get('task-F'));
    });
  });
});