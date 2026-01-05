# Context Management Solution Demo

This demonstrates the integrated solution for managing agent context in tmux sessions using Memlayer + Agent Mail + Fallback memory service.

## Architecture

```
Agent (tmux pane) → Context Manager v2
                    ↓
            ┌─────────────────────┐
            │   Memory Service    │
            ├─────────────────────┤
            │  ┌───────────────┐  │
            │  │   Memlayer    │  │ ← Primary (when available)
            │  └───────────────┘  │
            │  ┌───────────────┐  │
            │  │   Fallback    │  │ ← Backup (file-based)
            │  └───────────────┘  │
            └─────────────────────┘
                    ↓
            ┌─────────────────────┐
            │   Agent Mail        │ ← Audit trail + communication
            └─────────────────────┘
                    ↓
            ┌─────────────────────┐
            │   Beads System      │ ← Task management
            └─────────────────────┘
```

## Key Features

1. **Intelligent Context Extraction**
   - Code changes automatically detected
   - Decisions and choices captured
   - Errors and fixes recorded
   - Current task context preserved

2. **Dual Storage Strategy**
   - Memlayer: Fast, indexed, semantic search
   - Fallback: Simple file-based storage
   - Agent Mail: Full audit trail

3. **Seamless Restoration**
   - Retrieves relevant memories on restart
   - Shows unread messages
   - Provides task context
   - Maintains bead IDs for traceability

## Usage

### Starting the Context Manager

```bash
# Start monitoring daemon
./scripts/maf/context-manager-v2.sh start

# Check status
./scripts/maf/context-manager-v2.sh status

# Stop monitoring
./scripts/maf/context-manager-v2.sh stop
```

### Manual Memory Operations

```bash
# Store current context
./scripts/maf/agent-memory.sh store

# Restore context
./scripts/maf/agent-memory.sh restore

# Show memory summary
./scripts/maf/agent-memory.sh summary

# Store specific content
./scripts/maf/agent-memory.sh store "Made decision to use PostgreSQL"
```

### Integration with Agents

Agents can use these commands:

1. **Before making changes**:
   ```bash
   file_reservation_paths /root/projects/roundtable agent-name ["src/**"] true 3600
   ```

2. **After important decisions**:
   ```bash
   ./scripts/maf/agent-memory.sh store "Decided to implement feature X using approach Y"
   ```

3. **When context is full** (handled automatically):
   - Context manager detects >60% usage
   - Saves important memories
   - Restarts agent with restored context
   - Continues work seamlessly

## Example Workflow

1. Agent starts working on bead `bd-456`
2. Files are reserved: `file_reservation_paths(...)`
3. Agent communicates in thread: `send_message(thread_id="bd-456", ...)`
4. Context manager monitors usage
5. At 60% context:
   - Extracts code changes, decisions, errors
   - Stores in Memlayer + Agent Mail
   - Restarts agent pane
   - Restores relevant memories
   - Agent continues with full context

## Benefits

- **No Context Loss**: Important information preserved across restarts
- **Fast Recovery**: <100ms memory retrieval
- **Intelligent Filtering**: Only stores salient information
- **Full Audit Trail**: Everything tracked in Agent Mail
- **Resilient**: Works with or without Memlayer
- **Minimal Disruption**: Agents continue work seamlessly

## Testing

Run the test suite to verify everything works:

```bash
./scripts/maf/test-memlayer-integration.sh
```

## Configuration

Key environment variables:

```bash
AGENT_NAME=agent-1                    # Agent identifier
MEMLAYER_MODE=LOCAL                  # Memory mode
MEMLAYER_STORAGE_PATH=.maf/state/memory  # Memory storage
BEADS_PROJECT_PATH=/path/to/project  # Beads project
```

## Troubleshooting

If Memlayer fails:
- Falls back to file-based storage automatically
- Check logs: `/tmp/agent-context-manager-v2.log`
- Verify Python environment: `source venv_memlayer/bin/activate`
