#!/bin/bash

# Simple Agent Coordinator for TMUX
# A working solution that actually coordinates agents without complex dependencies

set -e

# Configuration
COORDINATOR_LOG="/tmp/agent-coordinator.log"
AGENT_CONTEXT_DIR="/tmp/agent-contexts"

# Create directories
mkdir -p "$AGENT_CONTEXT_DIR"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$COORDINATOR_LOG"
}

# Find all agent panes in the current tmux session
find_agent_panes() {
    local session_name="${1:-$(tmux display-message -p '#S')}"
    tmux list-panes -t "$session_name" -F '#I.#P' | while read pane; do
        # Check if this looks like an agent pane
        local content=$(tmux capture-pane -t "$session_name:$pane" -p | tail -20)
        if echo "$content" | grep -q -E "(Agent|agent|claude|bd ready|working on)"; then
            echo "$session_name:$pane"
        fi
    done
}

# Save an agent's current context
save_context() {
    local pane=$1
    local agent_id=$(echo "$pane" | tr ':.' '_')

    log "Saving context for $pane"

    # Extract current work
    local context=$(tmux capture-pane -t "$pane" -p -S -500)

    # Extract current bead if any
    local current_bead=$(echo "$context" | grep -oE "bd-[0-9]+" | head -1)
    current_bead="${current_bead:-none}"

    # Extract recent decisions/code changes
    local recent_work=$(echo "$context" | tail -50 | grep -E "(decided|created|fixed|modified|edit)" | head -10)

    # Save to file
    {
        echo "=== AGENT CONTEXT ==="
        echo "Saved: $(date)"
        echo "Pane: $pane"
        echo "Current Bead: $current_bead"
        echo ""
        echo "Recent Work:"
        echo "$recent_work"
        echo ""
        echo "Last 20 Lines:"
        echo "$context" | tail -20
        echo "=================="
    } > "$AGENT_CONTEXT_DIR/${agent_id}_context.txt"

    log "Context saved for $pane (bead: $current_bead)"
}

# Restore context to an agent
restore_context() {
    local pane=$1
    local agent_id=$(echo "$pane" | tr ':.' '_')
    local context_file="$AGENT_CONTEXT_DIR/${agent_id}_context.txt"

    if [[ -f "$context_file" ]]; then
        log "Restoring context to $pane"

        # Send context to pane
        tmux send-keys -t "$pane" -l "echo '=== RESTORED CONTEXT ==='"
        tmux send-keys -t "$pane" Enter
        tmux send-keys -t "$pane" -l "cat << 'EOF'"
        tmux send-keys -t "$pane" Enter
        tmux send-keys -t "$pane" -l "$(cat "$context_file")"
        tmux send-keys -t "$pane" Enter
        tmux send-keys -t "$pane" -l "EOF"
        tmux send-keys -t "$pane" Enter

        log "Context restored to $pane"
    else
        log "No saved context found for $pane"
    fi
}

# Estimate if agent needs restart
needs_restart() {
    local pane=$1
    local history_size=$(tmux display-message -t "$pane" -p '#{history_size}')

    # Heuristic: restart after ~5000 lines of history
    if [[ $history_size -gt 5000 ]]; then
        return 0
    else
        return 1
    fi
}

# Restart an agent with context preservation
restart_agent() {
    local pane=$1
    local session=$(echo "$pane" | cut -d: -f1)
    local pane_num=$(echo "$pane" | cut -d: -f2)

    log "Restarting agent $pane"

    # Save context first
    save_context "$pane"

    # Kill and recreate pane
    tmux kill-pane -t "$pane" 2>/dev/null || true
    sleep 0.5
    tmux new-window -t "$session" -n "agent"
    local new_pane=$(tmux list-panes -t "$session" -F '#S:#I.#P' | tail -1)

    # Restore context
    restore_context "$new_pane"

    # Get back to work
    tmux send-keys -t "$new_pane" -l "echo 'Agent restarted. Continue with current task.'"
    tmux send-keys -t "$new_pane" Enter
    tmux send-keys -t "$new_pane" -l "bd ready"
    tmux send-keys -t "$new_pane" Enter

    log "Agent restarted in $new_pane"
}

