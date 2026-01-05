# MAF Agent-Mail Preflight System - CLI Usage Guide

## Overview

The MAF Agent-Mail preflight system provides a comprehensive command-line interface for system management, preflight validation, reservation management, escalation handling, and audit operations.

## Table of Contents

1. [Installation and Setup](#installation-and-setup)
2. [Command Reference](#command-reference)
3. [Usage Examples](#usage-examples)
4. [Configuration Options](#configuration-options)
5. [Integration Examples](#integration-examples)
6. [Troubleshooting CLI Issues](#troubleshooting-cli-issues)
7. [Advanced Usage](#advanced-usage)

## Installation and Setup

### Prerequisites

- Node.js >= 18.17.0
- npm >= 9.0.0
- SQLite >= 3.35.0
- Python >= 3.8.0

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd nextnest

# Install dependencies
npm install

# Verify installation
npm run maf:preflight -- --help
```

### Environment Setup

```bash
# Create environment file
cp .env.example .env

# Edit environment variables
nano .env

# Load environment variables
source .env
```

## Command Reference

### Preflight Commands

#### maf:preflight

Run comprehensive preflight validation checks.

```bash
npm run maf:preflight [options]
```

**Options:**
- `--check-only`: Run checks without attempting fixes
- `--fix`: Attempt to fix detected issues automatically
- `--config PATH`: Use specific configuration file
- `--env ENVIRONMENT`: Override environment context
- `--report`: Generate detailed report
- `--output PATH`: Save report to file
- `--timeout SECONDS`: Override default timeout (default: 30)
- `--retry COUNT`: Override default retry count (default: 3)
- `--verbose`: Enable verbose logging
- `--quiet`: Suppress non-error output
- `--check-python`: Run Python environment checks only
- `--check-mcp`: Run MCP configuration checks only
- `--check-env`: Run environment variable checks only

**Examples:**
```bash
# Basic preflight check
npm run maf:preflight

# Run checks with automatic fixes
npm run maf:preflight --fix

# Generate detailed report
npm run maf:preflight --report --output preflight-report.json

# Run specific checks
npm run maf:preflight --check-python --check-mcp

# Check with custom timeout
npm run maf:preflight --timeout 60 --retry 5
```

#### maf:preflight:ts

TypeScript version of preflight validation with enhanced error handling.

```bash
npm run maf:preflight:ts [options]
```

**Additional Options:**
- `--type-check`: Enable TypeScript type checking
- `--compile-check`: Verify compilation before validation
- `--tsconfig PATH`: Use custom TypeScript configuration

**Examples:**
```bash
# Run with TypeScript checks
npm run maf:preflight:ts --type-check

# Use custom tsconfig
npm run maf:preflight:ts --tsconfig ./tsconfig.prod.json
```

### Reservation Commands

#### maf:reservation

Manage file reservations and leases.

```bash
npm run maf:reservation <action> [options]
```

**Actions:**
- `check`: Check reservation status for a file
- `acquire`: Acquire a file reservation
- `release`: Release a file reservation
- `list`: List all active reservations
- `status`: Show system reservation status
- `cleanup`: Clean up expired reservations

**Options:**
- `--file PATH`: Target file path
- `--agent ID`: Agent identifier
- `--timeout MINUTES`: Lease timeout in minutes
- `--force`: Force action (override existing restrictions)
- `--override`: Enable override mode
- `--json`: Output in JSON format
- `--verbose`: Enable verbose output

**Examples:**
```bash
# Check reservation status
npm run maf:reservation check --file /path/to/file

# Acquire reservation
npm run maf:reservation acquire --file /path/to/file --agent agent-001

# Release reservation
npm run maf:reservation release --file /path/to/file --agent agent-001

# List all active reservations
npm run maf:reservation list --json

# Clean up expired reservations
npm run maf:reservation cleanup --verbose
```

### Escalation Commands

#### maf:escalate

Create and manage escalations.

```bash
npm run maf:escalate [options]
```

**Required Options:**
- `--agent-id ID`: Agent identifier
- `--error-context CONTEXT`: Error context description
- `--bead-id ID`: Bead identifier

**Optional Options:**
- `--target TARGET`: Escalation target (minimax-debug-1, codex-senior)
- `--priority LEVEL`: Priority level (low, medium, high, critical)
- `--context JSON`: Additional context as JSON
- `--dry-run`: Simulate escalation without sending
- `--level NUMBER`: Escalation level
- `--timeout SECONDS`: Timeout in seconds
- `--max-retries COUNT`: Maximum retry attempts

**Examples:**
```bash
# Basic escalation
npm run maf:escalate --agent-id any --error-context test --bead-id bd-demo

# Escalate to specific target
npm run maf:escalate --agent-id any --error-context test --bead-id bd-demo --target minimax-debug-1

# High priority escalation
npm run maf:escalate --agent-id any --error-context critical --bead-id bd-demo --priority high --target codex-senior

# Dry run escalation
npm run maf:escalate --agent-id any --error-context test --bead-id bd-demo --dry-run

# Escalation with custom context
npm run maf:escalate --agent-id any --error-context test --bead-id bd-demo --context '{"system":"api","error":"timeout"}'
```

#### maf:escalate-monitor

Monitor escalation responses and status.

```bash
npm run maf:escalate-monitor [options]
```

**Options:**
- `--monitor`: Monitor mode (continuous)
- `--duration SECONDS`: Monitoring duration
- `--filter STATUS`: Filter by status (pending, acknowledged, resolved)
- `--target TARGET`: Filter by escalation target
- `--json`: Output in JSON format
- `--real-time`: Real-time updates

**Examples:**
```bash
# Monitor escalations for 5 minutes
npm run maf:escalate-monitor --duration 300

# Monitor pending escalations
npm run maf:escalate-monitor --filter pending --real-time

# Monitor specific target
npm run maf:escalate-monitor --target minimax-debug-1 --json
```

### Audit Commands

#### maf:audit-guard

Run audit guard checks and generate reports.

```bash
npm run maf:audit-guard [options]
```

**Options:**
- `--bead-id ID`: Bead identifier (required for smoke test)
- `--report`: Generate comprehensive audit report
- `--days NUMBER`: Number of days to analyze
- `--validate`: Validate audit trail integrity
- `--from DATE`: Start date (YYYY-MM-DD)
- `--to DATE`: End date (YYYY-MM-DD)
- `--output PATH`: Save report to file
- `--checklist`: Run audit checklist validation

**Examples:**
```bash
# Run smoke test
npm run maf:audit-guard --bead-id bd-demo

# Generate 7-day audit report
npm run maf:audit-guard --report --days 7

# Validate audit trail
npm run maf:audit-guard --validate --from 2025-11-01

# Run audit checklist
npm run maf:audit-guard --checklist --output audit-report.json
```

### System Management Commands

#### maf:setup

Initialize MAF system components.

```bash
npm run maf:setup [options]
```

**Options:**
- `--force`: Force reinitialization
- `--db-only`: Setup database only
- `--config-only`: Setup configuration only
- `--environment ENV`: Target environment

**Examples:**
```bash
# Full system setup
npm run maf:setup

# Database-only setup
npm run maf:setup --db-only

# Force reinitialization
npm run maf:setup --force
```

#### maf:health-check

Perform comprehensive system health checks.

```bash
npm run maf:health-check [options]
```

**Options:**
- `--comprehensive`: Full health check
- `--database-only`: Check database health only
- `--config-only`: Check configuration health only
- `--network-only`: Check network connectivity only
- `--output PATH`: Save health report
- `--json`: Output in JSON format

**Examples:**
```bash
# Comprehensive health check
npm run maf:health-check --comprehensive

# Database health check
npm run maf:health-check --database-only

# JSON output
npm run maf:health-check --comprehensive --json
```

#### maf:index

Generate system index and catalog.

```bash
npm run maf:index [options]
```

**Options:**
- `--rebuild`: Rebuild entire index
- `--incremental`: Incremental update
- `--output PATH`: Save index to file
- `--format FORMAT`: Output format (json, yaml, csv)

**Examples:**
```bash
# Generate full index
npm run maf:index --rebuild

# Incremental update
npm run maf:index --incremental

# Export as CSV
npm run maf:index --format csv --output system-index.csv
```

### Agent Management Commands

#### maf:spawn-agents

Spawn and manage MAF agents.

```bash
npm run maf:spawn-agents [options]
```

**Options:**
- `--layout LAYOUT`: Agent layout configuration
- `--workers COUNT`: Number of worker agents
- `--background`: Run in background
- `--debug`: Enable debug mode
- `--verbose`: Verbose logging
- `--config PATH`: Custom configuration file

**Examples:**
```bash
# Spawn with default layout
npm run maf:spawn-agents

# Spawn with specific layout and workers
npm run maf:spawn-agents --layout demo_4_pane --workers 3

# Run in background
npm run maf:spawn-agents --background --workers 2

# Debug mode
npm run maf:spawn-agents --debug --verbose
```

#### maf:claim-task

Claim and manage tasks for agents.

```bash
npm run maf:claim-task [options]
```

**Options:**
- `--task-id ID`: Specific task ID to claim
- `--agent-id ID`: Agent identifier
- `--priority LEVEL`: Task priority
- `--force`: Force claim task
- `--list`: List available tasks

**Examples:**
```bash
# Claim next available task
npm run maf:claim-task

# Claim specific task
npm run maf:claim-task --task-id task-123

# List available tasks
npm run maf:claim-task --list

# Force claim high priority task
npm run maf:claim-task --priority high --force
```

### Development Commands

#### maf:test-beads-flow

Test beads workflow functionality.

```bash
npm run maf:test-beads-flow [options]
```

**Options:**
- `--cleanup`: Cleanup test artifacts
- `--verbose`: Verbose test output
- `--report`: Generate test report
- `--timeout SECONDS`: Test timeout

**Examples:**
```bash
# Run beads flow test
npm run maf:test-beads-flow

# Verbose output with cleanup
npm run maf:test-beads-flow --verbose --cleanup

# Generate test report
npm run maf:test-beads-flow --report
```

#### maf:bootstrap-agent-mail

Bootstrap Agent-Mail system.

```bash
npm run maf:bootstrap-agent-mail [options]
```

**Options:**
- `--force`: Force bootstrap
- `--config PATH`: Custom bootstrap configuration
- `--environment ENV`: Target environment

**Examples:**
```bash
# Bootstrap Agent-Mail
npm run maf:bootstrap-agent-mail

# Force bootstrap with custom config
npm run maf:bootstrap-agent-mail --force --config ./bootstrap.json
```

## Usage Examples

### Complete Workflow Example

```bash
# 1. System initialization
npm run maf:setup

# 2. Health check
npm run maf:health-check --comprehensive

# 3. Preflight validation
npm run maf:preflight --fix

# 4. Acquire reservation for work
npm run maf:reservation acquire --file ./src/app.ts --agent developer-001

# 5. Perform work...

# 6. Release reservation
npm run maf:reservation release --file ./src/app.ts --agent developer-001

# 7. Audit check
npm run maf:audit-guard --bead-id feature-branch-123
```

### Development Workflow Example

```bash
# 1. Start development environment
npm run dev

# 2. Run preflight before making changes
npm run maf:preflight --check-only

# 3. Acquire reservation for files
npm run maf:reservation acquire --file ./lib/maf/runtime.ts --agent dev-001

# 4. Make changes...

# 5. Test changes
npm run test:maf-preflight

# 6. Release reservation
npm run maf:reservation release --file ./lib/maf/runtime.ts --agent dev-001

# 7. Commit changes (pre-commit hook will run)
git add .
git commit -m "Update runtime system"

# 8. If issues occur, escalate
npm run maf:escalate --agent-id dev-001 --error-context "Commit blocked by reservation" --bead-id feature-123
```

### Production Deployment Example

```bash
# 1. Pre-deployment checks
npm run maf:preflight --env production

# 2. Health verification
npm run maf:health-check --comprehensive

# 3. Create deployment reservation
npm run maf:reservation acquire --file ./package.json --agent deploy-001 --timeout 60

# 4. Deploy application...

# 5. Verify deployment
npm run maf:health-check --comprehensive

# 6. Run deployment audit
npm run maf:audit-guard --bead-id deploy-production --report

# 7. Release reservation
npm run maf:reservation release --file ./package.json --agent deploy-001

# 8. Monitor system
npm run maf:escalate-monitor --duration 300
```

### Emergency Response Example

```bash
# 1. Quick health check
npm run maf:health-check --comprehensive --json > health-status.json

# 2. Identify issues
npm run maf:preflight --check-only --verbose

# 3. Escalate if critical
npm run maf:escalate --agent-id on-call --error-context "System health degraded" --bead-id emergency-response --priority critical --target minimax-debug-1

# 4. Monitor escalation response
npm run maf:escalate-monitor --real-time

# 5. Generate incident report
npm run maf:audit-guard --report --days 1 --output incident-report.json
```

## Configuration Options

### Environment Variables

```bash
# Runtime configuration
export MAF_RUNTIME_MODE=sqlite,json
export MAF_AGENT_MAIL_ROOT=./.agent-mail
export NODE_ENV=development

# Database configuration
export MAF_DB_PATH=./.maf/runtime.db
export MAF_DB_TIMEOUT=30000

# Preflight configuration
export MAF_PREFLIGHT_TIMEOUT=30
export MAF_PREFLIGHT_RETRY_COUNT=3
export MAF_PREFLIGHT_PYTHON_CHECK=true
export MAF_PREFLIGHT_MCP_CHECK=true
export MAF_PREFLIGHT_ENV_CHECK=true

# Reservation configuration
export MAF_RESERVATION_DEFAULT_TIMEOUT=30
export MAF_RESERVATION_MAX_TIMEOUT=120
export MAF_RESERVATION_HOOK_MODE=strict

# Escalation configuration
export MAF_ESCALATION_DEFAULT_TARGET=minimax-debug-1
export MAF_ESCALATION_TIMEOUT=60
export MAF_ESCALATION_MAX_RETRIES=3

# Logging configuration
export LOG_LEVEL=info
export DEBUG=maf:*
export LOG_FILE=./logs/maf.log
```

### Configuration Files

#### maf-config.json

```json
{
  "runtime": {
    "mode": "sqlite",
    "databasePath": "./.maf/runtime.db",
    "fallbackModes": ["json", "memory"],
    "connectionPool": {
      "max": 10,
      "min": 2,
      "idleTimeout": 300000
    }
  },
  "preflight": {
    "enabled": true,
    "checks": {
      "python": {
        "enabled": true,
        "minVersion": "3.8.0",
        "requiredPackages": ["requests", "click"]
      },
      "mcp": {
        "enabled": true,
        "requiredConfigs": ["codex.json", "cursor.json", "gemini.json"]
      },
      "environment": {
        "enabled": true,
        "requiredVars": ["NODE_ENV", "MAF_AGENT_ID"]
      }
    },
    "timeout": 30,
    "retryCount": 3,
    "autoFix": false
  },
  "reservation": {
    "defaultTimeoutMinutes": 30,
    "maxTimeoutMinutes": 120,
    "conflictStrategy": "block",
    "precommitHook": {
      "enabled": true,
      "mode": "strict",
      "overrideEnvVar": "MAF_RESERVATION_OVERRIDE"
    }
  },
  "escalation": {
    "defaultPaths": ["default-escalation"],
    "targets": {
      "minimax-debug-1": {
        "enabled": true,
        "maxRetries": 3,
        "timeoutSeconds": 30,
        "endpoint": "/api/escalation/minimax-debug"
      },
      "codex-senior": {
        "enabled": true,
        "maxRetries": 2,
        "timeoutSeconds": 60,
        "endpoint": "/api/escalation/codex-senior"
      }
    }
  },
  "logging": {
    "level": "info",
    "file": "./logs/maf.log",
    "maxSize": "100MB",
    "maxFiles": 10
  }
}
```

### Command-Line Configuration

#### Global Options (Available on all commands)

```bash
--help                  Show help information
--version               Show version information
--verbose               Enable verbose logging
--quiet                 Suppress non-error output
--config PATH           Use specific configuration file
--env ENVIRONMENT       Override environment (development/staging/production)
--json                  Output in JSON format
--output PATH           Save output to file
--timeout SECONDS       Override default timeout
```

#### Preflight-Specific Options

```bash
--check-only            Run checks without attempting fixes
--fix                   Attempt to fix detected issues automatically
--validate-config       Validate configuration only
--report                Generate detailed report
--check-python          Run Python environment checks only
--check-mcp             Run MCP configuration checks only
--check-env             Run environment variable checks only
```

#### Reservation-Specific Options

```bash
--file PATH             Target file path
--agent ID              Agent identifier
--timeout MINUTES       Lease timeout in minutes
--force                 Force action (override existing restrictions)
--override              Enable override mode
```

#### Escalation-Specific Options

```bash
--agent-id ID           Agent identifier (required)
--error-context CONTEXT Error context description (required)
--bead-id ID            Bead identifier (required)
--target TARGET         Escalation target
--priority LEVEL        Priority level (low, medium, high, critical)
--context JSON          Additional context as JSON
--dry-run               Simulate escalation without sending
--level NUMBER          Escalation level
```

## Integration Examples

### Git Integration

#### Pre-commit Hook Integration

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run MAF preflight check
npm run maf:preflight --check-only
if [ $? -ne 0 ]; then
    echo "Preflight check failed. Please fix issues before committing."
    exit 1
fi

# Check reservations for staged files
STAGED_FILES=$(git diff --cached --name-only)
for file in $STAGED_FILES; do
    npm run maf:reservation check --file "$file"
    if [ $? -ne 0 ]; then
        echo "File $file has reservation conflict."
        exit 1
    fi
done

exit 0
```

#### Git Workflow Integration

```bash
# Feature branch workflow
git checkout -b feature/new-feature

# Acquire reservation for files to modify
npm run maf:reservation acquire --file ./src/component.ts --agent developer-001
npm run maf:reservation acquire --file ./tests/component.test.ts --agent developer-001

# Make changes...

# Test changes
npm run test

# Release reservations
npm run maf:reservation release --file ./src/component.ts --agent developer-001
npm run maf:reservation release --file ./tests/component.test.ts --agent developer-001

# Commit changes
git add .
git commit -m "Add new feature"

# Create pull request
# (CI/CD pipeline will run additional checks)
```

### CI/CD Integration

#### GitHub Actions Example

```yaml
# .github/workflows/maf-check.yml
name: MAF Preflight Check

on: [push, pull_request]

jobs:
  maf-check:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm install
      
    - name: Run MAF preflight
      run: npm run maf:preflight --check-only
      
    - name: Run MAF health check
      run: npm run maf:health-check --comprehensive --json
      
    - name: Run MAF audit
      run: npm run maf:audit-guard --checklist
```

#### Jenkins Pipeline Example

```groovy
pipeline {
    agent any
    
    stages {
        stage('MAF Preflight') {
            steps {
                sh 'npm install'
                sh 'npm run maf:preflight --check-only --json'
                archiveArtifacts artifacts: 'preflight-report.json'
            }
        }
        
        stage('MAF Health Check') {
            steps {
                sh 'npm run maf:health-check --comprehensive'
            }
        }
        
        stage('MAF Audit') {
            steps {
                sh 'npm run maf:audit-guard --checklist'
                archiveArtifacts artifacts: 'audit-report.json'
            }
        }
    }
    
    post {
        failure {
            sh 'npm run maf:escalate --agent-id jenkins --error-context "Pipeline failed" --bead-id ${env.BUILD_NUMBER}'
        }
    }
}
```

### IDE Integration

#### VS Code Integration

```json
// .vscode/tasks.json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "MAF Preflight Check",
            "type": "npm",
            "script": "maf:preflight",
            "args": ["--check-only"],
            "problemMatcher": []
        },
        {
            "label": "MAF Health Check",
            "type": "npm",
            "script": "maf:health-check",
            "problemMatcher": []
        },
        {
            "label": "MAF Acquire Reservation",
            "type": "npm",
            "script": "maf:reservation",
            "args": ["acquire", "--file", "${file}", "--agent", "vscode-${env:USER}"],
            "problemMatcher": []
        }
    ]
}
```

#### VS Code Keybindings

```json
// .vscode/keybindings.json
[
    {
        "key": "ctrl+alt+p",
        "command": "workbench.action.tasks.runTask",
        "args": "MAF Preflight Check"
    },
    {
        "key": "ctrl+alt+h",
        "command": "workbench.action.tasks.runTask",
        "args": "MAF Health Check"
    },
    {
        "key": "ctrl+alt+r",
        "command": "workbench.action.tasks.runTask",
        "args": "MAF Acquire Reservation"
    }
]
```

### Docker Integration

#### Dockerfile Example

```dockerfile
FROM node:18-alpine

# Install Python
RUN apk add --no-cache python3 py3-pip sqlite3

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create MAF directories
RUN mkdir -p .maf logs

# Set permissions
RUN chmod +x scripts/maf/*.sh scripts/maf/*.ts

# Initialize MAF system
RUN npm run maf:setup

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD npm run maf:health-check --comprehensive

CMD ["npm", "start"]
```

#### Docker Compose Example

```yaml
# docker-compose.yml
version: '3.8'

services:
  maf-preflight:
    build: .
    environment:
      - NODE_ENV=production
      - MAF_RUNTIME_MODE=sqlite
      - MAF_DB_PATH=/data/runtime.db
    volumes:
      - ./data:/data
      - ./logs:/app/logs
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "npm", "run", "maf:health-check", "--comprehensive"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Troubleshooting CLI Issues

### Common Error Messages

#### Preflight Check Failures

```
ERROR: Python version 3.7.0 is below minimum required 3.8.0
```

**Solution:**
```bash
# Check Python version
python3 --version

# Install correct version (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install python3.8 python3.8-pip

# Update alternatives
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 1
```

```
ERROR: MCP configuration files not found
```

**Solution:**
```bash
# Check configuration directories
ls -la ~/.config/codex/
ls -la ~/.config/cursor/
ls -la ~/.config/gemini/

# Create placeholder configs for testing
mkdir -p ~/.config/codex
echo '{"test": true}' > ~/.config/codex/config.json
```

#### Reservation Issues

```
ERROR: Unable to acquire lease for file
ERROR: File is already leased by another agent
```

**Solution:**
```bash
# Check current leases
npm run maf:reservation list --verbose

# Check specific file
npm run maf:reservation check --file /path/to/file --verbose

# Force release (emergency only)
npm run maf:reservation release --file /path/to/file --force

# Override reservation (document reason)
MAF_RESERVATION_OVERRIDE=true npm run maf:reservation acquire --file /path/to/file --agent emergency-agent
```

#### Escalation Issues

```
WARNING: Escalation delivery failed
ERROR: Unable to connect to escalation target
```

**Solution:**
```bash
# Test escalation connectivity
npm run maf:escalate -- --dry-run --target minimax-debug-1

# Check network connectivity
npm run maf:health-check --network-only

# Verify configuration
npm run maf:preflight --validate-config
```

#### Database Issues

```
ERROR: Database is locked
ERROR: Unable to acquire database connection
```

**Solution:**
```bash
# Check for running processes
ps aux | grep maf

# Kill stuck processes
pkill -f "maf.*runtime"

# Restart database connections
npm run maf:restart-db

# Check database integrity
sqlite3 .maf/runtime.db "PRAGMA integrity_check;"
```

### Debug Mode

#### Enable Debug Logging

```bash
# Enable verbose logging
export DEBUG=maf:*
export LOG_LEVEL=debug

# Run command with debug output
npm run maf:preflight --verbose

# Check debug logs
tail -f logs/maf.log | grep DEBUG
```

#### Diagnostic Commands

```bash
# System diagnostics
npm run maf:health-check --comprehensive --output diagnosis.json

# Database diagnostics
npm run maf:health-check --database-only --verbose

# Configuration diagnostics
npm run maf:preflight --validate-config --verbose

# Network diagnostics
npm run maf:health-check --network-only --verbose
```

#### Log Analysis

```bash
# Recent errors
tail -f logs/maf.log | grep -i error

# Performance issues
grep "slow query" logs/maf.log | tail -10

# Database connection issues
grep "database" logs/maf.log | grep -i error | tail -10

# Reservation conflicts
grep "reservation conflict" logs/maf.log | tail -20
```

## Advanced Usage

### Custom Scripts

#### Batch Operations

```bash
#!/bin/bash
# batch-reservation.sh

# Acquire reservations for multiple files
files=("src/app.ts" "src/components/" "tests/")
agent="batch-agent-$USER"

for file in "${files[@]}"; do
    echo "Acquiring reservation for $file..."
    npm run maf:reservation acquire --file "$file" --agent "$agent"
    if [ $? -eq 0 ]; then
        echo "Successfully acquired reservation for $file"
    else
        echo "Failed to acquire reservation for $file"
        exit 1
    fi
done

echo "All reservations acquired successfully"
```

#### Automated Health Monitoring

```bash
#!/bin/bash
# health-monitor.sh

LOG_FILE="health-monitor-$(date +%Y%m%d).log"

while true; do
    echo "[$(date)] Running health check..." >> $LOG_FILE
    
    npm run maf:health-check --comprehensive --json > health-status.json 2>&1
    
    # Check for issues
    if [ $? -ne 0 ]; then
        echo "[$(date)] Health check failed!" >> $LOG_FILE
        
        # Escalate if configured
        npm run maf:escalate --agent-id health-monitor \
            --error-context "Automated health check failed" \
            --bead-id "health-$(date +%s)" \
            --priority medium
    fi
    
    # Wait before next check
    sleep 300  # 5 minutes
done
```

### Performance Monitoring

#### Performance Testing Script

```bash
#!/bin/bash
# performance-test.sh

echo "Starting performance test at $(date)"

# Baseline measurement
echo "Measuring baseline performance..."
npm run maf:preflight --timeout 60 > baseline.json

# Load test
echo "Running load test..."
for i in {1..10}; do
    echo "Test run $i..."
    npm run maf:preflight --timeout 30
done

# Stress test
echo "Running stress test..."
for i in {1..50}; do
    npm run maf:preflight --timeout 15 &
done

wait

echo "Performance test completed at $(date)"
```

### Custom Configuration Templates

#### Development Configuration

```json
{
  "runtime": {
    "mode": "sqlite,json",
    "databasePath": "./.maf/runtime-dev.db"
  },
  "preflight": {
    "enabled": true,
    "autoFix": true,
    "timeout": 60
  },
  "logging": {
    "level": "debug",
    "console": true
  }
}
```

#### Production Configuration

```json
{
  "runtime": {
    "mode": "sqlite",
    "databasePath": "/var/lib/maf/runtime.db",
    "connectionPool": {
      "max": 20,
      "min": 5
    }
  },
  "preflight": {
    "enabled": true,
    "autoFix": false,
    "timeout": 30
  },
  "reservation": {
    "defaultTimeoutMinutes": 15,
    "maxTimeoutMinutes": 60
  },
  "logging": {
    "level": "info",
    "console": false,
    "file": "/var/log/maf/maf.log"
  }
}
```

### Integration with Other Tools

#### Slack Integration

```bash
#!/bin/bash
# slack-notify.sh

WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

send_slack_notification() {
    local message=$1
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"$message\"}" \
        $WEBHOOK_URL
}

# Monitor for failures
npm run maf:preflight --check-only
if [ $? -ne 0 ]; then
    send_slack_notification "MAF Preflight check failed on $(hostname)"
fi
```

#### Email Integration

```bash
#!/bin/bash
# email-alert.sh

EMAIL_RECIPIENT="ops@company.com"
SUBJECT="MAF System Alert"

send_email_alert() {
    local message=$1
    echo "$message" | mail -s "$SUBJECT" $EMAIL_RECIPIENT
}

# Monitor system health
npm run maf:health-check --comprehensive --json > health-report.json
if [ $? -ne 0 ]; then
    send_email_alert "MAF health check failed. See attached report."
    mail -s "$SUBJECT" -a health-report.json $EMAIL_RECIPIENT < /dev/null
fi
```

---

**Generated**: 2025-11-13  
**Version**: 1.0.0  
**Author**: Claude Code Documentation Specialist  
**Last Updated**: 2025-11-13
