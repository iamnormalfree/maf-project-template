# MAF Tmux Orchestration System

## Overview

The MAF (Multi-Agent Framework) tmux orchestration system provides core infrastructure libraries for managing AI agents in tmux sessions. This modular, configuration-driven approach enables seamless integration with NextNest's existing MAF coordinator CLI and agent-mail system.

## System Dependencies

**Required dependencies for the MAF orchestration system:**

- **tmux** (3.0+) - Terminal multiplexer for session management
- **jq** (1.6+) - JSON processor for configuration parsing
- **git** - Version control integration
- **Node.js** (18+) - JavaScript runtime for MAF CLI
- **npm** - Package manager

**Installation Commands:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install tmux jq git

# macOS (using Homebrew)
brew install tmux jq git

# Verify all dependencies are installed
npm run maf:health-check

# Detailed system diagnosis
npm run maf:diagnose
```

**Dependency Validation:**
All MAF scripts automatically validate these dependencies before execution and will provide clear error messages with installation instructions if any are missing.

## Core Libraries

### 1. Error Handling Library (`lib/error-handling.sh`)

**Purpose**: Centralized error handling, validation, and logging utilities with NextNest-consistent patterns.

**Key Features**:
- Comprehensive logging with color-coded output
- System prerequisites validation (Node.js, npm, git, tmux)
- Health checks for basic and full system validation
- Cleanup and recovery functions
- Performance monitoring capabilities
- Log rotation and management
- Configuration loading and validation

**Usage**:
```bash
# Validate system prerequisites
bash scripts/maf/lib/error-handling.sh validate

# Run comprehensive health check
bash scripts/maf/lib/error-handling.sh health

# Clean up temporary files and stale sessions
bash scripts/maf/lib/error-handling.sh cleanup

# Rotate log files
bash scripts/maf/lib/error-handling.sh rotate-logs 10 5
```

### 2. Tmux Utilities Library (`lib/tmux-utils.sh`)

**Purpose**: Core tmux session management utilities for agent orchestration.

**Key Features**:
- Tmux installation and version validation
- Session creation and management
- Window and pane setup for different agent types
- Command sending and output capture
- Session status monitoring
- Graceful shutdown and cleanup
- Multi-layout support for different agent workflows

**Supported Agent Types**:
- **claude-worker**: Development workspace with monitoring, git, and test windows
- **codex-reviewer**: Code analysis environment with review and linting windows  
- **claude-committer**: Git management workspace with staging and history windows
- **Multiple Codex Accounts**: Define one agent entry per ChatGPT Plus account and set `CODEX_PROFILE` in each agent’s env block so rate limits stay isolated (e.g., `codex-plus-1`, `codex-plus-2`).

**Usage**:
```bash
# Initialize tmux environment
bash scripts/maf/lib/tmux-utils.sh init

# List all MAF agent sessions
bash scripts/maf/lib/tmux-utils.sh list

# Validate tmux installation
bash scripts/maf/lib/tmux-utils.sh validate
```

### 3. Agent Utilities Library (`lib/agent-utils.sh`)

**Purpose**: Agent environment setup and lifecycle management with MAF CLI integration.

**Key Features**:
- Agent type validation and registration
- Session creation with type-specific configurations
- Agent registry management (JSON-based)
- Health monitoring and statistics
- Integration with existing MAF CLI commands
- Resource usage tracking
- Environment variable management

**Agent Registry**: Maintains agent state in `.maf/agents.json` with metadata including:
- Agent ID, type, and description
- Session associations
- Creation timestamps and status
- Task completion statistics
- Error tracking

**Usage**:
```bash
# List all registered agents
bash scripts/maf/lib/agent-utils.sh list

# Create a new agent
bash scripts/maf/lib/agent-utils.sh create claude-worker

# Start an existing agent
bash scripts/maf/lib/agent-utils.sh start <agent-id>

# Stop an agent
bash scripts/maf/lib/agent-utils.sh stop <agent-id>

# Delete an agent
bash scripts/maf/lib/agent-utils.sh delete <agent-id>

