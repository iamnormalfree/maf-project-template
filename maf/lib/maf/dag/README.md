# DAG Dependency Validation System

This directory contains the Directed Acyclic Graph (DAG) dependency validation system for MAF (Minimal Agent Framework). It provides sophisticated dependency management, cycle detection, and task ordering capabilities.

## Overview

The DAG system enables MAF to handle complex task dependencies, ensuring that tasks are executed in the correct order while preventing circular dependencies. This is particularly important for coordinating multi-agent workflows and constraint-driven development.

## Core Components

### 1. `dag-dependency-manager.ts`
Core dependency management engine with:
- Task and dependency graph management
- Cycle detection using DFS algorithm
- Topological sorting for execution order
- Dependency validation and statistics
- Cache management for performance

### 2. `dag-schema.ts`
Database schema and persistence layer:
- SQLite table definitions for dependencies
- Database migration and validation utilities
- Dependency caching and query optimization
- Statistics and monitoring queries

### 3. `dag-enhanced-scheduler.ts`
Integration layer with MAF scheduler:
- Dependency-aware task reservation
- Blocking and ready task identification
- Constraint-based task filtering
- Enhanced task selection with dependency context

### 4. `__tests__/`
Comprehensive test suite:
- Unit tests for all components
- Integration tests with SQLite database
- Performance benchmarks
- Edge case validation

## Key Features

### Dependency Types
- **Hard Dependencies**: Must be completed before dependent task can start
- **Soft Dependencies**: Advisory relationships that don't block execution
- **Cross-Constraint Dependencies**: Dependencies between tasks serving different constraints

### Validation Capabilities
- **Cycle Detection**: Identifies and prevents circular dependencies
- **Missing Dependencies**: Detects references to non-existent tasks
- **Orphaned Tasks**: Identifies tasks with no dependencies or dependents
- **Schema Validation**: Ensures database consistency and integrity

### Performance Optimizations
- **Validation Caching**: Caches validation results to avoid redundant computation
- **Topological Sorting**: Efficient O(V+E) algorithm for task ordering
- **Lazy Loading**: Only loads dependencies when needed
- **Database Indexing**: Optimized queries for dependency lookups

## Usage Examples

### Basic Dependency Management

```typescript
import { DAGDependencyManager } from './dag-dependency-manager';

const manager = new DAGDependencyManager();

// Add tasks
manager.addTask({
  id: 'task-1',
  title: 'Database Setup',
  constraint: 'constraint-a',
  priority: 1,
  dependencies: []
});

manager.addTask({
  id: 'task-2',
  title: 'API Implementation',
  constraint: 'constraint-a',
  priority: 2,
  dependencies: [{
    taskId: 'task-2',
    dependsOn: 'task-1',
    dependencyType: 'hard'
  }]
});

// Validate the graph
const validation = manager.validateGraph();
if (validation.isValid) {
  const tasksInOrder = manager.getTasksInDependencyOrder();
  console.log('Execution order:', tasksInOrder.map(t => t.id));
}
```

### Integration with MAF Scheduler

```typescript
import { DAGEnhancedScheduler } from './dag-enhanced-scheduler';

const scheduler = new DAGEnhancedScheduler(database);

// Add dependency-aware task
scheduler.addTaskWithDependencies({
  id: 'auth-endpoint',
  title: 'Authentication API',
  constraint: 'constraint-a',
  priority: 1,
  dependencies: [{
    taskId: 'auth-endpoint',
    dependsOn: 'user-model',
    dependencyType: 'hard'
  }],
  files: ['app/api/auth/route.ts', 'lib/auth/jwt.ts']
});

// Reserve task with dependency validation
const reservation = scheduler.reserveWithDependencies('agent-1');
if (reservation && reservation.canExecute) {
  console.log('Task ready:', reservation.task.title);
} else if (reservation) {
  console.log('Task blocked by:', reservation.blockedBy);
}
```

### Constraint-Based Task Filtering

```typescript
// Get tasks for specific constraint
const constraintTasks = scheduler.getTasksInExecutionOrder('constraint-a');

// Get blocked tasks for analysis
const blockedTasks = scheduler.getBlockedTasks('constraint-a');

// Get ready tasks for immediate execution
const readyTasks = scheduler.getReadyTasks('constraint-a');
```

## Database Schema

### Core Tables

