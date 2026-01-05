// ABOUTME: Database schema extensions for DAG dependency validation in MAF
// ABOUTME: Provides SQLite schema definitions and migration utilities

export interface TaskDependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'hard' | 'soft';
  description?: string;
  created_at: number;
  updated_at: number;
  metadata?: string; // JSON string
}

export interface DAGValidationRow {
  id: string;
  validation_hash: string;
  validation_result: string; // JSON string
  is_valid: boolean;
  cycles_detected: number;
  validation_timestamp: number;
  created_at: number;
}

/**
 * DAG schema manager for database operations
 */
export class DAGSchema {
  /**
   * Initialize DAG dependency tables in the database
   */
  static initializeTables(db: any): void {
    // Create task_dependencies table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        dependency_type TEXT NOT NULL CHECK (dependency_type IN ('hard', 'soft')),
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, depends_on_task_id)
      )
    `).run();

    // Create indexes for performance
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id
      ON task_dependencies(task_id)
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on
      ON task_dependencies(depends_on_task_id)
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_type
      ON task_dependencies(dependency_type)
    `).run();

    // Create dag_validations table for caching validation results
    db.prepare(`
      CREATE TABLE IF NOT EXISTS dag_validations (
        id TEXT PRIMARY KEY,
        validation_hash TEXT NOT NULL UNIQUE,
        validation_result TEXT NOT NULL,
        is_valid INTEGER NOT NULL CHECK (is_valid IN (0, 1)),
        cycles_detected INTEGER NOT NULL DEFAULT 0,
        validation_timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_dag_validations_hash
      ON dag_validations(validation_hash)
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_dag_validations_timestamp
      ON dag_validations(validation_timestamp)
    `).run();

    // Create triggers for automatic timestamp updates
    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS update_task_dependencies_timestamp
      AFTER UPDATE ON task_dependencies
      BEGIN
        UPDATE task_dependencies
        SET updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.id;
      END
    `).run();
  }

  /**
   * Insert a task dependency
   */
  static insertDependency(db: any, dependency: Omit<TaskDependencyRow, 'id' | 'created_at' | 'updated_at'>): string {
    const id = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    db.prepare(`
      INSERT INTO task_dependencies (
        id, task_id, depends_on_task_id, dependency_type,
        description, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      dependency.task_id,
      dependency.depends_on_task_id,
      dependency.dependency_type,
      dependency.description || null,
      now,
      now,
      dependency.metadata ? JSON.stringify(dependency.metadata) : null
    );

    return id;
  }

  /**
   * Update a task dependency
   */
  static updateDependency(db: any, id: string, updates: Partial<TaskDependencyRow>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.dependency_type !== undefined) {
      fields.push('dependency_type = ?');
      values.push(updates.dependency_type);
    }

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (fields.length === 0) {
      return false;
    }

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const result = db.prepare(`
      UPDATE task_dependencies
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  }

  /**
   * Delete a task dependency
   */
  static deleteDependency(db: any, taskId: string, dependsOnTaskId: string): boolean {
    const result = db.prepare(`
      DELETE FROM task_dependencies
      WHERE task_id = ? AND depends_on_task_id = ?
    `).run(taskId, dependsOnTaskId);

    return result.changes > 0;
  }

  /**
   * Get all dependencies for a task
   */
  static getTaskDependencies(db: any, taskId: string): TaskDependencyRow[] {
    return db.prepare(`
      SELECT * FROM task_dependencies
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId).map(this.mapRowToDependency);
  }

  /**
   * Get all tasks that depend on a given task
   */
  static getDependents(db: any, taskId: string): TaskDependencyRow[] {
    return db.prepare(`
      SELECT * FROM task_dependencies
      WHERE depends_on_task_id = ?
      ORDER BY created_at ASC
    `).all(taskId).map(this.mapRowToDependency);
  }

  /**
   * Get all dependencies in the system
   */
  static getAllDependencies(db: any): TaskDependencyRow[] {
    return db.prepare(`
      SELECT * FROM task_dependencies
      ORDER BY created_at ASC
    `).all().map(this.mapRowToDependency);
  }

  /**
   * Check if a dependency exists
   */
  static dependencyExists(db: any, taskId: string, dependsOnTaskId: string): boolean {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM task_dependencies
      WHERE task_id = ? AND depends_on_task_id = ?
    `).get(taskId, dependsOnTaskId);

    return result.count > 0;
  }

  /**
   * Store validation result in cache
   */
  static cacheValidationResult(db: any, validationHash: string, validationResult: any): void {
    const id = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    db.prepare(`
      INSERT OR REPLACE INTO dag_validations (
        id, validation_hash, validation_result, is_valid,
        cycles_detected, validation_timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      validationHash,
      JSON.stringify(validationResult),
      validationResult.isValid ? 1 : 0,
      validationResult.cycles?.length || 0,
      now,
      now
    );
  }

  /**
   * Get cached validation result
   */
  static getCachedValidation(db: any, validationHash: string): any | null {
    const result = db.prepare(`
      SELECT validation_result FROM dag_validations
      WHERE validation_hash = ?
      ORDER BY validation_timestamp DESC
      LIMIT 1
    `).get(validationHash);

    return result ? JSON.parse(result.validation_result) : null;
  }

  /**
   * Clean old validation cache entries
   */
  static cleanValidationCache(db: any, olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - olderThanMs;

    const result = db.prepare(`
      DELETE FROM dag_validations
      WHERE validation_timestamp < ?
    `).run(cutoffTime);

    return result.changes;
  }

  /**
   * Get dependency statistics for monitoring
   */
  static getDependencyStatistics(db: any): {
    totalDependencies: number;
    hardDependencies: number;
    softDependencies: number;
    tasksWithDependencies: number;
    tasksWithDependents: number;
    orphanedDependencies: number;
    totalTasks: number;
  } {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_dependencies,
        COUNT(CASE WHEN dependency_type = 'hard' THEN 1 END) as hard_dependencies,
        COUNT(CASE WHEN dependency_type = 'soft' THEN 1 END) as soft_dependencies,
        COUNT(DISTINCT task_id) as tasks_with_dependencies,
        COUNT(DISTINCT depends_on_task_id) as tasks_with_dependents
      FROM task_dependencies
    `).get();

    // Calculate orphaned dependencies (dependencies on non-existent tasks)
    const orphaned = db.prepare(`
      SELECT COUNT(*) as count FROM task_dependencies td
      LEFT JOIN tasks t ON td.depends_on_task_id = t.id
      WHERE t.id IS NULL
    `).get();

    // Get total task count
    const totalTasksCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get();

    return {
      totalDependencies: stats.total_dependencies || 0,
      hardDependencies: stats.hard_dependencies || 0,
      softDependencies: stats.soft_dependencies || 0,
      tasksWithDependencies: stats.tasks_with_dependencies || 0,
      tasksWithDependents: stats.tasks_with_dependents || 0,
      orphanedDependencies: orphaned.count || 0,
      totalTasks: totalTasksCount.count || 0
    };
  }

  /**
   * Validate database schema consistency
   */
  static validateSchema(db: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Check if tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN ('task_dependencies', 'dag_validations')
      `).all();

      const tableNames = tables.map((t: any) => t.name);

      if (!tableNames.includes('task_dependencies')) {
        errors.push('Missing task_dependencies table');
      }

      if (!tableNames.includes('dag_validations')) {
        errors.push('Missing dag_validations table');
      }

      // Check foreign key constraints
      if (tableNames.includes('task_dependencies')) {
        const invalidDeps = db.prepare(`
          SELECT COUNT(*) as count FROM task_dependencies td
          LEFT JOIN tasks t ON td.task_id = t.id
          WHERE t.id IS NULL
        `).get();

        if (invalidDeps.count > 0) {
          errors.push(`${invalidDeps.count} dependencies reference non-existent tasks`);
        }
      }

    } catch (error) {
      errors.push(`Schema validation error: ${error}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a hash of the current dependency state for caching
   */
  static createDependencyHash(dependencies: TaskDependencyRow[]): string {
    const sortedDeps = dependencies
      .map(dep => `${dep.task_id}->${dep.depends_on_task_id}:${dep.dependency_type}`)
      .sort()
      .join('|');

    // Simple hash function (in production, use crypto)
    let hash = 0;
    for (let i = 0; i < sortedDeps.length; i++) {
      const char = sortedDeps.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  // Helper method to map database rows to TaskDependencyRow
  private static mapRowToDependency(row: any): TaskDependencyRow {
    return {
      id: row.id,
      task_id: row.task_id,
      depends_on_task_id: row.depends_on_task_id,
      dependency_type: row.dependency_type,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}