#!/bin/bash
# Initialize Claude agents in each pane with their tasks

SESSION_NAME="maf-5pane"

echo "=== Initializing Claude Agents ==="

# Function to initialize a Claude agent
init_claude_agent() {
    local pane=$1
    local agent_name=$2
    local bead_id=$3
    local task=$4

    echo "Initializing $agent_name in pane $pane..."

    # Navigate to pane and ensure Claude is running
    tmux send-keys -t "$SESSION_NAME:0.$pane" "C-c" 2>/dev/null
    sleep 1
    tmux send-keys -t "$SESSION_NAME:0.$pane" "claude" Enter
    sleep 3

    # Send the task via MCP Agent Mail
    tmux send-keys -t "$SESSION_NAME:0.$pane" "mcp__agent_mail__macro_start_session --agent-id '$agent_name' --task '$task' --bead-id '$bead_id'" Enter
    sleep 2

    # Auto-approve the first command if needed
    sleep 5
    if tmux capture-pane -t "$SESSION_NAME:0.$pane" -p | grep -q "\[y/N\]\:"; then
        echo "Auto-approving initial command for $agent_name"
        tmux send-keys -t "$SESSION_NAME:0.$pane" "y" Enter
    fi
}

# Get current bead assignments
echo "Checking current bead assignments..."
assignments=$(python3 scripts/maf/bead-assigner.py status 2>/dev/null)

# Initialize each agent with their assigned bead
if echo "$assignments" | grep -q "roundtable-vf5.*implementor-1"; then
    init_claude_agent 1 "Implementor-1" "roundtable-vf5" "Create Circle page rendering from published JSON for the Roundtable site. Implement template that displays published posts in a circle format with proper styling."
fi

if echo "$assignments" | grep -q "roundtable-dsg.*implementor-2"; then
    init_claude_agent 2 "Implementor-2" "roundtable-dsg" "Implement Room page rendering as decision memos. Create templates that display individual posts as formal decision documents with appropriate metadata."
fi

# Check for implementor-3 assignments
if echo "$assignments" | grep -q "roundtable-tfh.*implementor-3"; then
    init_claude_agent 3 "Implementor-3" "roundtable-tfh" "Initialize Eleventy site with templates. Set up the basic site structure, configuration, and starter templates for the Roundtable publishing system."
elif echo "$assignments" | grep -q "roundtable-e0i.*implementor-3"; then
    init_claude_agent 3 "Implementor-3" "roundtable-e0i" "Create post drafts and send approval emails. Implement the email draft generation system and approval workflow notifications."
fi

# Initialize reviewer
tmux send-keys -t "$SESSION_NAME:0.4" "C-c" 2>/dev/null
sleep 1
tmux send-keys -t "$SESSION_NAME:0.4" "claude" Enter
sleep 3
tmux send-keys -t "$SESSION_NAME:0.4 "echo '=== REVIEWER TASK ===' " Enter
tmux send-keys -t "$SESSION_NAME:0.4 "echo 'Monitor all implementor work. Review pull requests. Ensure quality standards.' " Enter
tmux send-keys -t "$SESSION_NAME:0.4 "echo 'Auto-approve safe bash commands. Escalate complex changes.' " Enter

# Update coordinator with status
tmux send-keys -t "$SESSION_NAME:0.0" "C-c" 2>/dev/null
tmux send-keys -t "$SESSION_NAME:0.0" "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo '=== MAF COORDINATOR ===' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Claude Agents: INITIALIZED' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Auto-approval: ENABLED (safe commands)' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Reviewer: MONITORING' " Enter
tmux send-keys -t "$SESSION_NAME:0.0 "echo 'Status: ACTIVE' " Enter

echo ""
echo "✅ Claude agents initialized!"
echo ""
echo "Each agent will:"
echo "  • Use Response Awareness Framework"
echo "  • Auto-approve safe bash commands"
echo "  • Escalate complex changes to reviewer"
echo "  • Work autonomously on assigned beads"
echo ""
echo "Monitor status:"
echo "  ./scripts/maf/claude-agent-monitor.sh"