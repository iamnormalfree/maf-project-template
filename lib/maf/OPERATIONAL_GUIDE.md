# MAF Agent-Mail Preflight System - Operational Guide

## Overview

This operational guide provides comprehensive instructions for deploying, maintaining, and troubleshooting the MAF Agent-Mail preflight system in production environments.

## Table of Contents

1. [Installation and Setup](#installation-and-setup)
2. [Configuration Management](#configuration-management)
3. [Deployment Procedures](#deployment-procedures)
4. [Monitoring and Alerting](#monitoring-and-alerting)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Maintenance Procedures](#maintenance-procedures)
7. [Performance Tuning](#performance-tuning)
8. [Backup and Recovery](#backup-and-recovery)
9. [Security Operations](#security-operations)
10. [Emergency Procedures](#emergency-procedures)

## Installation and Setup

### Prerequisites

#### System Requirements

- **Node.js**: >= 18.17.0
- **npm**: >= 9.0.0
- **SQLite**: >= 3.35.0 (for SQLite runtime mode)
- **Python**: >= 3.8.0 (for preflight checks)
- **Disk Space**: 100MB minimum (1GB recommended for production)
- **Memory**: 256MB minimum (512MB recommended for production)

#### Required Packages

```bash
# System dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip sqlite3 git

# Node.js dependencies
npm install

# Python packages for preflight checks
pip3 install requests click
```

### Installation Steps

#### 1. Clone and Setup Repository

```bash
# Clone the repository
git clone <repository-url>
cd nextnest

# Install Node.js dependencies
npm install

# Verify installation
npm run test:maf-preflight
```

#### 2. Configure Environment

```bash
# Create environment configuration
cp .env.example .env

# Edit environment variables
nano .env
```

#### 3. Initialize Database

```bash
# Initialize SQLite database
npm run maf:setup

# Verify database schema
npm run maf:health-check
```

#### 4. Setup Pre-commit Hooks

```bash
# Install pre-commit hook
npm run maf:init-agent-mail

# Verify hook installation
ls .git/hooks/pre-commit
```

### Environment Configuration

#### Development Environment

```bash
# .env.development
NODE_ENV=development
MAF_RUNTIME_MODE=sqlite,json
MAF_AGENT_MAIL_ROOT=./.agent-mail-dev
MAF_DB_PATH=./.maf/runtime-dev.db
DEBUG=maf:*
LOG_LEVEL=debug
```

#### Production Environment

```bash
# .env.production
NODE_ENV=production
MAF_RUNTIME_MODE=sqlite
MAF_AGENT_MAIL_ROOT=/var/lib/maf/agent-mail
MAF_DB_PATH=/var/lib/maf/runtime.db
LOG_LEVEL=info
MAF_RESERVATION_DEFAULT_TIMEOUT=30
MAF_RESERVATION_MAX_TIMEOUT=120
```

#### Staging Environment

```bash
# .env.staging
NODE_ENV=staging
MAF_RUNTIME_MODE=sqlite,json
MAF_AGENT_MAIL_ROOT=./.agent-mail-staging
MAF_DB_PATH=./.maf/runtime-staging.db
LOG_LEVEL=debug
MAF_PREFLIGHT_TIMEOUT=60
```

## Configuration Management

### Configuration Files Structure

```
maf-config/
├── default.json           # Base configuration
├── development.json       # Development overrides
├── staging.json          # Staging overrides
├── production.json       # Production overrides
├── local.json            # Local overrides (gitignored)
└── environments/         # Environment-specific configs
    ├── test-env-1.json
    ├── test-env-2.json
    └── prod-cluster-1.json
```

### Configuration Validation

```bash
# Validate current configuration
npm run maf:preflight -- --validate-config

# Validate specific environment
npm run maf:preflight -- --validate-config --env production

# Generate configuration report
npm run maf:preflight -- --config-report --output config-report.json
```

### Configuration Updates

#### Staged Configuration Rollout

```bash
# 1. Test configuration in staging
NODE_ENV=staging npm run maf:preflight -- --config new-config.json

# 2. Validate production compatibility
npm run maf:preflight -- --validate-config --env production --config new-config.json

# 3. Deploy to production with rollback plan
npm run maf:deploy-config --config new-config.json --backup current-config.json

# 4. Verify deployment
npm run maf:health-check --env production
```

#### Configuration Backup and Restore

```bash
# Backup current configuration
npm run maf:backup-config --output backup-$(date +%Y%m%d-%H%M%S).json

# Restore configuration
npm run maf:restore-config --input backup-20251113-120000.json

# List available backups
npm run maf:list-backups
```

## Deployment Procedures

### Pre-deployment Checklist

#### Environment Validation

```bash
# 1. Verify prerequisites
npm run maf:preflight -- --full-check

# 2. Validate configuration
npm run maf:preflight -- --validate-config

# 3. Test database connectivity
npm run maf:health-check --test-db

# 4. Verify escalation targets
npm run maf:escalate -- --dry-run --target minimax-debug-1
npm run maf:escalate -- --dry-run --target codex-senior
```

#### Performance Baseline

```bash
# Establish performance baseline
npm run maf:performance-baseline --output baseline-$(date +%Y%m%d).json

# Load testing
npm run maf:load-test --concurrent 10 --duration 300
```

### Deployment Steps

#### 1. Zero-Downtime Deployment

```bash
# Create deployment snapshot
npm run maf:create-snapshot --name pre-deploy-$(date +%Y%m%d-%H%M%S)

# Deploy with health checks
npm run maf:deploy --health-check --rollback-on-failure

# Verify deployment
npm run maf:health-check --comprehensive

# Monitor for issues
npm run maf:monitor --duration 300
```

#### 2. Blue-Green Deployment

```bash
# Setup green environment
npm run maf:setup-environment --name green --config production-green.json

# Test green environment
npm run maf:smoke-test --environment green

# Switch traffic to green
npm run maf:switch-traffic --to green

# Verify blue environment is clean
npm run maf:cleanup-environment --name blue
```

#### 3. Canary Deployment

```bash
# Deploy to canary subset (10%)
npm run maf:canary-deploy --percentage 10 --monitor-duration 300

# Monitor canary health
npm run maf:monitor-canary --metrics latency,errors,throughput

# Expand canary if healthy
npm run maf:expand-canary --percentage 50

# Complete deployment
npm run maf:complete-canary
```

### Post-deployment Verification

#### Health Checks

```bash
# Comprehensive health check
npm run maf:health-check --comprehensive --output health-report.json

# Functional verification
npm run maf:smoke-test --full-suite

# Integration verification
npm run maf:test-integration --all-targets
```

#### Performance Verification

```bash
# Compare against baseline
npm run maf:performance-compare --baseline baseline-20251113.json

# Load testing
npm run maf:load-test --concurrent 50 --duration 600

# Stress testing
npm run maf:stress-test --intensity high --duration 300
```

## Monitoring and Alerting

### Key Performance Indicators (KPIs)

#### System Health Metrics

| Metric | Threshold | Alert Level | Description |
|--------|-----------|-------------|-------------|
| Database Response Time | <10ms (P95) | Warning >15ms | Average query response time |
| Lease Acquisition Time | <5ms (P95) | Warning >10ms | Time to acquire file lease |
| Preflight Validation Time | <2s | Warning >3s | Complete preflight check duration |
| Escalation Response Time | <100ms | Warning >200ms | Time to queue escalation |
| Memory Usage | <100MB | Warning >150MB | Runtime memory consumption |
| Error Rate | <1% | Critical >5% | Percentage of failed operations |
| Database Connections | <80% | Warning >90% | Connection pool utilization |

#### Business Metrics

| Metric | Target | Alert Level | Description |
|--------|--------|-------------|-------------|
| Reservation Success Rate | >99% | Warning <95% | Successful lease acquisitions |
| Escalation Resolution Time | <5min | Warning >10min | Time to resolve escalations |
| Preflight Pass Rate | >95% | Warning <90% | Percentage of passed preflight checks |
| Agent Availability | >99% | Warning <95% | Percentage of active agents |

### Monitoring Setup

#### Prometheus Metrics

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'maf-preflight'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

#### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "MAF Preflight System",
    "panels": [
      {
        "title": "System Health",
        "type": "stat",
        "targets": [
          {
            "expr": "maf_system_health_score",
            "legendFormat": "Health Score"
          }
        ]
      },
      {
        "title": "Database Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "maf_db_query_duration_seconds",
            "legendFormat": "Query Duration"
          }
        ]
      },
      {
        "title": "Reservation Activity",
        "type": "graph",
        "targets": [
          {
            "expr": "maf_reservation_operations_total",
            "legendFormat": "Reservation Operations"
          }
        ]
      }
    ]
  }
}
```

#### Alert Configuration

```yaml
# alerts.yml
groups:
  - name: maf-preflight
    rules:
      - alert: HighErrorRate
        expr: rate(maf_errors_total[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/second"

      - alert: DatabaseConnectionFailure
        expr: up{job="maf-preflight"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database connection failure"
          description: "MAF preflight system is not responding"

      - alert: ReservationConflictSpike
        expr: rate(maf_reservation_conflicts_total[5m]) > 10
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "High reservation conflict rate"
          description: "Reservation conflicts are {{ $value }} per second"
```

### Log Management

#### Structured Logging

```typescript
// Enhanced logging configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'maf-preflight',
    version: process.env.APP_VERSION || '1.0.0'
  },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

#### Log Analysis

```bash
# Analyze error patterns
grep -i error logs/combined.log | awk '{print $1, $2, $NF}' | sort | uniq -c

# Monitor reservation conflicts
grep "reservation conflict" logs/combined.log | tail -20

# Track escalation patterns
grep "escalation" logs/combined.log | jq '.level, .target' | sort | uniq -c

# Performance analysis
grep "query duration" logs/combined.log | jq '.duration' | awk '{sum+=$1; count++} END {print sum/count}'
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Preflight Validation Failures

##### Issue: Python Version Check Fails

**Symptoms:**
```
ERROR: Python version 3.7.0 is below minimum required 3.8.0
```

**Solutions:**
```bash
# Check current Python version
python3 --version

# Install required Python version (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install python3.8 python3.8-pip

# Update alternatives
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 1

# Verify installation
python3 --version
npm run maf:preflight -- --check-python
```

##### Issue: MCP Configuration Missing

**Symptoms:**
```
ERROR: MCP configuration files not found
```

**Solutions:**
```bash
# Check for MCP configs
ls -la ~/.config/codex/
ls -la ~/.config/cursor/
ls -la ~/.config/gemini/

# Create placeholder configs if testing
mkdir -p ~/.config/codex
echo '{"test": true}' > ~/.config/codex/config.json

# Verify with preflight
npm run maf:preflight -- --check-mcp
```

#### Database Issues

##### Issue: SQLite Database Locked

**Symptoms:**
```
ERROR: Database is locked
ERROR: Unable to acquire lease due to database contention
```

**Solutions:**
```bash
# Check for active leases using canonical schema
sqlite3 .maf/runtime.db ".timeout 5000" "SELECT t.*, l.agent_id, l.lease_expires_at FROM tasks t JOIN leases l ON t.id = l.task_id WHERE t.state = 'LEASED' AND l.lease_expires_at > $(date +%s)000"

# Kill stuck processes
lsof +D .maf/
pkill -f "maf.*runtime"

# Restart database connections
npm run maf:restart-db

# Check database integrity
sqlite3 .maf/runtime.db "PRAGMA integrity_check;"
```

##### Issue: Database Corruption

**Symptoms:**
```
ERROR: Database disk image is malformed
```

**Solutions:**
```bash
# Backup current database
cp .maf/runtime.db .maf/runtime.db.backup

# Attempt recovery
sqlite3 .maf/runtime.db ".recover" | sqlite3 .maf/runtime-recovered.db

# Verify recovery
sqlite3 .maf/runtime-recovered.db "PRAGMA integrity_check;"

# Switch to recovered database
mv .maf/runtime.db .maf/runtime-corrupted.db
mv .maf/runtime-recovered.db .maf/runtime.db

# Reinitialize if recovery fails
npm run maf:setup --force
```

#### Reservation System Issues

##### Issue: Lease Acquisition Fails

**Symptoms:**
```
ERROR: Unable to acquire lease for file
ERROR: File is already leased by another agent
```

**Solutions:**
```bash
# Check current leases
npm run maf:reservation list

# Check specific file
npm run maf:reservation check --file /path/to/file

# Force release stuck lease (with caution)
npm run maf:reservation release --file /path/to/file --force

# Override for emergency (document override reason)
MAF_RESERVATION_OVERRIDE=true npm run maf:reservation acquire --file /path/to/file --agent emergency-agent
```

##### Issue: Pre-commit Hook Blocking

**Symptoms:**
```
husky > pre-commit (node v18.17.0)
ERROR: Reservation conflict detected on file
```

**Solutions:**
```bash
# Check what's blocking the commit
git status
npm run maf:reservation check --file $(git diff --cached --name-only)

# Wait for lease to expire or contact agent owner
npm run maf:reservation status --file $(git diff --cached --name-only)

# Emergency override (document reason)
MAF_RESERVATION_OVERRIDE=true git commit -m "Emergency commit - reason: ..."
```

#### Escalation Issues

##### Issue: Escalation Not Delivered

**Symptoms:**
```
WARNING: Escalation delivery failed
ERROR: Unable to connect to escalation target
```

**Solutions:**
```bash
# Test escalation connectivity
npm run maf:escalate -- --dry-run --target minimax-debug-1
npm run maf:escalate -- --dry-run --target codex-senior

# Check escalation configuration
npm run maf:preflight -- --check-escalation-config

# Verify agent-mail directories
ls -la .agent-mail/messages/
ls -la .agent-mail/outbox/

# Test escalation manually
npm run maf:escalate -- --agent-id test --error-context test --bead-id test --target minimax-debug-1
```

### Diagnostic Commands

#### System Health Check

```bash
# Comprehensive health check
npm run maf:health-check --comprehensive --output health-$(date +%Y%m%d-%H%M%S).json

# Database health
npm run maf:health-check --database-only

# Configuration health
npm run maf:health-check --config-only

# Network connectivity
npm run maf:health-check --network-only
```

#### Performance Diagnostics

```bash
# Database performance analysis
npm run maf:analyze-db-performance --duration 300

# Memory usage analysis
npm run maf:analyze-memory --detailed

# Query performance profiling
npm run maf:profile-queries --output query-profile.json
```

#### Log Analysis

```bash
# Recent errors
tail -f logs/combined.log | grep -i error

# Performance bottlenecks
grep "slow query" logs/combined.log | tail -10

# Reservation conflicts
grep "reservation conflict" logs/combined.log | jq '.filePath' | sort | uniq -c
```

## Maintenance Procedures

### Regular Maintenance Schedule

#### Daily Tasks

```bash
# Health check (automated)
0 6 * * * npm run maf:health-check --quiet --email ops@company.com

# Log rotation (automated)
0 1 * * * npm run maf:rotate-logs

# Database cleanup (automated)
0 2 * * * npm run maf:cleanup-db --days 7
```

#### Weekly Tasks

```bash
# Performance analysis
npm run maf:performance-report --week --email ops@company.com

# Configuration review
npm run maf:config-audit --email config@company.com

# Security audit
npm run maf:security-audit --email security@company.com
```

#### Monthly Tasks

```bash
# Comprehensive system audit
npm run maf:full-audit --month $(date +%Y-%m) --email ops@company.com

# Database optimization
npm run maf:optimize-db --full

# Backup verification
npm run maf:verify-backups --retention 30
```

## Canonical Schema Reference

The MAF SQLite runtime uses a canonical schema with four core tables. Understanding this schema is essential for monitoring, debugging, and verification.

### Core Tables

#### Tasks Table
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('READY','LEASED','RUNNING','VERIFYING','COMMITTED','ROLLBACK','DONE','DEAD')),
  priority INTEGER NOT NULL DEFAULT 100,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  token_budget INTEGER NOT NULL DEFAULT 0,
  cost_budget_cents INTEGER NOT NULL DEFAULT 0,
  policy_label TEXT NOT NULL DEFAULT 'private'
);

CREATE INDEX idx_tasks_state_prio ON tasks(state, priority, created_at);
```

#### Leases Table
```sql
CREATE TABLE leases (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  UNIQUE(task_id),
  UNIQUE(task_id, attempt)
);
```

#### Events Table
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL
);
```

#### Evidence Table
```sql
CREATE TABLE evidence (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  verifier TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('PASS','FAIL')),
  details_json TEXT NOT NULL,
  PRIMARY KEY (task_id, attempt, verifier)
);
```

### Schema Verification Queries

#### Check Database Integrity
```sql
-- Verify all canonical tables exist
SELECT name FROM sqlite_master
WHERE type='table' AND name IN ('tasks','leases','events','evidence');

-- Check foreign key constraints are enabled
PRAGMA foreign_keys;

-- Verify referential integrity
PRAGMA integrity_check;
```

#### Monitor Task Lifecycle
```sql
-- Current task distribution by state
SELECT state, COUNT(*) as count
FROM tasks
GROUP BY state
ORDER BY count DESC;

-- Active leases with expiry information
SELECT
  l.task_id,
  l.agent_id,
  l.lease_expires_at,
  t.state as task_state,
  (l.lease_expires_at - strftime('%s','now')*1000) as ms_until_expiry
FROM leases l
JOIN tasks t ON l.task_id = t.id
WHERE l.lease_expires_at > strftime('%s','now')*1000;

-- Recent events by task
SELECT
  task_id,
  kind,
  datetime(ts/1000, 'unixepoch') as timestamp,
  json_extract(data_json, '$.event') as event_description
FROM events
WHERE ts > (strftime('%s','now') - 3600)*1000  -- Last hour
ORDER BY ts DESC;
```

#### Verification Evidence
```sql
-- Evidence by verifier and result
SELECT
  verifier,
  result,
  COUNT(*) as count,
  COUNT(DISTINCT task_id) as unique_tasks
FROM evidence
GROUP BY verifier, result;

-- Recent verification failures
SELECT
  e.task_id,
  e.attempt,
  e.verifier,
  e.details_json,
  t.state as current_task_state
FROM evidence e
JOIN tasks t ON e.task_id = t.id
WHERE e.result = 'FAIL'
ORDER BY t.updated_at DESC;
```

#### Performance Metrics
```sql
-- Task completion rates by time window
SELECT
  DATE(datetime(created_at/1000, 'unixepoch')) as date,
  COUNT(*) as tasks_created,
  SUM(CASE WHEN state = 'DONE' THEN 1 ELSE 0 END) as tasks_completed,
  ROUND(SUM(CASE WHEN state = 'DONE' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as completion_rate
FROM tasks
WHERE created_at > (strftime('%s','now') - 7*86400)*1000  -- Last 7 days
GROUP BY DATE(datetime(created_at/1000, 'unixepoch'))
ORDER BY date DESC;

-- Average task duration by state
SELECT
  state,
  COUNT(*) as task_count,
  AVG(updated_at - created_at) as avg_duration_ms,
  MIN(updated_at - created_at) as min_duration_ms,
  MAX(updated_at - created_at) as max_duration_ms
FROM tasks
WHERE state IN ('DONE','ROLLBACK','DEAD')
GROUP BY state;
```

### Database Maintenance

#### Routine Cleanup

```bash
# Clean expired leases
npm run maf:cleanup-expired-leases

# Remove old audit logs
npm run maf:cleanup-audit-logs --days 30

# Optimize database
npm run maf:optimize-db

# Update statistics
sqlite3 .maf/runtime.db "ANALYZE;"
```

#### Index Maintenance

```bash
# Check index usage
sqlite3 .maf/runtime.db ".schema" | grep "CREATE INDEX"

# Rebuild indexes if necessary
npm run maf:rebuild-indexes

# Analyze query performance
npm run maf:analyze-query-performance
```

#### Backup Procedures

```bash
# Daily backup
npm run maf:backup-db --output backup-$(date +%Y%m%d).db

# Compress old backups
find backups/ -name "*.db" -mtime +7 -exec gzip {} \;

# Verify backup integrity
npm run maf:verify-backup --file backup-20251113.db
```

### Configuration Maintenance

#### Version Control

```bash
# Tag current configuration
git tag config-$(date +%Y%m%d-%H%M%S)

# Compare configuration versions
npm run maf:compare-config --from config-20251101 --to config-20251113

# Rollback configuration
npm run maf:rollback-config --to config-20251101
```

#### Security Updates

```bash
# Check for security vulnerabilities
npm audit

# Update dependencies
npm update

# Verify system still works
npm run test:maf-preflight
```

## Performance Tuning

### Database Optimization

#### SQLite Configuration

```sql
-- Optimize for production use
PRAGMA journal_mode = WAL;          -- Better concurrency
PRAGMA synchronous = NORMAL;         -- Balance safety and performance
PRAGMA cache_size = 10000;          -- Increase cache size
PRAGMA temp_store = MEMORY;         -- Store temporary tables in memory
PRAGMA mmap_size = 268435456;       -- Memory-mapped I/O (256MB)
PRAGMA optimize;                    -- Optimize query plans
```

#### Index Optimization

```sql
-- Analyze index usage with canonical schema
EXPLAIN QUERY PLAN
SELECT t.*, l.agent_id, l.lease_expires_at
FROM tasks t
JOIN leases l ON t.id = l.task_id
WHERE t.state = 'LEASED';

-- Canonical schema indexes are already optimized
-- Tasks: idx_tasks_state, idx_tasks_priority, idx_tasks_updated_at
-- Leases: idx_lease_expires_at, idx_lease_agent_id
-- Events: idx_events_task_id, idx_events_type, idx_events_created_at
-- Evidence: idx_evidence_task_id, idx_evidence_type, idx_evidence_created_at
CREATE INDEX idx_escalation_tracking_agent_status ON escalation_tracking(agent_id, status);
```

#### Connection Pool Tuning

```typescript
// Optimize connection pool settings
const connectionPoolConfig = {
  max: 20,                    // Maximum connections
  min: 5,                     // Minimum connections
  acquireTimeoutMillis: 30000, // Connection timeout
  idleTimeoutMillis: 300000,   // Idle timeout
  createTimeoutMillis: 5000,   // Creation timeout
  destroyTimeoutMillis: 5000,  // Destruction timeout
  reapIntervalMillis: 1000,    // Cleanup interval
  createRetryIntervalMillis: 200 // Retry interval
};
```

### Application Optimization

#### Memory Management

```typescript
// Optimize memory usage
const memoryConfig = {
  maxCacheSize: 1000,         // Maximum cached items
  cacheTTL: 300000,          // Cache TTL (5 minutes)
  gcInterval: 60000,         // Garbage collection interval
  maxMemoryUsage: 536870912  // Maximum memory usage (512MB)
};

// Monitor memory usage
function monitorMemory() {
  const usage = process.memoryUsage();
  console.log('Memory Usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
  });
}
```

#### Query Optimization

```typescript
// Batch operations for better performance using canonical schema
async function batchHeartbeatUpdates(updates: HeartbeatUpdate[]) {
  // Heartbeats are recorded as events in the canonical schema
  const stmt = db.prepare(`
    INSERT INTO events (id, task_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const update of updates) {
      stmt.run(
        `heartbeat_${update.agentId}_${Date.now()}`,
        `agent_${update.agentId}`,
        'heartbeat',
        JSON.stringify(update),
        update.lastSeen
      );
    }
  });

  transaction();
}
```

### Performance Monitoring with Canonical Schema

```typescript
// Monitor task performance using canonical schema
function getTaskPerformanceStats(db: Database.Database) {
  const stats = db.prepare(`
    SELECT
      state,
      COUNT(*) as task_count,
      AVG(updated_at - created_at) as avg_duration_ms
    FROM tasks
    GROUP BY state
  `).all();

  return stats;
}
```

### Load Balancing

#### Horizontal Scaling

```typescript
// Multi-instance configuration
const clusterConfig = {
  instances: 4,                    // Number of worker processes
  maxConnections: 50,              // Connections per instance
  loadBalancing: 'round-robin',    // Load balancing strategy
  healthCheck: {
    interval: 5000,                // Health check interval
    timeout: 2000,                 // Health check timeout
    retries: 3                     // Health check retries
  }
};
```

#### Caching Strategy

```typescript
// Multi-level caching
const cacheConfig = {
  l1Cache: {                      // In-memory cache
    maxSize: 1000,
    ttl: 300000                   // 5 minutes
  },
  l2Cache: {                      // Redis cache (optional)
    enabled: true,
    ttl: 1800000,                 // 30 minutes
    keyPrefix: 'maf:preflight:'
  }
};
```

## Backup and Recovery

### Backup Strategy

#### Database Backups

```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/var/backups/maf"
DB_FILE="/var/lib/maf/runtime.db"
DATE=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Full backup
sqlite3 "$DB_FILE" ".backup $BACKUP_DIR/runtime-$DATE.db"

# Compress backup
gzip "$BACKUP_DIR/runtime-$DATE.db"

# Verify backup
if gzip -t "$BACKUP_DIR/runtime-$DATE.db.gz"; then
    echo "Backup completed successfully: runtime-$DATE.db.gz"
else
    echo "Backup verification failed"
    exit 1
fi

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "runtime-*.db.gz" -mtime +30 -delete
```

#### Configuration Backups

```bash
#!/bin/bash
# backup-config.sh

CONFIG_DIR="/etc/maf/config"
BACKUP_DIR="/var/backups/maf/config"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup configuration files
tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" -C "$CONFIG_DIR" .

# Backup current database schema
sqlite3 /var/lib/maf/runtime.db ".schema" > "$BACKUP_DIR/schema-$DATE.sql"
```

### Recovery Procedures

#### Database Recovery

```bash
#!/bin/bash
# recover-database.sh

BACKUP_FILE=$1
DB_FILE="/var/lib/maf/runtime.db"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

# Stop MAF services
systemctl stop maf-preflight

# Create backup of current database
cp "$DB_FILE" "$DB_FILE.backup-$(date +%Y%m%d-%H%M%S)"

# Restore database
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" > "$DB_FILE"
else
    cp "$BACKUP_FILE" "$DB_FILE"
fi

# Verify database integrity
if sqlite3 "$DB_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "Database recovery successful"
else
    echo "Database recovery failed - restoring backup"
    mv "$DB_FILE.backup-$(date +%Y%m%d-%H%M%S)" "$DB_FILE"
    exit 1
fi

# Restart MAF services
systemctl start maf-preflight

# Verify system health
npm run maf:health-check
```

#### Configuration Recovery

```bash
#!/bin/bash
# recover-config.sh

BACKUP_FILE=$1
CONFIG_DIR="/etc/maf/config"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

# Backup current configuration
cp -r "$CONFIG_DIR" "$CONFIG_DIR.backup-$(date +%Y%m%d-%H%M%S)"

# Restore configuration
tar -xzf "$BACKUP_FILE" -C "$CONFIG_DIR"

# Verify configuration
if npm run maf:preflight -- --validate-config; then
    echo "Configuration recovery successful"
else
    echo "Configuration recovery failed - restoring backup"
    rm -rf "$CONFIG_DIR"
    mv "$CONFIG_DIR.backup-$(date +%Y%m%d-%H%M%S)" "$CONFIG_DIR"
    exit 1
fi
```

### Disaster Recovery

#### Complete System Recovery

```bash
#!/bin/bash
# disaster-recovery.sh

BACKUP_DATE=$1
BACKUP_DIR="/var/backups/maf"

if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup-date-YYYYMMDD>"
    exit 1
fi

# Stop all services
systemctl stop maf-preflight
systemctl stop nginx  # If using reverse proxy

# Restore database
./recover-database.sh "$BACKUP_DIR/runtime-$BACKUP_DATE-120000.db.gz"

# Restore configuration
./recover-config.sh "$BACKUP_DIR/config-$BACKUP_DATE-120000.tar.gz"

# Restore application files
tar -xzf "$BACKUP_DIR/application-$BACKUP_DATE.tar.gz" -C /opt/maf/

# Update file permissions
chown -R maf:maf /opt/maf/
chown -R maf:maf /var/lib/maf/
chmod +x /opt/maf/bin/*

# Restart services
systemctl start maf-preflight
systemctl start nginx

# Verify system
npm run maf:health-check --comprehensive

echo "Disaster recovery completed"
```

## Security Operations

### Access Control

#### User Management

```bash
# Add new user
npm run maf:add-user --username newuser --role operator

# Remove user
npm run maf:remove-user --username olduser

# Update user role
npm run maf:update-user --username existinguser --role admin

# List users
npm run maf:list-users
```

#### Permission Management

```typescript
// Role-based access control
const permissions = {
  admin: [
    'system:configure',
    'database:manage',
    'users:manage',
    'escalation:manage'
  ],
  operator: [
    'reservation:manage',
    'preflight:execute',
    'escalation:create'
  ],
  viewer: [
    'system:view',
    'logs:view'
  ]
};

function checkPermission(userId: string, action: string): boolean {
  const userRole = getUserRole(userId);
  const userPermissions = permissions[userRole] || [];
  return userPermissions.includes(action);
}
```

### Security Monitoring

#### Intrusion Detection

```bash
# Monitor for suspicious activity
npm run maf:security-monitor --alert-threshold 5

# Check for failed authentication attempts
grep "authentication failed" logs/combined.log | tail -20

# Monitor for unusual escalation patterns
npm run maf:analyze-escalation-patterns --anomaly-detection
```

#### Security Audits

```bash
# Daily security scan
npm run maf:security-audit --daily --email security@company.com

# Weekly vulnerability assessment
npm run maf:vulnerability-scan --comprehensive

# Monthly penetration testing
npm run maf:pen-test --external --email security@company.com
```

### Incident Response

#### Security Incident Response

1. **Detection**
   ```bash
   # Monitor security alerts
   npm run maf:security-monitor --real-time
   
   # Check for anomalies
   npm run maf:detect-anomalies --pattern unusual_escalation
   ```

2. **Containment**
   ```bash
   # Isolate affected systems
   npm run maf:isolate-system --reason security_incident
   
   # Block suspicious IPs
   npm run maf:block-ip --ip 192.168.1.100 --reason security_incident
   ```

3. **Eradication**
   ```bash
   # Remove unauthorized access
   npm run maf:revoke-sessions --user suspicious_user
   
   # Rotate credentials
   npm run maf:rotate-credentials --all
   ```

4. **Recovery**
   ```bash
   # Restore from clean backup
   npm run maf:disaster-recovery --backup-date 20251113
   
   # Verify system integrity
   npm run maf:integrity-check --comprehensive
   ```

5. **Post-Incident Review**
   ```bash
   # Generate incident report
   npm run maf:incident-report --output incident-$(date +%Y%m%d).md
   
   # Update security measures
   npm run maf:update-security --based-on incident-20251113.md
   ```

## Emergency Procedures

### System Outages

#### Immediate Response

```bash
# Check system status
npm run maf:status --comprehensive

# Identify failing components
npm run maf:diagnose --output diagnosis-$(date +%Y%m%d-%H%M%S).json

# Attempt automatic recovery
npm run maf:auto-recover --safe-only
```

#### Manual Recovery Steps

1. **Database Issues**
   ```bash
   # Check database connectivity
   sqlite3 .maf/runtime.db "SELECT 1;"
   
   # Restart database if needed
   npm run maf:restart-db
   
   # Restore from backup if corrupted
   npm run maf:restore-db --backup latest
   ```

2. **Service Issues**
   ```bash
   # Restart MAF services
   systemctl restart maf-preflight
   
   # Check service status
   systemctl status maf-preflight
   
   # Review service logs
   journalctl -u maf-preflight -f
   ```

3. **Network Issues**
   ```bash
   # Check network connectivity
   npm run maf:test-connectivity --all-targets
   
   # Restart network services
   systemctl restart networking
   
   # Check firewall rules
   iptables -L -n
   ```

### Data Corruption

#### Detection

```bash
# Check database integrity
sqlite3 .maf/runtime.db "PRAGMA integrity_check;"

# Verify configuration consistency
npm run maf:verify-config --comprehensive

# Check for data anomalies
npm run maf:detect-anomalies --data-only
```

#### Recovery

```bash
# Isolate corrupted data
npm run maf:isolate-corrupted-data --output corrupted-$(date +%Y%m%d).json

# Restore from last known good backup
npm run maf:restore-backup --backup latest-good

# Reapply recent changes
npm run maf:reapply-changes --since $(date -d '1 day ago' +%Y%m%d)

# Verify data integrity
npm run maf:verify-integrity --comprehensive
```

### Performance Degradation

#### Diagnosis

```bash
# Performance analysis
npm run maf:performance-analysis --output perf-$(date +%Y%m%d-%H%M%S).json

# Resource usage monitoring
npm run maf:monitor-resources --duration 300

# Database performance check
npm run maf:db-performance-check --detailed
```

#### Resolution

```bash
# Optimize database
npm run maf:optimize-db --full

# Clear caches
npm run maf:clear-caches --all

# Restart services
systemctl restart maf-preflight

# Scale resources if needed
npm run maf:scale-resources --instances 8
```

### Communication Procedures

#### Internal Communication

```bash
# Generate status report
npm run maf:status-report --output status-$(date +%Y%m%d-%H%M%S).html

# Notify operations team
npm run maf:notify-ops --severity high --message "System degradation detected"

# Update status page
npm run maf:update-status-page --status degraded -- ETA "30 minutes"
```

#### External Communication

```bash
# Generate incident report
npm run maf:incident-report --customer --output incident-$(date +%Y%m%d).md

# Send customer notification
npm run maf:notify-customers --type incident --template system_maintenance

# Update external status
npm run maf:update-external-status --status "Performance Issues"
```

---

**Generated**: 2025-11-13  
**Version**: 1.0.0  
**Author**: Claude Code Documentation Specialist  
**Last Updated**: 2025-11-13