# Run health check
bash scripts/maf/lib/agent-utils.sh health
```

## Integration Points

### MAF CLI Integration

The system integrates with existing NextNest MAF commands:
- `npm run maf:claim-task` - Task claiming for agents
- `npm run maf:health-check` - System health validation
- `npm run maf:bootstrap-agent-mail` - Agent mail system setup

### Agent Mail System

Supports the Python-based MCP server in `mcp_agent_mail/` for:
- Agent communication and coordination
- Task distribution and result collection
- Cross-agent messaging

### Beads Workflow Integration

Compatible with existing Beads CLI for:
- Task discovery and assignment
- Workflow orchestration
- Constraint-based task routing

## Configuration Files

### `.maf/agents.json`
Agent registry with metadata and state tracking.

### `.maf/agent.env`
Environment variables available to all agent sessions:
```bash
export PROJECT_ROOT="<project-root>"
export NODE_ENV="development"
export MAF_LOG_LEVEL="info"
export ENABLE_AGENT_MAIL="true"
export ENABLE_BEADS_INTEGRATION="true"
```

### `.maf/tmux.conf`
Tmux configuration optimized for multi-agent development:
- Enhanced scrollback and mouse support
- Custom status bar with MAF branding
- Agent-friendly key bindings
- Performance optimizations

## Directory Structure

```
.maf/
├── agents.json          # Agent registry
├── agent.env            # Environment variables
├── tmux.conf           # Tmux configuration
├── logs/
│   ├── error.log       # Error handling logs
│   └── agents/         # Per-agent logging
└── config/             # Configuration files
```

## Quick Start

1. **Initialize Environment**:
   ```bash
   bash scripts/maf/lib/error-handling.sh validate
   bash scripts/maf/lib/tmux-utils.sh init
   ```

2. **Create First Agent**:
   ```bash
   bash scripts/maf/lib/agent-utils.sh create claude-worker
   ```

3. **Monitor System**:
   ```bash
   bash scripts/maf/lib/agent-utils.sh health
   bash scripts/maf/lib/tmux-utils.sh list
   ```

4. **Run Tasks**:
   ```bash
   # Send MAF command to agent
   source scripts/maf/lib/agent-utils.sh
   run_maf_command <agent-id> "npm run maf:claim-task"
   ```

## Testing

### Comprehensive Test Suite
```bash
# Run full integration test
bash scripts/maf/test-tmux-orchestration.sh
```

### Simple Demo
```bash
# Run basic functionality demo
bash scripts/maf/demo-tmux-orchestration.sh
```

## Error Handling

The system implements robust error handling with:
- Graceful degradation when dependencies are missing
- Detailed error logging with context and stack traces
- Automatic cleanup of orphaned sessions and files
- Recovery procedures for common failure scenarios

## Performance Considerations

- **Resource Monitoring**: Track CPU and memory usage per agent
- **Session Limits**: Configurable limits on concurrent agents
- **Log Rotation**: Automatic log management to prevent disk overflow
- **Cleanup Policies**: Automatic cleanup of stale resources

## Security

- **Session Isolation**: Each agent runs in isolated tmux sessions
- **Environment Control**: Controlled environment variable exposure
- **Access Logging**: Comprehensive logging of all agent activities
- **Cleanup on Exit**: Automatic resource cleanup on agent termination

## Contributing

When extending the system:

1. **Follow Patterns**: Use established error handling and logging patterns
2. **Update Registry**: Extend agent registry schema for new agent types
3. **Add Tests**: Include tests for new functionality
4. **Document**: Update this README with new features

## Troubleshooting

### Common Issues

1. **tmux not found**: Install with `sudo apt-get install tmux`
2. **jq not found**: Install with `sudo apt-get install jq`
3. **Session creation fails**: Check tmux server status with `tmux list-sessions`
4. **Agent registration fails**: Check `.maf/agents.json` permissions

### Debug Mode

Enable debug logging:
```bash
DEBUG_MODE=true bash scripts/maf/lib/agent-utils.sh create claude-worker
```

### Log Analysis

Check error logs:
```bash
tail -f .maf/logs/error.log
```

Agent-specific logs:
```bash
ls -la .maf/logs/agents/
```

## License


## Codex Quota Management

The MAF system includes comprehensive Codex quota management for tracking API usage across multiple profiles and accounts. This system provides real-time monitoring, automatic profile rotation, and intelligent quota enforcement.

### Overview

**Key Features:**
- **Multi-Account Support**: Manage multiple Claude API profiles with individual quota tracking
- **Rolling Window Tracking**: 5-hour rolling windows for granular usage monitoring  
- **Automatic Profile Rotation**: Switch profiles when quota limits are approached
- **Real-time Monitoring**: tmux integration with color-coded health indicators
- **Persistent State Tracking**: File-based quota state that survives system restarts
- **CLI Integration**: Seamless integration with existing MAF claim-task workflow

### Configuration

**Enable quota management in `.maf/config/default-agent-config.json`:**
```json
{
  "codex_profiles": {
    "enable": true,
    "default_profile": "claude-sonnet-4",
    "selection": {
      "algorithm": "round-robin",
      "enforce_rate_limit": true,
      "fallback_priority": 5
    },
    "rotation_monitoring": 5,
    "max_rotation_attempts": 3
  },
  "profiles": {
    "codex-plus-1": {
      "name": "ChatGPT Plus Account 1",
      "priority": 1,
      "quota_limits": {
        "daily": 1000,
        "weekly": 5000,
        "monthly": 20000
      },
      "quota_tracking_enabled": true,
      "active": true,
      "environment": {
        "CODEX_PROFILE": "codex-plus-1"
      }
    },
    "codex-plus-2": {
      "name": "ChatGPT Plus Account 2", 
      "priority": 2,
      "quota_limits": {
        "daily": 1000,
        "weekly": 5000,
        "monthly": 20000
      },
      "quota_tracking_enabled": true,
      "active": true,
      "environment": {
        "CODEX_PROFILE": "codex-plus-2"
      }
    }
  }
}
```

**Monitoring configuration in `scripts/maf/monitoring/monitoring-config.json`:**
```json
{
  "monitoring": {
    "codex_quota": {
      "enabled": true,
      "status_update_interval_seconds": 30,
      "quota_thresholds": {
        "warning_percent": 50,
        "critical_percent": 90,
        "emergency_percent": 95
      },
      "cache_ttl_seconds": 30
    }
  }
}
```

### CLI Commands

**Quota Monitoring:**
```bash
# Show current quota status in tmux format
npm run maf:status

