#!/bin/bash

# Context Manager v3 - Fixed version for Roundtable
# Monitors context usage, preserves state, and restarts agents

set -e

# Configuration
CONTEXT_THRESHOLD=60  # Restart when >60% context used
CHECK_INTERVAL=300   # Check every 5 minutes
LOG_FILE="/tmp/agent-context-manager.log"
STATE_DIR="/tmp/agent-states"
AGENT_MAIL_PROJECT="/root/projects/roundtable"

# Memory scripts
MEMORY_SCRIPT="/root/projects/roundtable/scripts/maf/agent-memory.sh"

# Create state directory
mkdir -p "$STATE_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get all agent panes - FIXED to include maf-cli session
get_agent_panes() {
    # Look for panes in any session that might contain agents
    tmux list-panes -a -F '#S:#I.#P' | grep -v "control\|status\|monitor" | \
    while read pane; do
        # Check if pane has active agent activity
        if tmux capture-pane -t "$pane" -p | grep -q -E "(Agent|agent|claude|bd ready|file_reservation)" 2>/dev/null; then
            echo "$pane"
        fi
    done
}

# Check if agent is responding
is_agent_responsive() {
    local pane=$1
    # Send a unique marker
    local marker="ALIVE_$(date +%s)"
    tmux send-keys -t "$pane" -l "echo '$marker'"
    tmux send-keys -t "$pane" Enter

    # Wait and check
    sleep 2

    # Check if marker appears in output
    if tmux capture-pane -t "$pane" -p | grep -q "$marker" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Better context estimation
estimate_context_usage() {
    local pane=$1
    local history_size=$(tmux display-message -t "$pane" -p '#{history_size}' 2>/dev/null || echo "0")

    # More realistic estimation
    # Average line ~50 tokens, Claude 3.5 has 200k context window
    # Be conservative and restart at 60%
    local max_safe_context=120000  # 60% of 200k
    local estimated_tokens=$((history_size * 50))

    if [[ $estimated_tokens -gt 0 ]]; then
        local usage_percent=$((estimated_tokens * 100 / max_safe_context))
        echo $usage_percent
    else
        echo 0
    fi
}

# Save agent state using working methods
save_agent_state() {
    local pane=$1
    local session_name=$(echo "$pane" | cut -d: -f1)
    local pane_id=$(echo "$pane" | cut -d: -f2)

    log "Saving state for agent in $pane"

    # Extract agent identifier
    local agent_name=$(tmux capture-pane -t "$pane" -p | grep -E "(Agent|agent)" | head -1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | head -c 20)
    if [[ -z "$agent_name" ]]; then
        agent_name="agent_${session_name}_${pane_id}"
    fi

    export AGENT_NAME="$agent_name"

    # Capture context
    local context=$(tmux capture-pane -t "$pane" -p -S -1000)

    # Save to file (reliable method)
    echo "$context" > "$STATE_DIR/${session_name}_${pane_id}_context.txt"

    # Try to extract current bead/task
    local current_bead=$(echo "$context" | grep -E "bd-[0-9]" | head -1 | grep -oE "bd-[0-9]+" | head -1)
    if [[ -z "$current_bead" ]]; then
        current_bead="unknown"
    fi
    echo "$current_bead" > "$STATE_DIR/${session_name}_${pane_id}_task.txt"

    # Use memory wrapper if available
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        echo "$context" | "$MEMORY_SCRIPT" store 2>/dev/null || log "Memory script failed"
    fi

    # Store summary in a simple format
    {
        echo "=== Agent State Backup ==="
        echo "Time: $(date)"
        echo "Agent: $agent_name"
        echo "Pane: $pane"
        echo "Current Bead: $current_bead"
        echo ""
        echo "Last 10 lines:"
        echo "$context" | tail -10
        echo "========================"
    } > "$STATE_DIR/${session_name}_${pane_id}_summary.txt"

    log "State saved for agent $agent_name (bead: $current_bead)"
}

# Restart agent with context restoration
restart_agent() {
    local pane=$1
    local session_name=$(echo "$pane" | cut -d: -f1)
    local pane_id=$(echo "$pane" | cut -d: -f2)

    log "Restarting agent in $pane"

    # Get state info before killing
    local summary_file="$STATE_DIR/${session_name}_${pane_id}_summary.txt"
    local task_file="$STATE_DIR/${session_name}_${pane_id}_task.txt"

    # Extract agent name
    local agent_name="unknown"
    if [[ -f "$summary_file" ]]; then
        agent_name=$(grep "Agent:" "$summary_file" | cut -d' ' -f2)
    fi

    # Kill the old pane
    tmux kill-pane -t "$pane" 2>/dev/null || true
    sleep 1

    # Create new pane in same session
    tmux new-window -t "$session_name" -n "agent-${pane_id}"
    local new_pane=$(tmux list-panes -t "$session_name" -F '#S:#I.#P' | tail -1)

    # Set agent name for new pane
    export AGENT_NAME="$agent_name"

    # Send restoration sequence
    tmux send-keys -t "$new_pane" -l "echo '=== AGENT RESTARTED WITH CONTEXT RESTORATION ==='"
    tmux send-keys -t "$new_pane" Enter
    sleep 0.5

    # Show previous context if available
    if [[ -f "$summary_file" ]]; then
        tmux send-keys -t "$new_pane" -l "cat << 'EOF'"
        tmux send-keys -t "$new_pane" Enter
        tmux send-keys -t "$new_pane" -l "$(cat "$summary_file")"
        tmux send-keys -t "$new_pane" Enter
        tmux send-keys -t "$new_pane" -l "EOF"
        tmux send-keys -t "$new_pane" Enter
        sleep 0.5
    fi

    # Try to restore from memory service
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        tmux send-keys -t "$new_pane" -l "$MEMORY_SCRIPT restore"
        tmux send-keys -t "$new_pane" Enter
        sleep 1
    fi

    # Resume work prompt
    tmux send-keys -t "$new_pane" -l "echo 'Agent restored. Review context and continue with current task.'"
    tmux send-keys -t "$new_pane" Enter
    tmux send-keys -t "$new_pane" -l "bd ready"
    tmux send-keys -t "$new_pane" Enter

    log "Agent $agent_name restarted in new pane: $new_pane"
}

# Monitor and manage agents
monitor_agent() {
    local pane=$1

    # Check if responsive
    if ! is_agent_responsive "$pane"; then
        log "Agent $pane not responding, restarting..."
        save_agent_state "$pane"
        restart_agent "$pane"
        return
    fi

    # Check context usage
    local usage=$(estimate_context_usage "$pane")
    if [[ $usage -gt $CONTEXT_THRESHOLD ]]; then
        log "Agent $pane context usage: ${usage}% (threshold: ${CONTEXT_THRESHOLD}%), restarting..."
        save_agent_state "$pane"
        restart_agent "$pane"
        return
    fi

    # Check for idle agents (no commands for 10 minutes)
    local last_activity=$(tmux display-message -t "$pane" -p '#{pane_last_command}' 2>/dev/null || echo "0")
    local current_time=$(date +%s)
    local idle_time=$((current_time - last_activity))

    if [[ $idle_time -gt 600 ]]; then  # 10 minutes
        log "Agent $pane idle for ${idle_time}s, nudging..."
        tmux send-keys -t "$pane" -l "echo 'Checking for messages and ready work...'"
        tmux send-keys -t "$pane" Enter
        tmux send-keys -t "$pane" -l "bd ready"
        tmux send-keys -t "$pane" Enter
    fi
}

# Main monitoring loop
main() {
    log "Starting Agent Context Manager v3"

    while true; do
        local agent_count=0
        local restart_count=0

        for pane in $(get_agent_panes); do
            agent_count=$((agent_count + 1))

            # Check if needs restart
            local usage=$(estimate_context_usage "$pane")
            local responsive=true

            if ! is_agent_responsive "$pane"; then
                responsive=false
            fi

            if [[ "$responsive" == false ]] || [[ $usage -gt $CONTEXT_THRESHOLD ]]; then
                restart_count=$((restart_count + 1))
            fi

            monitor_agent "$pane"
        done

        log "Checked $agent_count agents, restarted $restart_count"

        # Cleanup old state files (older than 24 hours)
        find "$STATE_DIR" -name "*.txt" -mtime +1 -delete 2>/dev/null || true

        sleep $CHECK_INTERVAL
    done
}

# CLI interface
case "${1:-help}" in
    "monitor")
        main
        ;;
    "start")
        if pgrep -f "context-manager-v3.sh" > /dev/null; then
            echo "Context manager v3 already running"
            exit 1
        fi
        echo "Starting context manager v3..."
        nohup "$0" monitor > /dev/null 2>&1 &
        echo $! > /tmp/context-manager-v3.pid
        echo "Started with PID $(cat /tmp/context-manager-v3.pid)"
        ;;
    "stop")
        if [[ -f /tmp/context-manager-v3.pid ]]; then
            local pid=$(cat /tmp/context-manager-v3.pid)
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid"
                echo "Stopped context manager v3"
            fi
            rm -f /tmp/context-manager-v3.pid
        fi
        ;;
    "status")
        echo "=== Context Manager v3 Status ==="
        if [[ -f /tmp/context-manager-v3.pid ]]; then
            local pid=$(cat /tmp/context-manager-v3.pid)
            if kill -0 "$pid" 2>/dev/null; then
                echo "Status: RUNNING (PID $pid)"
            else
                echo "Status: NOT RUNNING (stale PID)"
            fi
        else
            echo "Status: NOT RUNNING"
        fi

        echo ""
        echo "Detected agent panes:"
        get_agent_panes | while read pane; do
            local usage=$(estimate_context_usage "$pane")
            echo "  $pane - Context: ${usage}%"
        done
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
        echo "  status    - Show status and detected agents"
        echo "  monitor   - Run in foreground"
        echo "  check-now - Check agents immediately"
        exit 1
        ;;
esac