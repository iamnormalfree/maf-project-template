#!/bin/bash
# Quick start for agents with bead workflow

SESSION_NAME="maf-5pane"

echo "=== Quick Start Bead Workflow ==="

# Kill and recreate session
tmux kill-session -t $SESSION_NAME 2>/dev/null || true
sleep 1

tmux new-session -d -s $SESSION_NAME -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux select-layout even-horizontal

# Split first pane vertically
tmux select-pane -t 0
tmux split-window -v -c /root/projects/roundtable

# Source the fix library
source /root/projects/roundtable/scripts/maf/lib/claude-cli-fix.sh

# Function to configure agent
setup_agent() {
    local pane_num=$1
    local agent_name=$2
    local agent_id=$3
    local task=$4

    # Clear the pane first
    tmux send-keys -t "$SESSION_NAME:$pane_num" C-c C-c C-c clear Enter
    sleep 0.5

    # Start Claude
    tmux send-keys -t "$SESSION_NAME:$pane_num" "claude" Enter
    sleep 4

    # Get out of Claude CLI mode if it starts
    clear_stuck_commands "$SESSION_NAME" "$pane_num" 2>/dev/null || true

    # If still not at shell, try to start properly
    tmux send-keys -t "$SESSION_NAME:$pane_num" C-c
    sleep 0.5
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo '$agent_name starting...'" Enter
    sleep 1

    # Give instructions
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo 'You are $agent_name ($agent_id)'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo 'Task: $task'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo 'Use bead system: python3 scripts/maf/bead-assigner.py status'" Enter
}

# Setup agents
setup_agent 1 "IMPLEMENTOR-1" "implementor-1" "Circle page rendering from published JSON"
setup_agent 2 "IMPLEMENTOR-2" "implementor-2" "Room page rendering as decision memos"
setup_agent 3 "IMPLEMENTOR-3" "implementor-3" "Eleventy site setup with templates"
setup_agent 4 "REVIEWER" "reviewer" "Monitor and review all work"

# Setup coordinator
tmux send-keys -t "$SESSION_NAME:0" C-c clear Enter
sleep 0.5
tmux send-keys -t "$SESSION_NAME:0" "echo '=== MAF COORDINATOR ==='" Enter
tmux send-keys -t "$SESSION_NAME:0" "echo 'Agents will work with bead system'" Enter
tmux send-keys -t "$SESSION_NAME:0" "echo 'MCP Agent Mail: http://127.0.0.1:8765/mail'" Enter

echo ""
echo "✅ Agents configured!"
echo ""
echo "Attach to see work: tmux attach -t $SESSION_NAME"
echo ""
echo "Each agent has been instructed to:"
echo "1. Use their assigned IDs"
echo "2. Work on their specific tasks"
echo "3. Use the bead system for task management"