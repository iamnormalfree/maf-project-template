# MAF Preflight System - Usage Guide

## Overview

The MAF Agent-Mail preflight system provides a comprehensive framework for running pre-flight checks, managing reservations, handling escalations, and coordinating multi-agent workflows. This guide covers the implementation and usage of the SQLite runtime factory foundation.

## Architecture

### Core Components

1. **SQLite Runtime Factory** (`runtime-sqlite.ts`)
   - Database-backed state management
   - Transaction support with retry logic
   - Automatic fallback to JSON runtime
   - Migration system for schema updates

2. **Extended Schema** (`store/schema-preflight.sql`)
   - Preflight configurations and executions
   - Escalation paths and tracking
   - Smoke test definitions
   - Agent registry and reservation conflicts

3. **Protocol Extensions** (`core/protocols.ts`)
   - New message types for preflight communication
   - Validation schemas for all interfaces
   - Support for escalation workflows

4. **Configuration Management** (`config/preflight.ts`)
   - JSON schema validation
   - Environment-specific overrides
   - Versioning and migration support

## Getting Started

### 1. Runtime State Initialization

```typescript
import { createRuntimeFactory } from './runtime-sqlite';

// Environment-based initialization
const runtimeState = createRuntimeFactory();

// Or specify database path explicitly
const runtimeState = createRuntimeFactory('./path/to/runtime.db');

// With fallback to JSON mode
process.env.MAF_RUNTIME_MODE = 'sqlite,json';
const runtimeState = createRuntimeFactory();
```

### 2. Configuration Setup

```typescript
import { PreflightConfigManager } from './config/preflight';

const configManager = new PreflightConfigManager();

// Create a smoke test configuration
const smokeTestConfig = {
  id: 'api-health-check',
  name: 'API Health Check',
  configType: 'smoke_test',
  config: {
    testType: 'api',
    testDefinition: {
      endpoint: '/api/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000
    },
    timeoutSeconds: 10,
    retryCount: 3
  },
  version: '1.0.0'
};

// Save configuration
configManager.saveConfig(smokeTestConfig);
```

### 3. Preflight Check Execution

```typescript
import type { MafPreflightCheck } from './core/protocols';

// Create preflight check
const preflightCheck: MafPreflightCheck = {
  type: 'PREFLIGHT_CHECK',
  agentId: 'agent-001',
  configId: 'api-health-check',
  executionId: 'exec-12345',
  checkType: 'smoke_test',
  context: {
    environment: 'production',
    region: 'us-west-2'
  }
};

// Queue for execution
await runtimeState.enqueue(preflightCheck);
```

### 4. Escalation Management

```typescript
import type { MafEscalationRequest } from './core/protocols';

// Create escalation path configuration
const escalationConfig = {
  id: 'default-escalation-path',
  name: 'Default Escalation Path',
  configType: 'escalation_path',
  config: {
    triggerConditions: [
      { condition: 'preflight_failure', threshold: 3 },
      { condition: 'reservation_conflict', threshold: 1 }
    ],
    escalationSteps: [
      { level: 1, action: 'notify', target: 'supervisor' },
      { level: 2, action: 'escalate', target: 'manager' },
      { level: 3, action: 'escalate', target: 'director' }
    ],
    timeoutMinutes: 30,
    maxEscalationLevel: 3
  },
  version: '1.0.0'
};

configManager.saveConfig(escalationConfig);

// Create escalation request when needed
const escalationRequest: MafEscalationRequest = {
  type: 'ESCALATION_REQUEST',
  agentId: 'agent-001',
  executionId: 'exec-12345',
  escalationId: 'escalation-67890',
  pathId: 'default-escalation-path',
  level: 1,
  context: {
    failureReason: 'API health check failed 3 times',
    affectedSystems: ['user-service', 'auth-service']
  },
  reason: 'Critical system health check failures'
};

await runtimeState.enqueue(escalationRequest);
```

## Configuration Types

### Smoke Test Configuration

```typescript
const smokeTestConfig = {
  id: 'database-connectivity-check',
  name: 'Database Connectivity Check',
  configType: 'smoke_test',
  config: {
    testType: 'database',
    testDefinition: {
      connectionString: 'postgresql://localhost:5432/maf',
      query: 'SELECT 1 as health_check',
      expectedRows: 1
    },
    timeoutSeconds: 15,
    retryCount: 2
  },
  environmentOverrides: {
    development: {
      testDefinition: {
        connectionString: 'postgresql://localhost:5432/maf_dev'
      }
    },
    production: {
      timeoutSeconds: 30,
      retryCount: 5
    }
  },
  version: '1.0.0'
};
```

### Reservation Check Configuration

```typescript
const reservationCheckConfig = {
  id: 'file-lock-validation',
  name: 'File Lock Validation',
  configType: 'reservation_check',
  config: {
    checkType: 'concurrent_access',
    parameters: {
      lockTimeoutMinutes: 30,
      maxConcurrentReaders: 5,
      exclusiveWriteAccess: true
    },
    escalationPath: 'file-access-escalation'
  },
  version: '1.0.0'
};
```

### Escalation Path Configuration

