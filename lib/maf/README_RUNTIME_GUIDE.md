# MAF Runtime Guide

## Overview

The MAF (Multi-Agent Framework) supports two runtime modes with environment-based switching:

- **SQLite Runtime**: Production-ready persistence with canonical schema
- **JSON Runtime**: File-based fallback for development and testing

## Quick Start

### SQLite Runtime (Production)

```bash
# Use SQLite runtime with canonical schema
export MAF_RUNTIME=sqlite
npm run maf:demo-sqlite

# Verify SQLite database is created
ls -la runtime/
# Result: demo-sqlite.db (SQLite database with canonical schema)
```

### JSON Runtime (Development)

```bash
# Use JSON runtime (file-based)
export MAF_RUNTIME=json
npm run maf:demo-sqlite

# Verify JSON files are created
ls -la runtime/
# Result: *.json files for tasks, leases, events
```

## Environment Configuration

### Required Environment Variables

```bash
# Runtime selection (required)
MAF_RUNTIME=sqlite|json

# Optional: Custom database path
MAF_DB_PATH=runtime/custom.db

# Optional: Agent mail root directory
AGENT_MAIL_ROOT=.agent-mail
```

### Migration Process

The SQLite runtime automatically handles migration from legacy runtime_* tables:

1. **Legacy Detection**: Scans for existing `runtime_*` tables
2. **Data Migration**: Converts to canonical schema:
   - `runtime_leases` → `tasks` + `leases`
   - `runtime_heartbeats` → `events`
   - `runtime_message_queue` → `events`
3. **Schema Application**: Applies canonical schema with indexes

## Required Toolchain

### For SQLite Runtime

```bash
# Install SQLite dependencies
npm install better-sqlite3

# Verify native compilation
npm run build
```

### Build Requirements

- **Node.js**: >= 18.0.0
- **Python**: >= 3.8 (for better-sqlite3 native compilation)
- **Make**: For native module compilation

### Platform-Specific Setup

#### Linux
```bash
# Install build tools
sudo apt-get install python3-dev build-essential

# Install SQLite development headers
sudo apt-get install libsqlite3-dev
```

#### macOS
```bash
# Install Xcode command line tools
xcode-select --install

# Install SQLite via Homebrew
brew install sqlite3
```

#### Windows
```bash
# Install Windows Build Tools
npm install -g windows-build-tools

# Install Visual Studio Build Tools
# Follow instructions from better-sqlite3 documentation
```

## Troubleshooting

### SQLite Runtime Issues

#### Native Compilation Fails
```bash
# Error: "better-sqlite3 module not found"
Solution:
export MAF_RUNTIME=json  # Fallback to JSON runtime
# OR install dependencies manually

# Force rebuild
npm rebuild better-sqlite3
```

#### Database Permission Errors
```bash
# Error: "Cannot open database because directory does not exist"
Solution:
mkdir -p runtime
chmod 755 runtime
```

#### Performance Issues
```bash
# Enable WAL mode for better concurrency
# (Automatically enabled in SQLite runtime)

# Monitor database size
ls -lh runtime/*.db

# Analyze query performance
sqlite3 runtime/demo-sqlite.db "EXPLAIN QUERY PLAN SELECT * FROM tasks;"
```

### Migration Issues

#### Legacy Table Conflicts
```bash
# Error: "Table already exists" during migration
Solution: Backup and remove legacy tables
cp runtime/runtime.db runtime/runtime.backup.sql
rm runtime/runtime.db  # Will be recreated with canonical schema
```

#### Data Loss Prevention
```bash
# Always backup before major changes
sqlite3 runtime/runtime.db ".backup runtime/backup-$(date +%Y%m%d).db"
```

### Development Issues

#### TypeScript Compilation
```bash
# Build scripts for TypeScript
npm run maf:build-scripts

# Check for TypeScript errors
npx tsc --noEmit --project tsconfig.scripts.json
```

#### Test Failures
```bash
# Run SQLite-specific tests
npm test -- --testPathPatterns=runtime-sqlite

# Run with specific database
MAF_DB_PATH=test.db npm test -- --testPathPatterns=runtime-sqlite
```

## Performance Optimization

### SQLite Runtime

