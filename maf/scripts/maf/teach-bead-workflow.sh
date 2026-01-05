#!/bin/bash
# Teach agents how to work with the bead system

SESSION_NAME="maf-5pane"

echo "=== Teaching Agents Bead Workflow ==="

# Function to teach an agent about beads
teach_agent_beads() {
    local pane=$1
    local agent_name=$2
    local agent_id=$3

    tmux send-keys -t "$SESSION_NAME:0.$pane" "C-c" "clear" Enter
    sleep 1

    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '=== $agent_name - BEAD WORKFLOW ==='" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'You are part of the MAF (Multi-Agent Framework) bead system'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'HOW TO WORK WITH BEADS:'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '1. Check available beads: python3 scripts/maf/bead-assigner.py status'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '2. Claim an available bead: python3 scripts/maf/bead-assigner.py claim --agent $agent_id'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '3. Work on the bead task'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '4. Complete the bead: python3 scripts/maf/bead-assigner.py complete --bead <bead_id>'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '5. Get next bead: Repeat from step 1'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'Use MCP Agent Mail for help when stuck!'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo 'Web UI: http://127.0.0.1:8765/mail'" Enter

    # Show them their current status
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '--- CHECKING CURRENT STATUS ---'" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "python3 scripts/maf/bead-assigner.py status | grep -B5 -A5 '$agent_id' || python3 scripts/maf/bead-assigner.py status" Enter
}

# Teach each agent
echo "Teaching bead workflow to agents..."
teach_agent_beads 1 "IMPLEMENTOR-1" "implementor-1"
sleep 2
teach_agent_beads 2 "IMPLEMENTOR-2" "implementor-2"
sleep 2
teach_agent_beads 3 "IMPLEMENTOR-3" "implementor-3"

# Configure reviewer to monitor bead workflow
tmux send-keys -t "$SESSION_NAME:0.4" "C-c" "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo '=== REVIEWER - MONITORING BEAD WORKFLOW ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Watch for:'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo '- Agents claiming beads'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo '- Bead completions'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo '- Agents requesting help via MCP'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo ''" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Monitor command:'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "watch -n 30 'python3 scripts/maf/bead-assigner.py status | tail -20'" Enter

echo ""
echo "✅ Agents taught bead workflow!"
echo ""
echo "Agents now understand:"
echo "- How to check for available beads"
echo "- How to claim beads"
echo "- How to complete beads"
echo "- How to get more beads"
echo ""
echo "They will now autonomously manage their bead workflow!"