```sql
-- Task dependencies table
CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT CHECK (dependency_type IN ('hard', 'soft')),
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, depends_on_task_id)
);

-- Validation cache table
CREATE TABLE dag_validations (
  id TEXT PRIMARY KEY,
  validation_hash TEXT NOT NULL UNIQUE,
  validation_result TEXT NOT NULL,
  is_valid INTEGER NOT NULL CHECK (is_valid IN (0, 1)),
  cycles_detected INTEGER NOT NULL DEFAULT 0,
  validation_timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

## Performance Considerations

### Graph Complexity
- **Time Complexity**: O(V+E) for validation and sorting
- **Space Complexity**: O(V+E) for graph storage
- **Scalability**: Tested up to 10,000+ tasks

### Optimization Strategies
- Use validation caching for repeated checks
- Leverage database indexes for dependency lookups
- Consider lazy loading for large dependency graphs
- Monitor dependency depth to prevent performance issues

## Integration Points

### Plan-to-Beads Enhancement
The DAG system is integrated with the plan-to-beads workflow:

```yaml
# Plan frontmatter with DAG support
---
constraint: "Constraint A – Public Surfaces Ready"
dependencies_enabled: true
---
```

### MAF Workflow Integration
- **Constraint Alignment**: Respects active constraint boundaries
- **Task State Management**: Integrates with lease management and task states
- **Agent Coordination**: Prevents multiple agents from working on dependent tasks

## Monitoring and Observability

### Dependency Statistics
```typescript
const stats = manager.getStatistics();
console.log(`Total tasks: ${stats.totalTasks}`);
console.log(`Total dependencies: ${stats.totalDependencies}`);
console.log(`Average depth: ${stats.maxDependencyDepth}`);
console.log(`Cyclic components: ${stats.cyclicComponents}`);
```

### Database Health Checks
```typescript
const schemaValidation = DAGSchema.validateSchema(db);
if (!schemaValidation.isValid) {
  console.error('Schema issues:', schemaValidation.errors);
}
```

## Error Handling

### Common Scenarios
1. **Circular Dependencies**: Detected and prevented with clear error messages
2. **Missing Dependencies**: Identified during validation phase
3. **Schema Mismatches**: Handled gracefully with migration support
4. **Performance Issues**: Monitored with depth and complexity checks

### Recovery Strategies
- Automatic cache invalidation on graph changes
- Database transaction rollback on validation failures
- Graceful degradation for complex dependency scenarios

## Testing

### Running Tests
```bash
# Run all DAG tests
npm test -- --testPathPatterns="lib/maf/dag"

# Run specific test suite
npm test -- --testPathPatterns="lib/maf/dag/__tests__/dag-dependency-manager.test.ts"

# Run integration tests
npm test -- --testPathPatterns="lib/maf/dag/__tests__/dag-enhanced-scheduler.test.ts"
```

### Test Coverage
- Unit tests: 90%+ coverage for core components
- Integration tests: Database and scheduler integration
- Performance tests: Large graph handling and validation
- Edge case tests: Cycle detection, missing dependencies, constraint boundaries

## Future Enhancements

### Planned Features
1. **Visual Dependency Graphs**: Graphviz integration for dependency visualization
2. **Performance Monitoring**: Real-time metrics and alerting
3. **Dependency Templates**: Reusable dependency patterns
4. **Cross-System Dependencies**: Integration with external task systems

### Scalability Improvements
1. **Distributed Graph Processing**: For very large dependency graphs
2. **Incremental Validation**: Only validate changed portions of the graph
3. **Parallel Execution**: Identify and exploit parallelizable task patterns

## API Reference

### DAGDependencyManager
```typescript
class DAGDependencyManager {
  addTask(task: DAGTask): void
  removeTask(taskId: string): boolean
  addDependency(taskId: string, dependsOn: string, type: 'hard' | 'soft'): void
  removeDependency(taskId: string, dependsOn: string): boolean
  validateGraph(): DAGValidationResult
  getTasksInDependencyOrder(constraint?: string): DAGTask[]
  getExecutableTasks(): DAGTask[]
  wouldCreateCycle(taskId: string, dependsOn: string): boolean
  getStatistics(): DependencyStatistics
}
```

### DAGEnhancedScheduler
```typescript
class DAGEnhancedScheduler {
  reserveWithDependencies(agentId: string): EnhancedReservationResult | null
  addTaskWithDependencies(task: DependencyAwareTask): boolean
  getTasksInExecutionOrder(constraint?: string): DependencyAwareTask[]
  getReadyTasks(constraint?: string): DependencyAwareTask[]
  getBlockedTasks(constraint?: string): DependencyAwareTask[]
  validateDependencies(): DAGValidationResult
  getDependencyStatus(): DependencyStatus
}
```

---

**Version**: 1.0.0
**Last Updated**: 2025-01-19
**Dependencies**: better-sqlite3, @types/better-sqlite3
**License**: Internal (NextNest Project)