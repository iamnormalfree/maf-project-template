# MAF Agent Configuration

This directory contains configuration files for the MAF (Multi-Agent Framework) tmux orchestration system.

## Files

- `default-agent-config.json` - Main configuration file defining agent types, session layouts, and integration settings
- `agent-config-schema.json` - JSON schema for validating configuration files
- `README.md` - This documentation file

## Configuration Structure

The configuration is organized into several main sections:

### Agent Types

Defines different types of agents with their capabilities, resource limits, and environment variables:

- **claude-worker**: Standard Claude AI worker for development tasks
- **claude-committer**: Specialized for git operations and workflow automation
- **codex-reviewer**: Code review and analysis specialist
- **coordinator**: Session monitoring and orchestration

### Session Layouts

Predefined tmux session layouts for different scenarios:

- **default_4_pane**: Standard layout with coordinator, 2 workers, and reviewer
- **focused_3_pane**: Focused layout for single agent work
- **minimal_2_pane**: Lightweight layout for simple tasks

### Integration Settings

Configuration for external integrations:

- **npm_scripts**: NPM script mappings for MAF commands
- **agent_mail**: Agent mail system integration
- **beads_workflow**: Beads task management integration
- **git_workflow**: Git workflow automation

### Monitoring & Performance

Settings for health monitoring, resource tracking, and performance optimization.

### Security

Security settings including agent isolation, authentication, and audit logging.

## Usage

The configuration is automatically loaded by the MAF tmux orchestration system. To customize:

1. Copy `default-agent-config.json` to create your own configuration
2. Modify settings as needed
3. Use your configuration file when starting MAF sessions

## Validation

Use the JSON schema to validate configuration files:

```bash
# Install ajv-cli if needed
npm install -g ajv-cli

# Validate configuration
ajv validate -s agent-config-schema.json -d your-config.json
```

## Integration Points

The configuration integrates with:

- **MAF CLI**: `lib/maf/cli/index.js`
- **Agent Utils**: `scripts/maf/lib/agent-utils.sh`
- **Tmux Utils**: `scripts/maf/lib/tmux-utils.sh`
- **Beads Workflow**: `lib/maf/beads/cli.ts`
- **Agent Mail**: `mcp_agent_mail/`

## Environment Variables

Each agent type can define custom environment variables. Standard variables include:

- `MAF_AGENT_TYPE`: Type of the agent
- `CLAUDE_MODEL`: AI model to use
- `NODE_ENV`: Node.js environment
- `PROJECT_ROOT`: Project root directory

## Resource Limits

Configure resource limits for each agent type to prevent resource exhaustion:

- `cpu_percent`: Maximum CPU usage percentage
- `memory_mb`: Maximum memory in megabytes
- `max_sessions`: Maximum concurrent sessions

## Security Considerations

- Agent isolation limits file system access
- Blocked commands prevent dangerous operations
- Network access can be restricted
- Audit logging tracks all agent activities
