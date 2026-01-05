#!/bin/bash

# Context Manager for TMUX Agents
# Monitors context usage, preserves state, and restarts agents when needed
# Uses Agent Mail for persistence and coordination

set -e

# Configuration
CONTEXT_THRESHOLD="${MAF_CONTEXT_THRESHOLD:-40}"  # Restart when <40% context remains
CHECK_INTERVAL=300   # Check every 5 minutes
LOG_FILE="/tmp/agent-context-manager.log"
STATE_DIR="/tmp/agent-states"
AGENT_MAIL_PROJECT="/root/projects/roundtable"

# Create state directory
mkdir -p "$STATE_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get all agent panes (exclude control/status)
get_agent_panes() {
    tmux list-panes -a -F '#S:#I.#P' | grep -E "agent|claude" | grep -v "control\|status\|monitor"
}

# Check if agent is responding (simple ping)
is_agent_responsive() {
    local pane=$1
    # Try to send a simple command and check if it's processed
    tmux send-keys -t "$pane" -l 'echo "AGENT_ALIVE"'
    tmux send-keys -t "$pane" Enter

    # Give it 2 seconds to respond
    sleep 2

    # Check last line of pane buffer for our marker
    local last_line=$(tmux capture-pane -t "$pane" -p | tail -1)
    if [[ "$last_line" == *"AGENT_ALIVE"* ]]; then
        return 0
    else
        return 1
    fi
}

# Estimate context usage (heuristic based on pane history)
estimate_context_usage() {
    local pane=$1
    local history_size=$(tmux display-message -t "$pane" -p '#{history_size}')

    # Rough estimate: each command ~100 tokens, responses ~500 tokens
    # This is a heuristic - adjust based on observation
    local estimated_tokens=$((history_size * 300))
    local max_tokens=100000  # Adjust based on model context window
    local usage_percent=$((estimated_tokens * 100 / max_tokens))

    echo $usage_percent
}

# Save agent state using Agent Mail
save_agent_state() {
    local pane=$1
    local session_name=$(echo "$pane" | cut -d: -f1)
    local pane_id=$(echo "$pane" | cut -d: -f2)

    log "Saving state for agent $pane"

    # Capture current context
    local context=$(tmux capture-pane -t "$pane" -p -S -10000)

    # Get current bead/task
    local current_task=$(bd list --status in_progress --json 2>/dev/null | jq -r '.[-1].id // "none"')

    # Save to Agent Mail
    python3 - << EOF
import sys
sys.path.insert(0, '$AGENT_MAIL_PROJECT/mcp_agent_mail/src')
from mcp_agent_mail.client import AgentMailClient

client = AgentMailClient()

# Save as a thread with context
client.send_message(
    thread_id="CONTEXT-$session_name-$pane_id",
    subject=f"[CONTEXT] {session_name} state backup",
    body=f"""Agent state backup:
Pane: $pane
Current Task: $current_task
Timestamp: $(date)

Context:
{context[:10000]}  # Limit body size
""",
    from_agent="context-manager",
    project_key="$AGENT_MAIL_PROJECT"
)

print(f"State saved for {pane}")
EOF

    # Also save to file as backup
    echo "$context" > "$STATE_DIR/${session_name}_${pane_id}_context.txt"
    echo "$current_task" > "$STATE_DIR/${session_name}_${pane_id}_task.txt"
}

# Restart agent with preserved context
restart_agent() {
    local pane=$1
    local session_name=$(echo "$pane" | cut -d: -f1)
    local pane_id=$(echo "$pane" | cut -d: -f2)

    log "Restarting agent $pane"

    # Kill the pane
    tmux kill-pane -t "$pane" 2>/dev/null || true

    # Wait a moment
    sleep 1

    # Create new pane
    tmux new-window -t "$session_name" -n "agent-$pane_id"
    new_pane=$(tmux list-panes -t "$session_name" -F '#S:#I.#P' | tail -1)

    # Restore context
    if [[ -f "$STATE_DIR/${session_name}_${pane_id}_context.txt" ]]; then
        local context=$(cat "$STATE_DIR/${session_name}_${pane_id}_context.txt")
        local task=$(cat "$STATE_DIR/${session_name}_${pane_id}_task.txt" 2>/dev/null || echo "none")

        # Send restoration command
        tmux send-keys -t "$new_pane" -l "echo '=== RESTORING CONTEXT ==='"
        tmux send-keys -t "$new_pane" Enter
        sleep 0.5

        tmux send-keys -t "$new_pane" -l "echo 'Previous task: $task'"
        tmux send-keys -t "$new_pane" Enter
        sleep 0.5

        # Check agent mail for messages
        tmux send-keys -t "$new_pane" -l "fetch_inbox --limit 10 --project '$AGENT_MAIL_PROJECT'"
        tmux send-keys -t "$new_pane" Enter
        sleep 0.5

        # Resume work
        tmux send-keys -t "$new_pane" -l "echo 'Resuming work...'"
        tmux send-keys -t "$new_pane" Enter
        tmux send-keys -t "$new_pane" -l "bd ready"
        tmux send-keys -t "$new_pane" Enter
    fi
}

