#!/bin/bash
# Initialize Claude agents in each pane with their tasks - V2

set -e

SESSION_NAME="maf-5pane"

echo "=== Initializing Claude Agents V2 ==="

# Function to initialize a Claude agent
init_claude_agent() {
    local pane=$1
    local agent_name=$2
    local bead_id=$3
    local task=$4

    echo "Initializing $agent_name in pane $pane..."

    # Navigate to pane and ensure we're in the right directory
    tmux send-keys -t "$SESSION_NAME:0.$pane" "C-c" 2>/dev/null || true
    sleep 1

    # Start Claude with explicit settings directory
    tmux send-keys -t "$SESSION_NAME:0.$pane" "claude --settings /root/projects/roundtable/.claude" Enter
    sleep 3

    # Use MCP Agent Mail for task management
    tmux send-keys -t "$SESSION_NAME:0.$pane" "mcp__agent_mail__macro_start_session --agent-id '$agent_name' --task '$task' --bead-id '$bead_id'" Enter
    sleep 2
}

# Get current bead assignments
echo "Checking current bead assignments..."
assignments=$(python3 scripts/maf/bead-assigner.py status 2>/dev/null | head -50)

# Initialize each agent with their assigned bead
init_claude_agent 1 "Implementor-1" "roundtable-vf5" "Create Circle page rendering from published JSON for the Roundtable site. Implement template that displays published posts in a circle format with proper styling."
init_claude_agent 2 "Implementor-2" "roundtable-dsg" "Implement Room page rendering as decision memos. Create templates that display individual posts as formal decision documents with appropriate metadata."
init_claude_agent 3 "Implementor-3" "roundtable-tfh" "Initialize Eleventy site with templates. Set up the basic site structure, configuration, and starter templates for the Roundtable publishing system."

# Initialize reviewer
tmux send-keys -t "$SESSION_NAME:0.4" "C-c" 2>/dev/null || true
sleep 1
tmux send-keys -t "$SESSION_NAME:0.4" "claude --settings /root/projects/roundtable/.claude" Enter
sleep 3
tmux send-keys -t "$SESSION_NAME:0.4" "echo '=== REVIEWER TASK ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Monitor all implementor work. Review pull requests. Ensure quality standards.'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Auto-approve safe bash commands. Escalate complex changes.'" Enter

# Update coordinator
tmux send-keys -t "$SESSION_NAME:0.0" "C-c" 2>/dev/null || true
tmux send-keys -t "$SESSION_NAME:0.0" "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo '=== MAF COORDINATOR ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Claude Agents: INITIALIZED V2'" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Settings: /root/projects/roundtable/.claude'" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Auto-approval: ENABLED'" Enter
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Status: ACTIVE'" Enter

echo ""
echo "✅ Claude agents initialized V2!"
echo ""
echo "Each agent has:"
echo "  • Explicit settings directory path"
echo "  • Response Awareness Light framework"
echo "  • Auto-approval configured"
echo ""
echo "Check status:"
echo "  tmux capture-pane -t maf-5pane:0.1 -p | tail -10"