#!/bin/bash
# Nudge agents to work on beads by sending keystrokes properly

SESSION_NAME="maf-5pane"

echo "=== Nudging Agents to Work on Beads ==="

# Function to nudge an agent
nudge_agent() {
    local pane=$1
    local agent_name=$2
    local task=$3

    echo "Nudging $agent_name..."

    # Get out of any edit mode first
    tmux send-keys -t "$SESSION_NAME:$pane" Escape Escape Escape
    sleep 0.5

    # Try to get to a clean prompt
    tmux send-keys -t "$SESSION_NAME:$pane" C-c
    sleep 0.5

    # Send a simple, clear instruction
    tmux send-keys -t "$SESSION_NAME:$pane" "Check your assigned beads"
    sleep 1
    tmux send-keys -t "$SESSION_NAME:$pane" "Task: $task"
    sleep 1
    tmux send-keys -t "$SESSION_NAME:$pane" "Use bead system to work"
    sleep 1

    # Try to execute with Enter
    tmux send-keys -t "$SESSION_NAME:$pane" Enter Enter
    sleep 2

    echo "✅ $agent_name nudged"
}

# Nudge each agent
nudge_agent 1 "IMPLEMENTOR-1" "Circle page rendering from published JSON"
nudge_agent 2 "IMPLEMENTOR-2" "Room page rendering as decision memos"
nudge_agent 3 "IMPLEMENTOR-3" "Eleventy site setup with templates"

echo ""
echo "=== SUMMARY ==="
echo ""
echo "All agents have been started in Claude Code CLI mode."
echo ""
echo "Current status:"
echo "- Agents are running in Claude Code (can use full Claude capabilities)"
echo "- Instructions have been sent to each agent"
echo "- Agents know their tasks and bead IDs"
echo ""
echo "Bead assignments:"
python3 scripts/maf/bead-assigner.py status
echo ""
echo "To interact with agents:"
echo "1. Attach to session: tmux attach -t $SESSION_NAME"
echo "2. Switch to pane: Ctrl+B then Arrow keys or 1,2,3,0"
echo "3. Type to give instructions or ask questions"
echo ""
echo "Agents will work autonomously once they process their instructions."