```sql
-- Check table sizes
SELECT
  name,
  COUNT(*) as row_count,
  ROUND(SUM(length(payload_json)) / 1024.0, 2) as kb_size
FROM tasks
GROUP BY name;

-- Optimize database
sqlite3 runtime/demo-sqlite.db "VACUUM; ANALYZE;"
```

### Memory Usage

```bash
# Monitor SQLite memory usage
sqlite3 runtime/demo-sqlite.db "PRAGMA cache_size;"
sqlite3 runtime/demo-sqlite.db "PRAGMA mmap_size;"
```

## Monitoring and Maintenance

### Database Health Checks

```bash
# Check database integrity
sqlite3 runtime/demo-sqlite.db "PRAGMA integrity_check;"

# Check for expired leases
sqlite3 runtime/demo-sqlite.db "
SELECT COUNT(*) FROM leases
WHERE lease_expires_at < $(date +%s)000;
"

# Clean expired data (handled automatically by refresh)
```

### Log Analysis

```bash
# Check SQLite runtime logs
grep "Applied canonical schema" maf-demo.log
grep "Added synthetic task" maf-demo.log
grep "Migration completed" maf-demo.log
```

## Migration from Previous Versions

### From File-based Runtime

```bash
# Step 1: Backup existing data
cp -r runtime/ runtime-backup/

# Step 2: Switch to SQLite
export MAF_RUNTIME=sqlite

# Step 3: Run demo to trigger migration
npm run maf:demo-sqlite

# Step 4: Verify data migration
sqlite3 runtime/demo-sqlite.db "SELECT COUNT(*) FROM tasks;"
```

### From Legacy Schema

```bash
# Check if migration was successful
sqlite3 runtime/demo-sqlite.db "
SELECT name FROM sqlite_master
WHERE type='table' AND name LIKE 'runtime_%';
"
# Should return empty set if migration successful
```

## Production Deployment

### Environment Setup

```bash
# Production environment variables
export NODE_ENV=production
export MAF_RUNTIME=sqlite
export MAF_DB_PATH=/var/lib/maf/production.db
export AGENT_MAIL_ROOT=/var/lib/maf/.agent-mail

# Create necessary directories
sudo mkdir -p /var/lib/maf
sudo chown $USER:$USER /var/lib/maf
```

### Database Backup Strategy

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
sqlite3 /var/lib/maf/production.db ".backup /var/backups/maf/maf-backup-$DATE.db"

# Compress old backups
find /var/backups/maf -name "maf-backup-*.db" -mtime +7 -gzip
```

### Monitoring

```bash
# Database size monitoring
du -h /var/lib/maf/production.db

# Performance metrics
sqlite3 /var/lib/maf/production.db "
SELECT
  'active_tasks' as metric,
  COUNT(*) as value
FROM tasks
WHERE state IN ('LEASED', 'RUNNING')
UNION ALL
SELECT
  'leases_today' as metric,
  COUNT(*) as value
FROM leases
WHERE lease_expires_at > strftime('%s', 'now', 'start of day') * 1000;
"
```

## Advanced Usage

### Custom Schema Extensions

```typescript
// Load additional schema extensions
import { loadPreflightSchemaExtensions } from '../lib/maf/store/schema-preflight';

// Apply custom migrations
await loadPreflightSchemaExtensions(db);
```

### Direct Database Access

```typescript
import { Database } from 'better-sqlite3';
import { createSqliteRuntimeState } from '../lib/maf/core/runtime-factory';

// Direct database operations
const db = new Database('runtime/custom.db');
const runtimeState = createSqliteRuntimeState('runtime/custom.db', '.agent-mail');
```

### Performance Tuning

```sql
-- SQLite PRAGMA settings for production
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA mmap_size = 268435456;  -- 256MB memory-mapped I/O
PRAGMA temp_store = MEMORY;
```

## Support

### Common Issues

1. **better-sqlite3 installation fails** → Use `MAF_RUNTIME=json` fallback
2. **Database locked errors** → Check for long-running transactions
3. **Migration failures** → Backup database and recreate
4. **Performance issues** → Enable WAL mode and proper indexing

### Getting Help

- Check this guide first for common solutions
- Review error logs for specific error messages
- Use `MAF_RUNTIME=json` as fallback for development
- File issues with database schema and error details

## Version History

- **v1.0**: Initial SQLite runtime with canonical schema
- **v0.9**: File-based JSON runtime (legacy)
- **v0.8**: Experimental runtime prototypes