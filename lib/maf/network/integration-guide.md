# MAF Network Security Integration Guide

## Quick Integration Steps

### 1. Update Reservation Store with Security Wrapper

In `lib/maf/store/reservation.ts`, integrate the DatabaseSecurityWrapper:

```typescript
import { DatabaseSecurityWrapper } from '../network/database-security';

// Replace direct Database instantiation
export class ReservationStore {
  private db: any = null;
  private dbSecurity: DatabaseSecurityWrapper;

  constructor(config: ReservationStoreConfig) {
    this.config = config;
    this.dbSecurity = new DatabaseSecurityWrapper({
      allowedPaths: [config.dbPath.includes('maf') ? '/mnt/maf_data/' : '/tmp/'],
      maxConnections: 10,
      enableAccessLogging: true
    });
  }

  async initialize(): Promise<void> {
    try {
      // Use security wrapper instead of direct Database instantiation
      this.db = await this.dbSecurity.createSecureConnection(this.config.dbPath);
      
      // Continue with existing initialization logic
      await this.loadSchema();
      this.prepareStatements();
    } catch (error) {
      throw new Error('Failed to initialize secure reservation store: ' + error);
    }
  }
}
```

### 2. Secure Backpressure Manager

Create `lib/maf/backpressure/secure-backpressure-manager.ts`:

```typescript
import { BackpressureManager } from './backpressure-manager';
import { MAFNetworkSecurityManager } from '../network/network-security-manager';

export class SecureBackpressureManager extends BackpressureManager {
  private networkSecurity: MAFNetworkSecurityManager;

  constructor(config: BackpressureManagerConfig, quotaManager?: QuotaManager, scheduler?: DAGEnhancedScheduler) {
    super(config, quotaManager, scheduler);
    this.networkSecurity = new MAFNetworkSecurityManager();
  }

  async submitTask(task: {
    id: string;
    providerId: string;
    priority: 'high' | 'medium' | 'low';
    taskData: any;
    estimatedTime?: number;
  }): Promise<any> {
    // Add network security validation for quota management operations
    if (task.taskData?.type === 'quota_check') {
      const networkOperation = {
        id: task.id,
        type: 'quota_check' as const,
        domain: 'api.quota-management.internal',
        port: 443,
        timestamp: Date.now(),
        priority: task.priority
      };

      const securityResult = await this.networkSecurity.secureBackpressureOperation(networkOperation);
      if (!securityResult.success) {
        return {
          routingDecision: {
            shouldRoute: false,
            reason: 'Network security policy violation',
            action: 'DROP',
            waitTimeMs: 0
          },
          backpressureEvent: {
            id: `security_block_${Date.now()}`,
            timestamp: Date.now(),
            type: 'DROPPED',
            providerId: task.providerId,
            details: {
              priority: task.priority,
              reason: 'Network security violation',
              taskId: task.id
            },
            severity: 'warning'
          }
        };
      }
    }

    // Continue with standard backpressure processing
    return super.submitTask(task);
  }
}
```

### 3. Update Event Logger for Security Events

Extend `lib/maf/events/event-logger.ts` with security event logging:

```typescript
export interface NetworkSecurityEventLog {
  timestamp: number;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  sourceIp: string;
  targetPort?: number;
  action: 'allowed' | 'blocked';
  reason: string;
  agentId?: string;
}

export interface SecurityAlertEventLog {
  alertId: string;
  type: string;
  severity: string;
  message: string;
  timestamp: number;
  affectedSystems: string[];
}

export class MafEventLogger {
  // Add these new methods to existing event logger
  
  async logNetworkSecurityEvent(event: NetworkSecurityEventLog): Promise<void> {
    const logEntry = {
      timestamp: event.timestamp,
      category: 'network_security',
      type: event.eventType,
      severity: event.severity,
      details: {
        sourceIp: event.sourceIp,
        targetPort: event.targetPort,
        action: event.action,
        reason: event.reason,
        agentId: event.agentId
      }
    };

    // Use existing logging infrastructure
    await this.logEvent('NETWORK_SECURITY', logEntry);
  }

  async logSecurityAlert(alert: SecurityAlertEventLog): Promise<void> {
    const logEntry = {
      timestamp: alert.timestamp,
      category: 'security_alert',
      type: alert.type,
      severity: alert.severity,
      details: {
        alertId: alert.alertId,
        message: alert.message,
        affectedSystems: alert.affectedSystems
      }
    };

    await this.logEvent('SECURITY_ALERT', logEntry);
    
    // For critical alerts, also log to system alert channel
    if (alert.severity === 'critical') {
      await this.triggerCriticalAlert(logEntry);
    }
  }
}
```

### 4. Update MAF Runtime Factory

Modify `lib/maf/core/runtime-factory.ts` to integrate security:

```typescript
import { SecureBackpressureManager } from '../backpressure/secure-backpressure-manager';
import { NetworkSecurityMonitor } from '../network/security-monitor';
import { DatabaseSecurityWrapper } from '../network/database-security';

export class MafRuntimeFactory {
  async createSecureRuntime(config: MafRuntimeConfig): Promise<MafRuntime> {
    // Initialize security components
    const dbSecurity = new DatabaseSecurityWrapper({
      allowedPaths: config.allowedDatabasePaths || ['/mnt/maf_data/'],
      maxConnections: config.maxDatabaseConnections || 10
    });

    const securityMonitor = new NetworkSecurityMonitor(eventLogger);

    // Create secure backpressure manager
    const backpressureManager = new SecureBackpressureManager(
      config.backpressureConfig,
      quotaManager,
      scheduler
    );

    // Continue with existing runtime creation, but with security components
    return new MafRuntime({
      ...config,
      backpressureManager,
      securityMonitor,
      dbSecurity
    });
  }
}
```

