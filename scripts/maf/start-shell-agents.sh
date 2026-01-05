#!/bin/bash
# Start agents in shell mode for direct command execution

set -e

SESSION_NAME="maf-5pane"

echo "=== Starting Agents in Shell Mode ==="

# Kill existing session
tmux kill-session -t $SESSION_NAME 2>/dev/null || true
sleep 1

# Create new session with proper layout
tmux new-session -d -s $SESSION_NAME -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux select-layout even-horizontal

# Split first pane vertically
tmux select-pane -t 0
tmux split-window -v -c /root/projects/roundtable

echo "Created session with 4 panes"

# Function to configure agent pane
setup_agent_pane() {
    local pane_num=$1
    local agent_name=$2
    local agent_id=$3
    local task=$4

    echo "Configuring $agent_name in pane $pane_num..."

    # Configure the agent in shell mode
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo '=== $agent_name ==='" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo 'Agent ID: $agent_id'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo 'Task: $task'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo 'Commands:'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo '1. Check beads: python3 scripts/maf/bead-assigner.py status'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo '2. Claim bead: python3 scripts/maf/bead-assigner.py claim --agent $agent_id'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo '3. Work on task'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo '4. Complete bead: python3 scripts/maf/bead-assigner.py complete --bead <id>'" Enter
    tmux send-keys -t "$SESSION_NAME:$pane_num" "echo ''" Enter
}

# Setup agent panes
setup_agent_pane 1 "IMPLEMENTOR-1" "implementor-1" "Circle page rendering from published JSON"
setup_agent_pane 2 "IMPLEMENTOR-2" "implementor-2" "Room page rendering as decision memos"
setup_agent_pane 3 "IMPLEMENTOR-3" "implementor-3" "Eleventy site setup with templates"

# Setup reviewer pane
tmux send-keys -t "$SESSION_NAME:0" "echo '=== REVIEWER ==='" Enter
tmux send-keys -t "$SESSION_NAME:0" "echo 'Task: Monitor bead workflow'" Enter
tmux send-keys -t "$SESSION_NAME:0" "echo 'Command: python3 scripts/maf/bead-assigner.py status'" Enter

# Show current bead assignments
echo ""
echo "Showing current bead assignments in all panes..."
for pane in 0 1 2 3; do
    tmux send-keys -t "$SESSION_NAME:$pane" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:$pane" "echo '=== CURRENT BEAD STATUS ==='" Enter
    tmux send-keys -t "$SESSION_NAME:$pane" "python3 scripts/maf/bead-assigner.py status" Enter
done

echo ""
echo "✅ Agents configured in shell mode!"
echo ""
echo "All agents are in bash shell and can execute commands directly."
echo "They can see their bead assignments and start working immediately."
echo ""
echo "Session: tmux attach -t $SESSION_NAME"
echo ""
echo "Each pane shows:"
echo "- Agent name and ID"
echo "- Assigned task"
echo "- Commands for bead workflow"
echo "- Current bead assignments"