# Nudge idle agents
nudge_agents() {
    log "Nudging agents to continue work..."

    find_agent_panes | while read pane; do
        local last_cmd=$(tmux display-message -t "$pane" -p '#{pane_last_command}')
        local now=$(date +%s)
        local idle=$((now - last_cmd))

        # If idle for more than 5 minutes
        if [[ $idle -gt 300 ]]; then
            log "Nudging idle agent $pane (idle ${idle}s)"
            tmux send-keys -t "$pane" -l "echo 'Time to work! Ready beads:'"
            tmux send-keys -t "$pane" Enter
            tmux send-keys -t "$pane" -l "bd ready"
            tmux send-keys -t "$pane" Enter
            tmux send-keys -t "$pane" -l "# Continue with highest priority task"
            tmux send-keys -t "$pane" Enter
        fi
    done
}

# Monitor and manage all agents
monitor_agents() {
    log "Starting agent monitoring..."

    while true; do
        local agent_count=0
        local restart_count=0

        find_agent_panes | while read pane; do
            agent_count=$((agent_count + 1))

            if needs_restart "$pane"; then
                restart_count=$((restart_count + 1))
                restart_agent "$pane"
            fi
        done

        log "Checked agents. Found $(find_agent_panes | wc -l), restarted $restart_count"

        # Every 10 minutes, also nudge idle agents
        if [[ $(($(date +%s) % 600)) -lt 10 ]]; then
            nudge_agents
        fi

        # Sleep for 30 seconds
        sleep 30
    done
}

# Quick coordination command
coordinate_now() {
    echo "Coordinating agents now..."

    # Get ready work
    local ready_work=$(bd ready 2>/dev/null | head -5)
    if [[ -n "$ready_work" ]]; then
        log "Ready work available: $ready_work"
    fi

    # Find and nudge agents
    find_agent_panes | while read pane; do
        log "Coordinating with agent $pane"

        # Send coordination message
        tmux send-keys -t "$pane" -l "echo 'Coordinator: Check ready beads and communicate progress!'"
        tmux send-keys -t "$pane" Enter

        # Show ready work if any
        if [[ -n "$ready_work" ]]; then
            tmux send-keys -t "$pane" -l "echo 'Ready work:'"
            tmux send-keys -t "$pane" Enter
            tmux send-keys -t "$pane" -l "bd ready"
            tmux send-keys -t "$pane" Enter
        fi
    done
}

# Main CLI
case "${1:-help}" in
    "monitor")
        monitor_agents
        ;;
    "start")
        if pgrep -f "simple-agent-coordinator.sh" > /dev/null; then
            echo "Coordinator already running"
            exit 1
        fi
        echo "Starting agent coordinator..."
        nohup "$0" monitor > /dev/null 2>&1 &
        echo $! > /tmp/agent-coordinator.pid
        echo "Started with PID $(cat /tmp/agent-coordinator.pid)"
        ;;
    "stop")
        if [[ -f /tmp/agent-coordinator.pid ]]; then
            kill $(cat /tmp/agent-coordinator.pid)
            rm -f /tmp/agent-coordinator.pid
            echo "Stopped coordinator"
        fi
        ;;
    "status")
        echo "=== Agent Coordinator Status ==="
        if [[ -f /tmp/agent-coordinator.pid ]] && kill -0 $(cat /tmp/agent-coordinator.pid) 2>/dev/null; then
            echo "Status: RUNNING"
        else
            echo "Status: STOPPED"
        fi
        echo ""
        echo "Active agents:"
        find_agent_panes | while read pane; do
            local history=$(tmux display-message -t "$pane" -p '#{history_size}')
            echo "  $pane - History: $history lines"
        done
        ;;
    "coordinate")
        coordinate_now
        ;;
    "save")
        find_agent_panes | while read pane; do
            save_context "$pane"
        done
        ;;
    *)
        echo "Usage: $0 {start|stop|status|monitor|coordinate|save}"
        echo ""
        echo "Commands:"
        echo "  start      - Start monitoring agents"
        echo "  stop       - Stop monitoring"
        echo "  status     - Show status and agent info"
        echo "  monitor    - Run monitoring in foreground"
        echo "  coordinate - Nudge agents to work now"
        echo "  save       - Save all agent contexts"
        exit 1
        ;;
esac