# Continuous quota monitoring 
npm run maf:quota-monitor

# Compact quota status for quick checks
npm run maf:quota-alerts

# Direct quota status with custom formatting
node scripts/maf/monitoring/quota-status.mjs --format compact
node scripts/maf/monitoring/quota-status.mjs --continuous
node scripts/maf/monitoring/quota-status.mjs --format json
```

**Task Claiming with Automatic Profile Management:**
```bash
# Claim task - automatically selects best available profile
npm run maf:claim-task -- --agent claude-pair-1

# Claim task with specific profile (bypasses quota checks)
CODEX_PROFILE=codex-plus-1 npm run maf:claim-task -- --agent claude-pair-1

# Dry run to see profile selection without claiming
npm run maf:claim-task -- --agent claude-pair-1 --dry-run --json
```

### tmux Integration

The quota monitoring system integrates directly with tmux orchestration sessions:

**Real-time Status Display:**
```
[CODEX QUOTA] Profile: codex-plus-1 | Usage: 65% (650/1000) | Window: 1h | Reset: 35m | Status: 🟡 OK
[PROFILES] Active: 2/2 | Rotation: Auto | Next: codex-plus-2 | Current: codex-plus-1
```

**Health Indicators:**
- 🟢 **Healthy**: < 50% usage
- 🟡 **Warning**: 50-75% usage  
- 🟠 **Alert**: 75-90% usage
- 🔴 **Critical**: > 90% usage
- 🚨 **Emergency**: > 95% usage

### Profile Management

**Creating New Profiles:**
```bash
# Create new profile configuration
bash scripts/maf/config/create-codex-profile.sh codex-plus-3

# Edit configuration manually
nano .maf/config/default-agent-config.json
```

**Profile Selection Algorithm:**
1. **Rate Limit Check**: Exclude profiles exceeding quota limits
2. **Priority Order**: Select highest priority active profile
3. **Round-Robin**: Rotate through available profiles
4. **Fallback**: Use fallback profile if all others exhausted

### Environment Variables

**Quota Management Variables:**
```bash
# Core quota settings
MAF_QUOTA_ENFORCEMENT=true           # Enable quota enforcement
CODEX_PROFILE=codex-plus-1          # Force specific profile
QUOTA_CACHE_TTL=30                  # Cache TTL in seconds