### 5. Environment Configuration

Add to your `.env` or environment configuration:

```bash
# Network Security Configuration
MAF_SECURITY_ENABLED=true
MAF_NETWORK_MONITORING=true
MAF_DATABASE_SECURITY=true
MAF_ADMIN_NETWORK=192.168.1.0/24
MAF_ALLOWED_DATABASE_PATHS=/mnt/maf_data/,/tmp/maf_reservations/

# Alert Thresholds
MAF_CRITICAL_EVENTS_PER_HOUR=5
MAF_BLOCKED_CONNECTIONS_PER_MINUTE=10
MAF_SUSPICIOUS_PATTERNS_PER_HOUR=20

# Rate Limits
MAF_DEFAULT_RATE_LIMIT=10
MAF_QUOTA_CHECK_RATE_LIMIT=5
MAF_HEARTBEAT_RATE_LIMIT=60
```

### 6. Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "maf:security-apply": "sudo ./scripts/network-security/apply-hardening.sh",
    "maf:security-test": "npm test lib/maf/network/__tests__//",
    "maf:security-report": "node -e \"require('./lib/maf/network/security-monitor').generateReport()\"",
    "maf:security-status": "node -e \"require('./lib/maf/network/network-security-manager').getStatus()\"",
    "maf:security-rollback": "sudo /tmp/emergency_rollback.sh"
  }
}
```

### 7. Testing Integration

Create a simple integration test:

```typescript
// tests/integration/maf-security-integration.test.ts
import { MAFNetworkSecurityManager } from '../../lib/maf/network/network-security-manager';
import { DatabaseSecurityWrapper } from '../../lib/maf/network/database-security';

describe('MAF Security Integration', () => {
  test('should integrate with existing MAF components', async () => {
    const networkSecurity = new MAFNetworkSecurityManager();
    const dbSecurity = new DatabaseSecurityWrapper({
      allowedPaths: ['/tmp/test/'],
      maxConnections: 5
    });

    // Test that security controls work with MAF operations
    const operation = {
      id: 'integration-test',
      type: 'quota_check' as const,
      domain: 'localhost',
      port: 443,
      timestamp: Date.now(),
      priority: 'high' as const
    };

    const result = await networkSecurity.secureBackpressureOperation(operation);
    expect(result).toBeDefined();

    await dbSecurity.emergencyCleanup();
    await networkSecurity.emergencyShutdown();
  });
});
```

## Migration Checklist

### Phase 1: Preparation (Days 1-2)
- [ ] Backup existing MAF configuration
- [ ] Review current network setup
- [ ] Test network security hardening script in development
- [ ] Prepare rollback procedures

### Phase 2: Database Security (Days 3-4)
- [ ] Integrate DatabaseSecurityWrapper with ReservationStore
- [ ] Update database connection strings to use security wrapper
- [ ] Test database operations through security layer
- [ ] Verify performance impact

### Phase 3: Network Security (Days 5-6)
- [ ] Integrate MAFNetworkSecurityManager with BackpressureManager
- [ ] Update event logger for security events
- [ ] Apply iptables hardening rules
- [ ] Test network operations through security controls

### Phase 4: Monitoring (Days 7-8)
- [ ] Deploy NetworkSecurityMonitor
- [ ] Configure alert thresholds
- [ ] Set up security dashboards
- [ ] Test alert generation and resolution

### Phase 5: Validation (Days 9-10)
- [ ] Run full integration test suite
- [ ] Perform security penetration testing
- [ ] Validate performance under load
- [ ] Document operational procedures

## Performance Impact

Expected performance overhead:
- Database operations: +2-5% (path validation, connection pooling)
- Network operations: +10-15% (rate limiting, validation)
- Memory usage: +10-20MB (security components, logging)
- CPU usage: +5-10% (security checks, monitoring)

Monitoring commands:
```bash
# Check performance impact
npm run maf:security-status

# Monitor security events in real-time
tail -f /var/log/maf-security.log

# Generate performance report
npm run maf:security-report
```

## Emergency Procedures

If MAF functionality is impacted:

1. **Immediate Rollback**:
   ```bash
   sudo /tmp/emergency_rollback.sh
   npm run maf:security-rollback
   ```

2. **Disable Security Temporarily**:
   ```bash
   export MAF_SECURITY_ENABLED=false
   export MAF_NETWORK_MONITORING=false
   ```

3. **Contact Support**:
   - Check security logs: `/var/log/maf-security.log`
   - Review active alerts: `npm run maf:security-status`
   - Generate incident report: `npm run maf:security-report`

## Success Metrics

After integration, you should see:
- ✅ 90%+ network boundary protection
- ✅ 99.9% MAF service availability maintained
- ✅ <5% performance overhead
- ✅ Real-time security monitoring active
- ✅ Automated alert generation working
- ✅ Complete audit trail of security events
