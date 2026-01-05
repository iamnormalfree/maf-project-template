#!/bin/bash
# Start agents in Claude Code CLI mode with proper command execution

set -e

SESSION_NAME="maf-5pane"

echo "=== Starting Claude Code Agents ==="

# Kill existing session
tmux kill-session -t $SESSION_NAME 2>/dev/null || true
sleep 1

# Create new session
tmux new-session -d -s $SESSION_NAME -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux select-layout even-horizontal

# Split first pane vertically
tmux select-pane -t 0
tmux split-window -v -c /root/projects/roundtable

# Function to start Claude Code agent
start_claude_agent() {
    local pane_num=$1
    local agent_name=$2
    local agent_id=$3
    local task=$4

    echo "Starting $agent_name in Claude Code CLI (pane $pane_num)..."

    # Start Claude Code CLI
    tmux send-keys -t "$SESSION_NAME:$pane_num" "claude" Enter
    sleep 4

    # Wait for Claude to be ready, then send the task
    tmux send-keys -t "$SESSION_NAME:$pane_num" << EOF
You are $agent_name with agent ID '$agent_id'.

PRIMARY TASK: $task

BEAD WORKFLOW INSTRUCTIONS:
1. Check your assigned beads: Run the command 'python3 scripts/maf/bead-assigner.py status'
2. Claim a bead if needed: 'python3 scripts/maf/bead-assigner.py claim --agent $agent_id'
3. Work on the assigned task using Claude Code capabilities
4. Complete the bead: 'python3 scripts/maf/bead-assigner.py complete --bead <bead_id>'

You are running in Claude Code CLI - you can:
- Read and write files directly
- Run bash commands by prefixing with !
- Use all Claude Code features
- Execute the bead workflow commands above

Start by checking your current bead assignments now.
EOF

    # Press Enter to execute the instructions
    tmux send-keys -t "$SESSION_NAME:$pane_num" Enter
    sleep 2

    echo "✅ $agent_name started in Claude Code CLI"
}

# Start the implementor agents
start_claude_agent 1 "IMPLEMENTOR-1" "implementor-1" "Circle page rendering from published JSON - Create templates that display published posts in a circle format"
sleep 2

start_claude_agent 2 "IMPLEMENTOR-2" "implementor-2" "Room page rendering as decision memos - Create templates that display individual posts as formal decision documents"
sleep 2

start_claude_agent 3 "IMPLEMENTOR-3" "implementor-3" "Eleventy site setup with templates - Configure site structure and starter templates"
sleep 2

# Start reviewer
echo "Starting REVIEWER..."
tmux send-keys -t "$SESSION_NAME:0" "claude" Enter
sleep 4

tmux send-keys -t "$SESSION_NAME:0" << EOF
You are the REVIEWER.

PRIMARY TASK: Monitor and review all implementor work

WORKFLOW:
1. Monitor bead workflow: Run 'python3 scripts/maf/bead-assigner.py status'
2. Check on agent progress
3. Review completed work
4. Help agents if they're stuck

You're in Claude Code CLI - use ! for bash commands.
Start by checking the current bead status.
EOF

tmux send-keys -t "$SESSION_NAME:0" Enter
sleep 2

echo "✅ REVIEWER started"

echo ""
echo "=== ALL CLAUDE CODE AGENTS STARTED ==="
echo ""
echo "Session: tmux attach -t $SESSION_NAME"
echo ""
echo "Agents are now in Claude Code CLI mode and will:"
echo "1. Check their bead assignments"
echo "2. Use Claude Code capabilities to work on tasks"
echo "3. Execute bash commands with ! prefix"
echo "4. Complete beads autonomously"
echo ""
echo "Give them a moment to process their instructions..."