```typescript
const escalationPathConfig = {
  id: 'critical-failure-escalation',
  name: 'Critical Failure Escalation',
  configType: 'escalation_path',
  config: {
    triggerConditions: [
      { condition: 'system_down', threshold: 1 },
      { condition: 'data_corruption', threshold: 1 },
      { condition: 'security_breach', threshold: 1 }
    ],
    escalationSteps: [
      {
        level: 1,
        action: 'notify',
        target: 'on-call-engineer',
        timeoutMinutes: 5
      },
      {
        level: 2,
        action: 'escalate',
        target: 'engineering-lead',
        timeoutMinutes: 15
      },
      {
        level: 3,
        action: 'escalate',
        target: 'vp-engineering',
        timeoutMinutes: 30
      }
    ],
    timeoutMinutes: 60,
    maxEscalationLevel: 3
  },
  version: '1.0.0'
};
```

## Database Operations

### Direct Database Access

```typescript
// For advanced operations, you can access the database directly
if ('executeQuery' in runtimeState) {
  // Query preflight executions
  const executions = runtimeState.executeQuery(`
    SELECT * FROM preflight_executions 
    WHERE status = 'failed' 
    AND created_at > ?
  `, [Date.now() - (24 * 60 * 60 * 1000)]); // Last 24 hours
  
  console.log(`Found ${executions.length} failed executions`);
}
```

### Transaction Support

```typescript
// Execute multiple operations atomically
if ('executeTransaction' in runtimeState) {
  const result = runtimeState.executeTransaction(() => {
    // Insert preflight execution record
    runtimeState.executeQuery(`
      INSERT INTO preflight_executions (id, config_id, agent_id, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [execId, configId, agentId, 'running', Date.now()]);
    
    // Update agent status
    runtimeState.executeQuery(`
      UPDATE agents SET status = 'working', last_seen = ?
      WHERE id = ?
    `, [Date.now(), agentId]);
    
    return { success: true };
  });
}
```

## Environment Configuration

### Environment Variables

- `MAF_RUNTIME_MODE`: Comma-separated list of runtime modes to try (default: 'sqlite')
- `MAF_AGENT_MAIL_ROOT`: Root directory for file-based runtime (default: '.agent-mail')
- `NODE_ENV`: Environment mode ('development', 'production', etc.)

### Example Configurations

```bash
# Production: SQLite with JSON fallback
export MAF_RUNTIME_MODE=sqlite,json

# Development: File-based only
export MAF_RUNTIME_MODE=json

# Testing: In-memory
export MAF_RUNTIME_MODE=memory
```

## Error Handling

### Graceful Degradation

The runtime factory supports automatic fallback when the primary mode fails:

```typescript
// Try SQLite first, fallback to JSON
process.env.MAF_RUNTIME_MODE = 'sqlite,json';
const runtimeState = createRuntimeFactory();
```

### Error Monitoring

```typescript
try {
  await runtimeState.acquireLease({
    filePath: '/path/to/file',
    agentId: 'agent-001',
    expiresAt: Date.now() + 60000
  });
} catch (error) {
  if (error.message.includes('already leased')) {
    // Handle lease conflict
    console.log('File is already leased by another agent');
    
    // Could trigger escalation
    const conflictNotice: MafReservationConflict = {
      type: 'RESERVATION_CONFLICT',
      agentId: 'agent-001',
      conflictId: 'conflict-' + Date.now(),
      filePath: '/path/to/file',
      conflictType: 'lease',
      severity: 'medium',
      details: {
        existingAgent: error.message.match(/by (.+?) until/)?.[1],
        requestedAgent: 'agent-001'
      }
    };
    
    await runtimeState.enqueue(conflictNotice);
  }
}
```

## Testing

### Running Tests

```bash
# Runtime tests
npm test lib/maf/__tests__/runtime-sqlite.test.ts

# Configuration tests
npm test lib/maf/config/__tests__/preflight.test.ts

# Integration tests
npm test lib/maf/__tests__/preflight-integration.test.ts
```

### Test Utilities

```typescript
import { createSqliteRuntimeStateWithCleanup } from './runtime-sqlite';

// Create test runtime with automatic cleanup
const testRuntime = createSqliteRuntimeStateWithCleanup(':memory:');

// ... run tests ...

// Clean up automatically
testRuntime.close();
```

## Migration and Versioning

### Configuration Migration

```typescript
// Migrate all configurations to a new version
const configs = configManager.listConfigs();
for (const configId of configs) {
  configManager.migrateConfig(configId, '2.0.0');
}
```

### Schema Migration

The runtime automatically handles schema migrations through the `loadMigrations` function. New schema versions are applied automatically when the database is initialized.

## Best Practices

1. **Always use transactions** for multi-step operations
2. **Implement proper error handling** with fallback strategies
3. **Use environment-specific overrides** for configuration differences
4. **Monitor escalations** and respond appropriately
5. **Clean up expired resources** regularly via the refresh method
6. **Test both SQLite and JSON runtime modes** for compatibility
7. **Use descriptive configuration IDs** and versions
8. **Document escalation paths** and trigger conditions

## Performance Considerations

- Use prepared statements (handled automatically by the runtime)
- Batch operations when possible
- Set appropriate connection pooling parameters
- Monitor database size and clean up old records
- Use indexes on frequently queried columns (included in schema)

## Security Notes

- Validate all input configurations before saving
- Use parameterized queries (handled by prepared statements)
- Implement proper access controls for escalation paths
- Secure database file permissions in production
- Audit all escalation requests and resolutions
