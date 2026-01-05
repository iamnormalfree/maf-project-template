#!/bin/bash
# Automated Agent Monitoring and Stuck Detection System
# Uses MCP Agent Mail for real communication and alerts

set -e

SESSION_NAME="maf-5pane"
MONITOR_INTERVAL=30  # seconds
STUCK_THRESHOLD=120  # seconds (2 minutes without activity = stuck)
AGENT_MAIL_URL="http://127.0.0.1:8765"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Agent definitions
declare -A AGENTS=(
    ["implementor-1"]="1:Circle page rendering"
    ["implementor-2"]="2:Room page rendering"
    ["implementor-3"]="3:Eleventy site setup"
    ["reviewer"]="4:Review and coordination"
)

# Log file for monitoring
MONITOR_LOG="/root/projects/roundtable/.agent-mail/logs/monitor.log"
mkdir -p "$(dirname "$MONITOR_LOG")"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$MONITOR_LOG"
}

# Function to send alert via MCP Agent Mail
send_alert() {
    local from_agent="monitor"
    local to_agent=$1
    local alert_type=$2
    local message=$3

    log "ALERT: Sending $alert_type to $to_agent: $message"

    # Find the agent's pane
    local pane_info=${AGENTS[$to_agent]}
    local pane_num=${pane_info%%:*}

    if [ -n "$pane_num" ]; then
        tmux send-keys -t "$SESSION_NAME:0.$pane_num" << EOF
# 🚨 MONITOR ALERT: $alert_type
mcp__agent_mail__send_message \\
  --to "monitor" \\
  --message "ALERT: $message" \\
  --subject "$alert_type" \\
  --from "$to_agent"

echo "⚠️  Monitor alert received: $alert_type"
EOF
    fi
}

# Function to check if agent is stuck
check_agent_stuck() {
    local agent_id=$1
    local pane_info=${AGENTS[$agent_id]}
    local pane_num=${pane_info%%:*}

    # Get last activity timestamp from pane
    local last_activity=$(tmux capture-pane -t "$SESSION_NAME:0.$pane_num" -p | \
        grep -E "\[([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}:[0-9]{2})" | \
        tail -1 | \
        grep -oE "\[([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}|[0-9]{2}:[0-9]{2}:[0-9]{2})" | \
        tail -1)

    # If no timestamp found, check for any recent activity
    if [ -z "$last_activity" ]; then
        # Look for Claude prompt indicators
        local has_prompt=$(tmux capture-pane -t "$SESSION_NAME:0.$pane_num" -p | \
            grep -c ">" | tail -1)

        if [ "$has_prompt" -gt "0" ]; then
            # Agent has a prompt showing - might be waiting for input
            log "WARNING: $agent_id appears to be waiting for input (prompt detected)"
            send_alert "$agent_id" "WAITING_FOR_INPUT" "Agent appears to be waiting for user input"
            return 1
        fi
    fi

    # Simple heuristic: if pane shows same content for 2+ minutes, consider stuck
    local current_hash=$(tmux capture-pane -t "$SESSION_NAME:0.$pane_num" -p | md5sum | cut -d' ' -f1)
    local hash_file="/tmp/.agent_hash_$agent_id"

    if [ -f "$hash_file" ]; then
        local old_hash=$(cat "$hash_file")
        local old_time=$(stat -c %Y "$hash_file" 2>/dev/null || echo 0)
        local current_time=$(date +%s)
        local time_diff=$((current_time - old_time))

        if [ "$current_hash" = "$old_hash" ] && [ $time_diff -gt $STUCK_THRESHOLD ]; then
            log "ALERT: $agent_id appears to be STUCK (no change for ${time_diff}s)"
            send_alert "$agent_id" "AGENT_STUCK" "No activity detected for ${time_diff} seconds"

            # Try to unstick by sending a ping
            tmux send-keys -t "$SESSION_NAME:0.$pane_num" "C-c"
            sleep 1
            tmux send-keys -t "$SESSION_NAME:0.$pane_num" "echo 'Monitor ping: Are you stuck?'"
            tmux send-keys -t "$SESSION_NAME:0.$pane_num" Enter

            return 2  # Stuck detected
        fi
    fi

    # Update hash and timestamp
    echo "$current_hash" > "$hash_file"
    return 0  # Not stuck
}

# Function to send heartbeat requests
request_heartbeats() {
    log "Requesting heartbeats from all agents..."

    for agent_id in "${!AGENTS[@]}"; do
        local pane_info=${AGENTS[$agent_id]}
        local pane_num=${pane_info%%:*}

        if [ -n "$pane_num" ]; then
            tmux send-keys -t "$SESSION_NAME:0.$pane_num" << EOF
# Heartbeat request from monitor
mcp__agent_mail__send_message \\
  --to "monitor" \\
  --message "♥ heartbeat - Status: active" \\
  --subject "Heartbeat" \\
  --from "$agent_id"
EOF
        fi
    done
}

# Function to show monitor status
show_status() {
    echo -e "${BLUE}=== AGENT MONITOR STATUS ===${NC}"
    echo "Session: $SESSION_NAME"
    echo "Monitor Interval: ${MONITOR_INTERVAL}s"
    echo "Stuck Threshold: ${STUCK_THRESHOLD}s"
    echo ""

    for agent_id in "${!AGENTS[@]}"; do
        local pane_info=${AGENTS[$agent_id]}
        local pane_num=${pane_info%%:*}
        local task=${pane_info#*:}

        # Get current status from pane
        local status="Unknown"
        local last_line=$(tmux capture-pane -t "$SESSION_NAME:0.$pane_num" -p | tail -3 | grep -v "^$" | tail -1)

        if [[ $last_line == *"Working on"* ]]; then
            status="🟢 Working"
        elif [[ $last_line == *"✅"* ]]; then
            status="✅ Completed"
        elif [[ $last_line == *"⚠️"* || $last_line == *"❌"* ]]; then
            status="🔴 Issue"
        else
            status="🟡 Active"
        fi

        echo -e "$agent_id (Pane $pane_num): $status - $task"
    done
    echo ""
}

# Main monitoring loop
main_monitor() {
    log "Starting agent monitor for session $SESSION_NAME"

    while true; do
        log "=== Agent Check Cycle ==="

        # Check each agent
        for agent_id in "${!AGENTS[@]}"; do
            check_agent_stuck "$agent_id"
        done

        # Request heartbeats every other cycle
        if [ $(($(date +%s) / $MONITOR_INTERVAL) % 2) -eq 0 ]; then
            request_heartbeats
        fi

        # Show status
        show_status

        # Wait for next cycle
        sleep $MONITOR_INTERVAL
    done
}

# Command line interface
case "${1:-start}" in
    "start")
        echo -e "${GREEN}🚀 Starting Agent Monitor${NC}"
        main_monitor
        ;;
    "status")
        show_status
        ;;
    "check")
        if [ -n "$2" ]; then
            check_agent_stuck "$2"
        else
            echo "Usage: $0 check <agent-id>"
            echo "Available agents: ${!AGENTS[*]}"
        fi
        ;;
    "stop")
        log "Agent monitor stopped by user"
        pkill -f "agent-monitor.sh"
        ;;
    "help"|*)
        echo "Usage: $0 {start|status|check|stop|help}"
        echo ""
        echo "Commands:"
        echo "  start              Start monitoring agents"
        echo "  status             Show current agent status"
        echo "  check <agent-id>   Check specific agent"
        echo "  stop               Stop monitoring"
        echo ""
        echo "Available agents: ${!AGENTS[*]}"
        ;;
esac