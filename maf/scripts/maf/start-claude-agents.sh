#!/bin/bash
# Start Claude agents in tmux panes for autonomous bead workflow

set -e

SESSION_NAME="maf-5pane"

echo "=== Starting Claude Agents for Bead Workflow ==="

# Function to start Claude agent in pane
start_claude_agent() {
    local pane=$1
    local agent_name=$2
    local agent_id=$3
    local task=$4

    echo "Starting $agent_name in pane $pane..."

    # Start Claude CLI
    tmux send-keys -t "maf-5pane.%$pane" "claude" Enter
    sleep 4

    # Give the agent their instructions
    tmux send-keys -t "maf-5pane.%$pane" << EOF
You are $agent_name with ID '$agent_id'.

PRIMARY TASK: $task

WORKFLOW:
1. Check available beads: python3 scripts/maf/bead-assigner.py status
2. Claim a bead: python3 scripts/maf/bead-assigner.py claim --agent $agent_id
3. Work on the assigned task
4. Complete the bead: python3 scripts/maf/bead-assigner.py complete --bead <bead_id>
5. Repeat for more work

COMMUNICATION:
- Use MCP Agent Mail when you need help
- Web UI: http://127.0.0.1:8765/mail
- Contact other agents or the reviewer if stuck

Start by checking the bead status now.
EOF

    # Press Enter to execute the instructions
    tmux send-keys -t "maf-5pane.%$pane" Enter
    sleep 2

    echo "✅ $agent_name started"
}

# Start each agent
start_claude_agent 1 "IMPLEMENTOR-1" "implementor-1" "Circle page rendering from published JSON - create templates that display published posts in a circle format"
sleep 2

start_claude_agent 2 "IMPLEMENTOR-2" "implementor-2" "Room page rendering as decision memos - create templates that display individual posts as formal decision documents"
sleep 2

start_claude_agent 3 "IMPLEMENTOR-3" "implementor-3" "Eleventy site setup with templates - configure site structure and starter templates"
sleep 2

# Configure reviewer
echo "Starting REVIEWER in pane 4..."
tmux send-keys -t "maf-5pane.%4" "claude" Enter
sleep 4

tmux send-keys -t "maf-5pane.%4" << EOF
You are the REVIEWER.

PRIMARY TASK: Monitor and review all implementor work

WORKFLOW:
1. Monitor bead completions: python3 scripts/maf/bead-assigner.py status
2. Review completed work for quality
3. Help stuck agents via MCP Agent Mail (http://127.0.0.1:8765/mail)
4. Ensure workflow progresses smoothly

Start by checking the current bead status.
EOF

tmux send-keys -t "maf-5pane.%4" Enter
sleep 2

echo "✅ REVIEWER started"

# Update coordinator
echo "Updating coordinator..."
tmux send-keys -t "maf-5pane.%0" "echo '=== AGENTS STARTED ==='" Enter
tmux send-keys -t "maf-5pane.%0" "echo 'All Claude agents are now running'" Enter
tmux send-keys -t "maf-5pane.%0" "echo 'They will check beads and claim tasks'" Enter
tmux send-keys -t "maf-5pane.%0" "echo 'Monitor at: http://127.0.0.1:8765/mail'" Enter

echo ""
echo "✅ All Claude agents started!"
echo ""
echo "Session: tmux attach -t $SESSION_NAME"
echo ""
echo "Agents will now:"
echo "1. Check bead status"
echo "2. Claim appropriate tasks"
echo "3. Work autonomously"
echo "4. Use MCP Agent Mail for help"
echo ""
echo "Give them a moment to initialize..."