# Monitor agent and take action if needed
monitor_agent() {
    local pane=$1

    # Check if responsive
    if ! is_agent_responsive "$pane"; then
        log "Agent $pane not responsive, restarting..."
        save_agent_state "$pane"
        restart_agent "$pane"
        return
    fi

    # Check context usage
    local usage=$(estimate_context_usage "$pane")
    if [[ $usage -gt $((100 - CONTEXT_THRESHOLD)) ]]; then
        log "Agent $pane context usage: ${usage}% (>60%), restarting..."
        save_agent_state "$pane"
        restart_agent "$pane"
        return
    fi

    # Check if idle (no recent commands)
    local last_activity=$(tmux display-message -t "$pane" -p '#{pane_last_command}')
    local current_time=$(date +%s)
    local activity_age=$((current_time - last_activity))

    if [[ $activity_age -gt 600 ]]; then  # 10 minutes idle
        log "Agent $pane idle for ${activity_age}s, checking for messages..."
        # Nudge to check mail
        tmux send-keys -t "$pane" -l "fetch_inbox --project '$AGENT_MAIL_PROJECT'"
        tmux send-keys -t "$pane" Enter
        tmux send-keys -t "$pane" -l "bd ready"
        tmux send-keys -t "$pane" Enter
    fi
}

# Main monitoring loop
main() {
    log "Starting Agent Context Manager"

    while true; do
        log "Checking agent states..."

        for pane in $(get_agent_panes); do
            monitor_agent "$pane"
        done

        # Cleanup old state files (older than 24 hours)
        find "$STATE_DIR" -name "*.txt" -mtime +1 -delete 2>/dev/null || true

        log "Sleeping for $CHECK_INTERVAL seconds..."
        sleep $CHECK_INTERVAL
    done
}

# Start monitoring in background
start_monitor() {
    if pgrep -f "context-manager.sh" > /dev/null; then
        echo "Context manager already running"
        exit 1
    fi

    echo "Starting context manager daemon..."
    nohup "$0" monitor > /dev/null 2>&1 &
    echo $! > /tmp/context-manager.pid
    echo "Started with PID $(cat /tmp/context-manager.pid)"
}

# Stop monitoring
stop_monitor() {
    if [[ -f /tmp/context-manager.pid ]]; then
        local pid=$(cat /tmp/context-manager.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "Stopped context manager (PID $pid)"
        fi
        rm -f /tmp/context-manager.pid
    fi
}

# Status check
status_check() {
    echo "=== Agent Context Manager Status ==="
    if [[ -f /tmp/context-manager.pid ]]; then
        local pid=$(cat /tmp/context-manager.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "Status: RUNNING (PID $pid)"
            echo "Last check: $(tail -1 "$LOG_FILE" 2>/dev/null || echo 'Never')"
        else
            echo "Status: NOT RUNNING (stale PID file)"
        fi
    else
        echo "Status: NOT RUNNING"
    fi

    echo ""
    echo "Active agent panes:"
    get_agent_panes | while read pane; do
        local usage=$(estimate_context_usage "$pane")
        echo "  $pane - Context: ${usage}%"
    done
}

# CLI argument handling
case "${1:-}" in
    "monitor")
        main
        ;;
    "start")
        start_monitor
        ;;
    "stop")
        stop_monitor
        ;;
    "status")
        status_check
        ;;
    "check-now")
        for pane in $(get_agent_panes); do
            monitor_agent "$pane"
        done
        ;;
    *)
        echo "Usage: $0 {start|stop|status|monitor|check-now}"
        echo "  start     - Start monitoring daemon"
        echo "  stop      - Stop monitoring daemon"
        echo "  status    - Show status"
        echo "  monitor   - Run monitoring in foreground"
        echo "  check-now - Check all agents immediately"
        exit 1
        ;;
esac
