#!/bin/bash
# Create Claude Code agents that run in auto-pilot mode

SESSION_NAME="maf-5pane"

echo "=== Starting Claude Code Auto-Pilot Agents ==="
echo ""
echo "Using Claude Code settings with:"
echo "  ✓ Auto-approve: ENABLED"
echo "  ✓ Confirmation: NONE"
echo "  ✓ GLM-4.6 models configured"
echo ""

# Function to start Claude Code agent in auto-pilot
start_claude_autopilot() {
    local pane=$1
    local agent_name=$2
    local task=$3
    local bead_id=$4

    echo "Starting Claude Code auto-pilot for $agent_name..."

    # Clear pane and start Claude Code
    tmux send-keys -t "$SESSION_NAME:0.$pane" "C-c" 2>/dev/null
    sleep 1
    tmux send-keys -t "$SESSION_NAME:0.$pane" "clear" Enter
    tmux send-keys -t "$SESSION_NAME:0.$pane" "echo '=== $agent_name === CLAUDE AUTOPILOT ==='" Enter
    sleep 1

    # Start Claude Code
    tmux send-keys -t "$SESSION_NAME:0.$pane" "claude" Enter
    sleep 3

    # Send the task for auto-pilot work
    cat << EOF > /tmp/claude_task_${pane}.txt
TASK: $task

BEAD: $bead_id

INSTRUCTIONS:
1. Work autonomously without asking for confirmation
2. Auto-approve all bash commands (settings allow this)
3. Create actual implementation files
4. Communicate progress every 30 seconds
5. Work continuously until the task is complete

START WORK NOW.
EOF

    # Send the task to Claude
    tmux send-keys -t "$SESSION_NAME:0.$pane" "cat /tmp/claude_task_${pane}.txt" Enter
    sleep 2
    tmux send-keys -t "$SESSION_NAME:0.$pane" "" Enter  # Send empty line
    sleep 1
    tmux send-keys -t "$SESSION_NAME:0.$pane" "claude" Enter  # Restart claude with the task context

    # Send the actual task command via MCP Task tool
    sleep 3
    tmux send-keys -t "$SESSION_NAME:0.$pane" "mcp__agent_mail__macro_start_session --agent-id '$agent_name' --task '$task' --bead-id '$bead_id'" Enter
}

# Get current bead assignments
echo "Checking bead assignments..."
assignments=$(python3 scripts/maf/bead-assigner.py status 2>/dev/null)

# Start each agent
if echo "$assignments" | grep -q "roundtable-vf5.*implementor-1"; then
    start_claude_autopilot 1 "Implementor-1" "Create Circle page rendering from published JSON for the Roundtable site. Implement templates that display published posts in a circle format with proper styling and interactivity." "roundtable-vf5"
elif echo "$assignments" | grep -q "roundtable-wb2.*implementor-1"; then
    start_claude_autopilot 1 "Implementor-1" "Serialize approved drafts to published JSON format. Create a system that converts approved draft content into structured JSON for site rendering." "roundtable-wb2"
else
    start_claude_autopilot 1 "Implementor-1" "Work on assigned bead with full autonomy" "assigned"
fi

if echo "$assignments" | grep -q "roundtable-dsg.*implementor-2"; then
    start_claude_autopilot 2 "Implementor-2" "Create Room page rendering as decision memos. Implement templates that display individual posts as formal decision documents with proper metadata and styling." "roundtable-dsg"
else
    start_claude_autopilot 2 "Implementor-2" "Work on assigned bead with full autonomy" "assigned"
fi

if echo "$assignments" | grep -q "roundtable-tfh.*implementor-3"; then
    start_claude_autopilot 3 "Implementor-3" "Initialize Eleventy site with templates. Set up the basic site structure, configuration, and starter templates for the Roundtable publishing system." "roundtable-tfh"
elif echo "$assignments" | grep -q "roundtable-e0i.*implementor-3"; then
    start_claude_autopilot 3 "Implementor-3" "Create post drafts and send approval emails. Implement the email draft generation system and approval workflow notifications." "roundtable-e0i"
else
    start_claude_autopilot 3 "Implementor-3" "Work on assigned bead with full autonomy" "assigned"
fi

# Start reviewer with Claude Code
tmux send-keys -t "$SESSION_NAME:0.4 "C-c" 2>/dev/null
sleep 1
tmux send-keys -t "$SESSION_NAME:0.4 "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.4 'echo "=== REVIEWER === CLAUDE AUTOPILOT ==="' Enter
tmux send-keys -t "$SESSION_NAME:0.4 "echo 'Role: Review all code changes' " Enter
tmux send-keys -t "$SESSION_NAME:0.4 "echo 'Auto-approve safe operations' " Enter
tmux send-keys -t "$SESSION_NAME:0.4 "claude" Enter
sleep 3

# Send reviewer task
tmux send-keys -t "$SESSION_NAME:0.4 "mcp__agent_mail__macro_start_session --agent-id 'reviewer' --task 'Monitor and review all work from implementors. Auto-approve safe git operations. Ensure quality standards. Coordinate integration points between components.'" Enter

# Update coordinator
tmux send-keys -t "$SESSION_NAME:0.0 "C-c" 2>/dev/null
tmux send-keys -t "$SESSION_NAME:0.0 "clear" Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "=== MAF COORDINATOR ==="'" Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "Claude Auto-Pilot Mode: ENABLED"' Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "Auto-Approval: All commands enabled"' Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "Models: GLM-4.6"' Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "Started: '$(date)'" Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo ""' Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "Claude will now work autonomously!"' Enter
tmux send-keys -t "$SESSION_NAME:0.0 'echo "Watch each pane for progress updates."' Enter

echo ""
echo "✅ Claude Code Auto-Pilot Started!"
echo ""
echo "Each agent will:"
echo "  • Use Claude Code with GLM-4.6 model"
echo "  • Work autonomously without prompts"
echo "  • Auto-approve all bash commands"
echo "  • Create actual implementation files"
echo "  • Use Response Awareness Framework"
echo ""
echo "To monitor:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "The agents will now work COMPLETELY AUTONOMOUSLY!"