# Debug and monitoring
DEBUG_QUOTA=true                    # Enable quota debug logs
QUOTA_STATUS_FORMAT=compact         # Status display format
```

### State Management

**Quota State Storage:**
- **Location**: `.maf/monitoring/quota-state.json`
- **Format**: JSON with rolling windows and event history
- **Persistence**: Automatic sync after each request
- **Backup**: Automatic backup creation before changes

**State Structure:**
```json
{
  "profileName": "codex-plus-1",
  "limits": {
    "daily": 1000,
    "weekly": 5000,
    "monthly": 20000
  },
  "status": {
    "daily": { "used": 650, "percentage": 65 },
    "weekly": { "used": 3200, "percentage": 64 },
    "health": "warning",
    "healthEmoji": "🟡"
  },
  "rollingWindows": [
    {
      "start": 1699642800000,
      "end": 1699660800000,
      "requests": 127,
      "durationHours": 5
    }
  ],
  "events": [
    {
      "id": "req_001",
      "type": "request",
      "timestamp": 1699651234567,
      "requestDetails": {
        "model": "claude-sonnet-4-5",
        "tokens": 1500
      }
    }
  ]
}
```

### Troubleshooting Quota Issues

**Common Problems:**

1. **Profile Not Available for Selection**
   ```bash
   # Check profile status
   node scripts/maf/monitoring/quota-status.mjs --format json
   
   # Verify profile configuration
   cat .maf/config/default-agent-config.json | jq '.profiles'
   
   # Check quota state
   cat .maf/monitoring/quota-state.json
   ```

2. **Quota Not Resetting**
   ```bash
   # Force quota refresh
   node scripts/maf/monitoring/quota-status.mjs --force-refresh
   
   # Check time zone and window calculations
   node scripts/maf/monitoring/quota-status.mjs --format json | jq '.[].status.windowStart'
   ```

3. **Profile Rotation Not Working**
   ```bash
   # Check selection algorithm
   cat .maf/config/default-agent-config.json | jq '.codex_profiles.selection'
   
   # Verify all profiles are active
   cat .maf/config/default-agent-config.json | jq '.profiles | to_entries | map(select(.value.active == false))'
   ```

**Debug Mode:**
```bash
# Enable debug logging for quota operations
DEBUG_QUOTA=true npm run maf:claim-task -- --agent claude-pair-1 --verbose

# Monitor quota state changes
watch -n 5 'cat .maf/monitoring/quota-state.json | jq ".[].status"'
```

### Performance Considerations

**Optimization Features:**
- **30-Second Cache**: Quota status cached for 30 seconds to reduce API calls
- **TypeScript Integration**: Quota enforcement uses ES modules with tsx transpilation

**Module System Note:**
The quota enforcement system uses TypeScript ES modules under `lib/maf/profiles/`. The CLI integration works with `tsx` for transpilation-on-the-fly, but direct Node.js `require()` calls to these modules would need a build step or ts-node conversion. This is intentional - the system prioritizes TypeScript development experience while ensuring CLI functionality through `tsx`.
- **Batch Processing**: Multiple requests aggregated for efficiency
- **Incremental Updates**: Only changed data synced to storage
- **Memory Management**: Event log automatically trimmed to prevent memory leaks

**Resource Usage:**
- **Memory**: ~5MB for quota state with 1000 events
- **Storage**: ~1MB for full quota state with rolling windows
- **CPU**: Minimal impact with caching and batch optimization

### Integration with Agent Mail

Quota status automatically shared with agent mail system:
- Profile rotation events broadcast to all agents
- Quota alerts included in agent health checks
- Cross-agent coordination for quota-aware task distribution

### Context Manager Service

Run the tmux context manager as a systemd service so it survives reboots:

```bash
# Install + start (requires sudo)
scripts/maf/manage-context-manager.sh install

# Check status/logs
scripts/maf/manage-context-manager.sh status
scripts/maf/manage-context-manager.sh logs
```

The service uses `.maf/config/context-manager.env` for defaults like `MAF_TMUX_SESSION`.

### Targeted Broadcast Flow

The Telegram bot now drafts targeted prompts for supervisor approval:

```text
/broadcast-pack             # Show/set the active prompt pack (plan-specific prompts)
/broadcast-targeted         # Draft prompts + notify supervisor
/broadcast-targeted auto    # Send prompts immediately
/broadcast-apply            # Send last drafted prompts
/broadcast-cancel           # Discard pending draft
```

Prompt packs
- Store plan-specific label preferences + guardrails + test commands in `scripts/maf/prompt-packs/*.json`.
- Set the active pack via Telegram: `/broadcast-pack set <name>` (example: `/broadcast-pack set roundtable-jlh`).

Review nudges (single-pane; no full broadcast)
```text
/review <bead-id>           # Send review request + bead notes to reviewer (Agent Mail) and nudge reviewer pane
/reviewer <message>         # Send a short note to reviewer (Agent Mail) and nudge reviewer pane
```


## License

This orchestration system is part of the NextNest project and follows the same licensing terms.
