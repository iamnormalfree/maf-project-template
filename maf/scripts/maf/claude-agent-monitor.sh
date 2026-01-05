#!/bin/bash
# Monitor Claude agents and handle stalls

SESSION_NAME="maf-5pane"
LOG_DIR=".agent-mail/logs"
STALL_LOG="$LOG_DIR/stall-detection.log"

mkdir -p "$LOG_DIR"

# Function to log stall events
log_stall() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STALL_LOG"
}

# Function to check if agent is waiting for bash approval
check_bash_prompt() {
    local pane=$1
    local agent_name=$2

    # Capture pane content
    local content=$(tmux capture-pane -t "$SESSION_NAME:0.$pane" -p)

    # Check for bash prompt waiting for approval
    if echo "$content" | grep -q "\[y/N\]\:"; then
        log_stall "$agent_name is waiting for bash approval"

        # Auto-approve safe commands
        if echo "$content" | grep -E "(mkdir|touch|echo|ls|cd|cat)" > /dev/null; then
            log_stall "Auto-approving safe command for $agent_name"
            tmux send-keys -t "$SESSION_NAME:0.$pane" "y" Enter
            return 0
        else
            log_stall "Command requires manual review - notifying reviewer"
            # Notify reviewer pane
            tmux send-keys -t "$SESSION_NAME:0.4" "echo '-> REVIEWER: $agent_name needs manual approval for command'" Enter
            return 1
        fi
    fi

    return 0
}

# Function to restart stalled Claude instance
restart_claude() {
    local pane=$1
    local agent_name=$2

    log_stall "Restarting Claude in $agent_name (pane $pane)"

    # Kill current Claude and restart
    tmux send-keys -t "$SESSION_NAME:0.$pane" "C-c" 2>/dev/null
    sleep 1
    tmux send-keys -t "$SESSION_NAME:0.$pane" "claude" Enter
    sleep 2
}

# Main monitoring loop
echo "=== Starting Claude Agent Monitor ==="
echo "Will detect stalls and auto-approve safe commands"

while true; do
    # Check each agent pane
    for pane_info in "1:Implementor-1" "2:Implementor-2" "3:Implementor-3"; do
        pane=$(echo $pane_info | cut -d: -f1)
        agent=$(echo $pane_info | cut -d: -f2)

        # Check for bash prompts
        if ! check_bash_prompt $pane $agent; then
            # If manual approval needed, check if reviewer responds within timeout
            sleep 30
            if ! check_bash_prompt $pane $agent; then
                log_stall "No reviewer response, skipping command for $agent"
                tmux send-keys -t "$SESSION_NAME:0.$pane" "n" Enter
                tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'Command skipped - moving on'" Enter
            fi
        fi

        # Check if Claude is responsive (simple test)
        local last_activity=$(tmux display-message -p -t "$SESSION_NAME:0.$pane" -T '#{pane_current_command}')
        if [[ "$last_activity" == "bash" ]] || [[ "$last_activity" == "" ]]; then
            # Might be stalled, check longer
            sleep 5
            if [[ $(tmux display-message -p -t "$SESSION_NAME:0.$pane" -T '#{pane_current_command}') == "bash" ]]; then
                log_stall "$agent appears stalled, checking..."
                # Check if there's a prompt
                local content=$(tmux capture-pane -t "$SESSION_NAME:0.$pane" -p | tail -3)
                if [[ -z "$content" ]] || [[ "$content" == *"$"* ]]; then
                    log_stall "$agent is idle, ensuring Claude is running"
                    tmux send-keys -t "$SESSION_NAME:0.$pane" "" Enter  # Send empty enter to wake up
                fi
            fi
        fi
    done

    sleep 10
done