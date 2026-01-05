#!/bin/bash
# Start agents cleanly without fake pings

set -e

SESSION_NAME="maf-5pane"

echo "=== Starting Clean Agent Session ==="

# Kill existing session if it exists
tmux kill-session -t $SESSION_NAME 2>/dev/null || true

# Create new session
tmux new-session -d -s $SESSION_NAME -c /root/projects/roundtable

# Split into 5 panes
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux select-layout even-horizontal

# Split first pane vertically
tmux select-pane -t 0
tmux split-window -v -c /root/projects/roundtable

# Function to start agent in pane
start_agent() {
    local pane=$1
    local agent_name=$2
    local task=$3

    tmux send-keys -t "$SESSION_NAME:0.$pane" "claude" Enter
    sleep 3

    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '=== $agent_name ==='" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'Task: $task'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'Use MCP Agent Mail for communication'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'Web UI: http://127.0.0.1:8765/mail'" Enter
}

# Start agents
start_agent 1 "IMPLEMENTOR-1" "Circle page rendering from published JSON"
start_agent 2 "IMPLEMENTOR-2" "Room page rendering as decision memos"
start_agent 3 "IMPLEMENTOR-3" "Eleventy site setup with templates"
start_agent 4 "REVIEWER" "Monitor and review all work"

# Configure coordinator pane
tmux send-keys -t "$SESSION_NAME:0.0" "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo '=== MAF COORDINATOR ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Real Agent Communication: ACTIVE'" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'MCP Agent Mail: http://127.0.0.1:8765/mail'" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'No fake pings - Use MCP tools only'" Enter

echo ""
echo "✅ Clean agent session started!"
echo ""
echo "To attach: tmux attach -t $SESSION_NAME"
echo ""
echo "Agents will use REAL MCP Agent Mail communication"
echo "No fake echo pings will be generated"