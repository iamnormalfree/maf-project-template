#!/bin/bash
# Start agents with bead workflow using fixed command execution

set -e

SESSION_NAME="maf-5pane"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/claude-cli-fix.sh"
PROJECT_ROOT="/root/projects/roundtable"
AGENT_MAIL_HOST="127.0.0.1"
AGENT_MAIL_PORT="8765"

# Reuse configured bearer token when possible so MCP clients match the server
AGENT_MAIL_TOKEN="${MCP_AGENT_MAIL_BEARER_TOKEN:-}"
if [[ -z "$AGENT_MAIL_TOKEN" && -f "$PROJECT_ROOT/.claude/settings.json" ]]; then
    AGENT_MAIL_TOKEN="$(jq -r '.env.MCP_AGENT_MAIL_BEARER_TOKEN // empty' "$PROJECT_ROOT/.claude/settings.json" 2>/dev/null || true)"
fi

mkdir -p "$PROJECT_ROOT/.agent-mail/logs"

echo "=== Starting Agents with Bead Workflow ==="

# Check if MCP Agent Mail is running
if ! curl -sfm 2 "http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}/health/liveness" >/dev/null 2>&1; then
    echo "Starting MCP Agent Mail server..."
    (
        cd "$PROJECT_ROOT/mcp_agent_mail"
        HTTP_HOST="$AGENT_MAIL_HOST" \
        HTTP_PORT="$AGENT_MAIL_PORT" \
        HTTP_BEARER_TOKEN="$AGENT_MAIL_TOKEN" \
        ./venv_full/bin/python -m mcp_agent_mail.cli serve-http >> "$PROJECT_ROOT/.agent-mail/logs/server.log" 2>&1 &
        echo $! > "$PROJECT_ROOT/.agent-mail/server.pid"
    )
    # Give the server a moment to come up, then verify health
    sleep 2
    if ! curl -sfm 2 "http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}/health/liveness" >/dev/null 2>&1; then
        echo "⚠️  MCP Agent Mail failed to start. Check $PROJECT_ROOT/.agent-mail/logs/server.log"
    fi
fi

# Kill existing session if it exists
tmux kill-session -t $SESSION_NAME 2>/dev/null || true
sleep 1

# Create new session
tmux new-session -d -s $SESSION_NAME -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux split-window -h -c /root/projects/roundtable
tmux select-layout even-horizontal

# Split first pane vertically
tmux select-pane -t 0
tmux split-window -v -c /root/projects/roundtable

# Function to start agent in pane using safe command execution
start_agent() {
    local pane=$1
    local agent_name=$2
    local agent_id=$3

    echo "Starting $agent_name in pane $pane..."

    # Start Claude CLI in the pane
    send_command_to_session_safe "$SESSION_NAME" "$pane" "claude" 5

    # Wait for Claude to start
    sleep 3

    # Configure the agent with bead workflow
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo '=== $agent_name ==='" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'Agent ID: $agent_id'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'Working with MAF Bead System'" 2

    # Register with MCP Agent Mail
    send_command_to_session_safe "$SESSION_NAME" "$pane" "mcp__agent_mail__register_agent --agent-id '$agent_id' --description '$agent_name - Bead workflow agent' --capabilities file_reservation,messaging,task_coordination,heartbeat" 3

    # Teach bead workflow
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'BEAD WORKFLOW:'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo '1. Check available beads: python3 scripts/maf/bead-assigner.py status'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo '2. Claim a bead: python3 scripts/maf/bead-assigner.py claim --agent $agent_id'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo '3. Work on the bead task'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo '4. Complete bead: python3 scripts/maf/bead-assigner.py complete --bead <bead_id>'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo '5. Repeat for more beads'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'Use MCP Agent Mail when stuck!'" 2
}

# Function to give bead-specific task
give_bead_task() {
    local pane=$1
    local agent_name=$2
    local bead_id=$3
    local task_description=$4

    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo ''" 1
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'ASSIGNED BEAD: $bead_id'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'TASK: $task_description'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "echo 'Starting bead workflow...'" 2
    send_command_to_session_safe "$SESSION_NAME" "$pane" "python3 scripts/maf/bead-assigner.py status" 3
}

# Start agents
start_agent 1 "IMPLEMENTOR-1" "implementor-1"
sleep 2
start_agent 2 "IMPLEMENTOR-2" "implementor-2"
sleep 2
start_agent 3 "IMPLEMENTOR-3" "implementor-3"
sleep 2
start_agent 4 "REVIEWER" "reviewer"

# Configure coordinator pane
echo "Configuring coordinator..."
send_command_to_session_safe "$SESSION_NAME" "0" "echo '=== MAF COORDINATOR ==='" 2
send_command_to_session_safe "$SESSION_NAME" "0" "echo 'Monitoring bead workflow...'" 2
send_command_to_session_safe "$SESSION_NAME" "0" "echo 'MCP Agent Mail: http://127.0.0.1:8765/mail'" 2

# Give specific bead tasks based on current assignments
echo "Assigning bead tasks..."
give_bead_task 1 "IMPLEMENTOR-1" "roundtable-vf5" "Circle page rendering from published JSON - create template that displays published posts in circle format"
give_bead_task 2 "IMPLEMENTOR-2" "roundtable-dsg" "Room page rendering as decision memos - create templates for formal decision documents"
give_bead_task 3 "IMPLEMENTOR-3" "roundtable-tfh" "Eleventy site setup - configure site structure and templates"

# Configure reviewer to monitor
send_command_to_session_safe "$SESSION_NAME" "4" "echo ''" 1
send_command_to_session_safe "$SESSION_NAME" "4" "echo 'REVIEWER TASKS:'" 2
send_command_to_session_safe "$SESSION_NAME" "4" "echo '- Monitor bead completions'" 2
send_command_to_session_safe "$SESSION_NAME" "4" "echo '- Review agent work'" 2
send_command_to_session_safe "$SESSION_NAME" "4" "echo '- Help stuck agents via MCP Agent Mail'" 2
send_command_to_session_safe "$SESSION_NAME" "4" "echo '- Check bead status: python3 scripts/maf/bead-assigner.py status'" 2

echo ""
echo "✅ Agents started with bead workflow!"
echo ""
echo "Session ready: tmux attach -t $SESSION_NAME"
echo ""
echo "Agents will now:"
echo "1. Check bead status"
echo "2. Claim available beads"
echo "3. Work on assigned tasks"
echo "4. Complete beads for new assignments"
echo "5. Use MCP Agent Mail when stuck"
echo ""
echo "Monitor progress: http://127.0.0.1:8765/mail"
