# MAF Orchestration NPM Scripts Guide

This guide documents all the MAF (Multi-Agent Framework) npm scripts added to package.json for tmux-based agent orchestration.

## Core Orchestration Scripts

### Agent Spawning
- `npm run maf:spawn-agents` - Main entry point for spawning agent sessions
- `npm run maf:spawn-bg` - Spawn agents in background mode
- `npm run maf:spawn-debug` - Spawn agents with debug logging
- `npm run maf:spawn-verbose` - Spawn agents with verbose output
- `npm run maf:spawn-minimal` - Quick minimal session (1 worker, 2 pane layout)
- `npm run maf:spawn-demo` - Demo configuration (3 workers, 4 pane layout)

### Agent Initialization
- `npm run maf:init-agent` - Individual agent initialization (requires parameters)
- `npm run maf:init-worker` - Initialize a claude-worker agent
- `npm run maf:init-committer` - Initialize a claude-committer agent
- `npm run maf:init-reviewer` - Initialize a codex-reviewer agent
- `npm run maf:init-coordinator` - Initialize a coordinator agent

## Session Management Scripts

### Session Monitoring
- `npm run maf:session-list` - List all active MAF sessions
- `npm run maf:session-status` - Show detailed session status
- `npm run maf:session-attach` - Attach to the first available MAF session

### Session Cleanup
- `npm run maf:session-cleanup` - Clean up all MAF sessions gracefully
- `npm run maf:session-cleanup-force` - Force kill all tmux sessions

## Configuration Scripts

- `npm run maf:config-demo` - Load demo configuration
- `npm run maf:config-load` - Load example configuration
- `npm run maf:config-start` - Start MAF with custom config
- `npm run maf:config-verify` - Verify configuration integration

## Testing and Demo Scripts

- `npm run maf:test-orchestration` - Test tmux orchestration system
- `npm run maf:demo-orchestration` - Run demo of orchestration features
- `npm run maf:test-full` - Run full test suite (test + demo)

## Diagnostic Scripts

- `npm run maf:diagnose` - System diagnosis (Node, NPM, Tmux, scripts)
- `npm run maf:logs` - Show recent MAF activity and git history
- `npm run maf:health` - Full health check + diagnosis

## Quick Start Scripts

- `npm run maf:quick-start` - Setup and spawn minimal session
- `npm run maf:quick-demo` - Load demo config and spawn demo session
- `npm run maf:quick-test` - Test orchestration and cleanup

## Development Scripts

- `npm run maf:dev` - Start development mode (verbose)
- `npm run maf:prod` - Start production mode (background)
- `npm run maf:reset` - Force cleanup and quick start

## Integration with Existing MAF Scripts

All new orchestration scripts work seamlessly with existing MAF CLI:
- `npm run maf:claim-task` - Task claiming system
- `npm run maf:bootstrap-agent-mail` - Agent mail system
- `npm run maf:test-beads-flow` - Beads workflow testing
- `npm run maf:health-check` - Basic health check
- `npm run maf:setup` - MAF system setup

## Usage Examples

```bash
# Quick development setup
npm run maf:quick-start

# Production background session
npm run maf:prod

# Demo session for testing
npm run maf:quick-demo

# Check what's running
npm run maf:session-status

# Clean up everything
npm run maf:session-cleanup-force

# Full system test
npm run maf:test-full
```

## Integration Notes

- All scripts work from project root directory
- Uses relative paths for portability
- Integrates with existing tmux session management
- Supports configuration files in `.maf/config/`
- Maintains compatibility with beads workflow
- Works with agent-mail integration
- Supports all existing agent types

## Troubleshooting

If scripts fail:
1. Run `npm run maf:diagnose` to check system setup
2. Run `npm run maf:health` for full health check
3. Use `npm run maf:session-cleanup-force` to reset tmux state
4. Check that tmux is installed: `tmux -V`
5. Verify script permissions: `ls -la scripts/maf/`
