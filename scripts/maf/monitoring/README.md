# MAF Health Monitoring & Log Aggregation System

This comprehensive monitoring system provides health monitoring, log collection, and alerting capabilities for the MAF (Multi-Agent Framework) tmux orchestration system.

## Overview

The monitoring system consists of several components that work together to provide complete visibility into the health and performance of your MAF deployment:

### Core Components

1. **Health Monitor Daemon** (`health-monitor.sh`) - Continuous monitoring of agents, sessions, and system resources
2. **Agent Health** (`agent-health.sh`) - Individual agent health checks and diagnostics
3. **Session Health** (`session-health.sh`) - Session integrity and tmux monitoring
4. **System Health** (`system-health.sh`) - System resource and dependency monitoring
5. **Log Collector** (`log-collector.sh`) - Centralized log collection and management
6. **Log Rotation** (`log-rotate.sh`) - Log file rotation, compression, and archiving
7. **Integration Interface** (`monitoring-integration.sh`) - Unified interface to all components

## Configuration

The monitoring system is configured via `monitoring-config.json`:

```json
{
  "monitoring": {
    "enabled": true,
    "health_check_interval_seconds": 30,
    "resource_monitoring_interval_seconds": 60,
    "log_collection_interval_seconds": 15,
    "max_log_file_size_mb": 50,
    "log_retention_days": 7,
    "alert_thresholds": {
      "cpu_usage_percent": 80,
      "memory_usage_percent": 85,
      "disk_space_percent": 90,
      "agent_response_timeout_seconds": 120,
      "session_stale_minutes": 30,
      "error_rate_threshold": 5
    }
  },
  "logging": {
    "level": "info",
    "structured_format": true,
    "centralized_logs": true,
    "compression_enabled": true
  }
}
```

## Quick Start

### 1. Initial Setup

```bash
# Make scripts executable
chmod +x scripts/maf/monitoring/*.sh

# Check system dependencies
./scripts/maf/monitoring/system-health.sh deps

# Verify MAF structure
./scripts/maf/monitoring/system-health.sh full
```

### 2. Start Monitoring

```bash
# Start the health monitoring daemon
./scripts/maf/monitoring/health-monitor.sh start

# Or use the integration interface
./scripts/maf/monitoring/monitoring-integration.sh health start
```

### 3. Check Status

```bash
# Show overall monitoring status
./scripts/maf/monitoring/monitoring-integration.sh status

# Check all agents health
./scripts/maf/monitoring/monitoring-integration.sh agent check

# Analyze all sessions
./scripts/maf/monitoring/monitoring-integration.sh session analyze
```

## Usage Guide

### Health Monitoring

#### Start/Stop Health Monitor Daemon
```bash
# Start monitoring daemon
./scripts/maf/monitoring/health-monitor.sh start

# Stop monitoring daemon  
./scripts/maf/monitoring/health-monitor.sh stop

# Check daemon status
./scripts/maf/monitoring/health-monitor.sh status

# Run one-time health check
./scripts/maf/monitoring/health-monitor.sh check
```

#### Agent Health Checks
```bash
# Quick health check of all agents
./scripts/maf/monitoring/agent-health.sh all

# Detailed health check for specific agent
./scripts/maf/monitoring/agent-health.sh check <agent_id> detailed

# Monitor agent performance (5 minutes)
./scripts/maf/monitoring/agent-health.sh monitor <agent_id> 5

# Run full diagnostics for agent
./scripts/maf/monitoring/agent-health.sh diagnose <agent_id>
```

#### Session Health Monitoring
```bash
# Analyze all MAF sessions
./scripts/maf/monitoring/session-health.sh analyze

# Check session windows
./scripts/maf/monitoring/session-health.sh windows [agent_id]

# Monitor session resources
./scripts/maf/monitoring/session-health.sh resources [agent_id] [minutes]

# Cleanup problematic sessions (dry run)
./scripts/maf/monitoring/session-health.sh cleanup dry

# Cleanup problematic sessions (live)
./scripts/maf/monitoring/session-health.sh cleanup live true true
```

#### System Health Monitoring
```bash
# Check system resources
./scripts/maf/monitoring/system-health.sh resources

# Check system dependencies
./scripts/maf/monitoring/system-health.sh deps

# Full system health check
./scripts/maf/monitoring/system-health.sh full
```

### Log Management

#### Log Collection
```bash
# Collect logs from all sources
./scripts/maf/monitoring/log-collector.sh collect

# Show collection status
./scripts/maf/monitoring/log-collector.sh status

# Search logs for term
./scripts/maf/monitoring/log-collector.sh search "error" agents
```

#### Log Rotation
```bash
# Rotate log files with defaults
./scripts/maf/monitoring/log-rotate.sh rotate

# Custom rotation settings
./scripts/maf/monitoring/log-rotate.sh rotate 100 10 30 live

# Show log statistics
./scripts/maf/monitoring/log-rotate.sh stats

# Dry run to see what would be rotated
./scripts/maf/monitoring/log-rotate.sh dry-run
```

### Integration Interface

The integration interface provides a unified way to interact with all monitoring components:

```bash
# Health monitoring
./scripts/maf/monitoring/monitoring-integration.sh health start|stop|status|check

# Agent health
./scripts/maf/monitoring/monitoring-integration.sh agent check|detailed|monitor

# Session health
./scripts/maf/monitoring/monitoring-integration.sh session analyze|windows|resources|cleanup

# System health
./scripts/maf/monitoring/monitoring-integration.sh system resources|deps|full

# Log management
./scripts/maf/monitoring/monitoring-integration.sh logs collect|status|search

# Log rotation
./scripts/maf/monitoring/monitoring-integration.sh rotate rotate|stats|dry-run

# Overall status
./scripts/maf/monitoring/monitoring-integration.sh status
```

## Directory Structure

```
.maf/
├── monitoring/                    # Monitoring data and configuration
│   ├── health-status.json       # Current health status
│   ├── metrics.json            # System metrics
│   ├── alerts.json             # Active alerts
│   └── monitoring.log          # Monitoring system logs
├── logs/                       # Log files
│   ├── agents/                 # Agent-specific logs
│   ├── sessions/               # Session logs
│   └── system/                 # System logs
├── centralized-logs/           # Centralized log collection
│   ├── agents/                 # Collected agent logs
│   ├── sessions/               # Collected session logs
│   ├── system/                 # Collected system logs
│   └── agent-mail/             # Agent mail logs
└── logs/archived/              # Archived old logs
```

## Health Checks

The monitoring system performs the following health checks:

### Agent Health
- Agent registry presence
- Tmux session existence and responsiveness
- Log file availability and recent activity
- Resource usage (CPU, memory)
- Task completion statistics

### Session Health  
- Tux session integrity
- Window status and responsiveness
- Session age and staleness
- Orphaned session detection
- Resource utilization

### System Health
- CPU, memory, and disk usage
- System dependencies (Node.js, npm, git, tmux, jq)
- Network connectivity
- MAF project structure validation
- MAF CLI functionality

## Alerts and Notifications

The monitoring system generates alerts for various conditions:

### Critical Alerts
- Agent session not found
- High disk usage (>90%)
- Missing system dependencies
- MAF structure corruption

### Warning Alerts  
- Agent unresponsive
- High CPU/memory usage (>80%/85%)
- Stale sessions (>30 minutes)
- Network connectivity issues

### Alert Management
Alerts are stored in `alerts.json` and include:
- Alert ID and timestamp
- Severity level (critical, warning, info)
- Component and message
- Detailed context information

## Log Collection and Management

### Collection Sources
- **Agent Logs**: Individual agent output and error logs
- **Session Logs**: Real-time tmux session output
- **System Logs**: MAF system logs and monitoring data
- **Agent Mail Logs**: Agent mail system communication logs

### Collection Features
- Automatic log collection from all sources
- Incremental updates based on file modification time
- Centralized storage for easy access and searching
- Configurable collection intervals
- Support for compressed logs

### Log Rotation
- Size-based rotation (default: 50MB max file size)
- Configurable retention periods (default: 7 days)
- Automatic compression of old logs
- Archive management and cleanup

## Performance Considerations

### Resource Usage
- Health monitoring daemon: ~10MB RAM, minimal CPU
- Log collection: Moderate I/O during collection cycles
- Configuration tuning available for resource-constrained environments

### Scalability
- Tested with 50+ concurrent agents
- Efficient log processing with minimal system impact
- Configurable check intervals for different deployment sizes

## Troubleshooting

### Common Issues

1. **Monitoring daemon won't start**
   ```bash
   # Check system dependencies
   ./scripts/maf/monitoring/system-health.sh deps
   
   # Verify MAF structure
   ./scripts/maf/monitoring/system-health.sh full
   ```

2. **Agent health checks failing**
   ```bash
   # Check agent registry
   cat .maf/agents.json
   
   # Verify session exists
   tmux list-sessions | grep maf-agent
   ```

3. **Log collection not working**
   ```bash
   # Check log directories
   ls -la .maf/logs/
   
   # Test collection manually
   ./scripts/maf/monitoring/log-collector.sh collect
   ```

### Debug Mode
Enable debug logging by setting environment variable:
```bash
export DEBUG_MODE=true
./scripts/maf/monitoring/health-monitor.sh check
```

## Integration with External Systems

### Monitoring Data Export
Health status and metrics are available in JSON format:
- `.maf/monitoring/health-status.json`
- `.maf/monitoring/metrics.json` 
- `.maf/monitoring/alerts.json`

### Log Integration
Centralized logs can be integrated with external log management systems:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk
- Graylog
- Custom monitoring solutions

### API Integration
Health status can be accessed programmatically for integration with:
- Monitoring dashboards
- Alerting systems (PagerDuty, OpsGenie)
- ChatOps platforms (Slack, Microsoft Teams)

## Security Considerations

- Log files may contain sensitive information
- Monitor file permissions and access controls
- Regular log rotation and archival recommended
- Consider encryption for log storage in production environments

## Contributing

When extending the monitoring system:

1. Follow existing patterns and error handling
2. Update configuration schema as needed
3. Add appropriate logging and structured output
4. Test with various MAF deployment sizes
5. Update documentation for new features

## Support

For issues or questions about the monitoring system:

1. Check this README and individual script help
2. Run system health checks: `./system-health.sh full`
3. Review logs in `.maf/monitoring/monitoring.log`
4. Create detailed issue reports with system information
