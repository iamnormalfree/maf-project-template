#!/bin/bash
# Integrate MAF agents with Agent Mail system

set -e

SESSION_NAME="maf-5pane"
AGENT_MAIL_DIR=".agent-mail"
PROJECT_ROOT="/root/projects/roundtable"
AGENT_MAIL_HOST="127.0.0.1"
AGENT_MAIL_PORT="8765"

# Prefer existing token so clients and server share credentials
AGENT_MAIL_TOKEN="${MCP_AGENT_MAIL_BEARER_TOKEN:-}"
if [[ -z "$AGENT_MAIL_TOKEN" && -f "$PROJECT_ROOT/.claude/settings.json" ]]; then
    AGENT_MAIL_TOKEN="$(jq -r '.env.MCP_AGENT_MAIL_BEARER_TOKEN // empty' "$PROJECT_ROOT/.claude/settings.json" 2>/dev/null || true)"
fi

mkdir -p "$PROJECT_ROOT/$AGENT_MAIL_DIR/logs"

# Function to send commands to tmux panes
send_to_pane() {
    local pane=$1
    shift
    tmux send-keys -t $SESSION_NAME:0.$pane "$@" Enter 2>/dev/null || true
}

echo "=== Integrating MAF Agents with Agent Mail ==="

# Start agent mail server in background
echo "Starting Agent Mail server..."
cd "$PROJECT_ROOT/mcp_agent_mail"
nohup env \
    HTTP_HOST="$AGENT_MAIL_HOST" \
    HTTP_PORT="$AGENT_MAIL_PORT" \
    HTTP_BEARER_TOKEN="$AGENT_MAIL_TOKEN" \
    ./venv_full/bin/python -m mcp_agent_mail.cli serve-http \
    > "$PROJECT_ROOT/$AGENT_MAIL_DIR/logs/server.log" 2>&1 &
SERVER_PID=$!
echo "Agent Mail server started with PID: $SERVER_PID"

# Store PID for cleanup
echo $SERVER_PID > "$PROJECT_ROOT/$AGENT_MAIL_DIR/server.pid"

cd "$PROJECT_ROOT"

sleep 2  # Let server start

# Update implementors to use agent mail
echo "Configuring implementors with Agent Mail..."

# Implementor 1
send_to_pane 1 "clear"
send_to_pane 1 "echo '=== IMPLEMENTOR 1 (with Agent Mail) ==='"
send_to_pane 1 "export AGENT_MAIL_URL='http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}'"
send_to_pane 1 "export AGENT_ID='implementor-1'"
send_to_pane 1 "echo 'Agent Mail integration enabled'"
send_to_pane 1 "echo 'Watching for bead assignments via Agent Mail...'"
send_to_pane 1 "while true; do"
send_to_pane 1 "  curl -s http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}/api/agents/implementor-1/next-bead 2>/dev/null | jq -r '.bead_id // empty' | while read bead; do"
send_to_pane 1 "    if [ -n \"\$bead\" ]; then"
send_to_pane 1 "      echo \"Agent Mail assigned bead: \$bead\""
send_to_pane 1 "      mcp__agent_mail__send_message --to 'coordinator' --subject \"Bead \$bead assigned\" --body \"Starting work on bead: \$bead\""
send_to_pane 1 "    fi"
send_to_pane 1 "  done"
send_to_pane 1 "  sleep 15"
send_to_pane 1 "done"

# Implementor 2
send_to_pane 2 "clear"
send_to_pane 2 "echo '=== IMPLEMENTOR 2 (with Agent Mail) ==='"
send_to_pane 2 "export AGENT_MAIL_URL='http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}'"
send_to_pane 2 "export AGENT_ID='implementor-2'"
send_to_pane 2 "echo 'Agent Mail integration enabled'"
send_to_pane 2 "echo 'Watching for bead assignments via Agent Mail...'"
send_to_pane 2 "while true; do"
send_to_pane 2 "  curl -s http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}/api/agents/implementor-2/next-bead 2>/dev/null | jq -r '.bead_id // empty' | while read bead; do"
send_to_pane 2 "    if [ -n \"\$bead\" ]; then"
send_to_pane 2 "      echo \"Agent Mail assigned bead: \$bead\""
send_to_pane 2 "      mcp__agent_mail__send_message --to 'coordinator' --subject \"Bead \$bead assigned\" --body \"Starting work on bead: \$bead\""
send_to_pane 2 "    fi"
send_to_pane 2 "  done"
send_to_pane 2 "  sleep 15"
send_to_pane 2 "done"

# Implementor 3
send_to_pane 3 "clear"
send_to_pane 3 "echo '=== IMPLEMENTOR 3 (with Agent Mail) ==='"
send_to_pane 3 "export AGENT_MAIL_URL='http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}'"
send_to_pane 3 "export AGENT_ID='implementor-3'"
send_to_pane 3 "echo 'Agent Mail integration enabled'"
send_to_pane 3 "echo 'Watching for bead assignments via Agent Mail...'"
send_to_pane 3 "while true; do"
send_to_pane 3 "  curl -s http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}/api/agents/implementor-3/next-bead 2>/dev/null | jq -r '.bead_id // empty' | while read bead; do"
send_to_pane 3 "    if [ -n \"\$bead\" ]; then"
send_to_pane 3 "      echo \"Agent Mail assigned bead: \$bead\""
send_to_pane 3 "      mcp__agent_mail__send_message --to 'coordinator' --subject \"Bead \$bead assigned\" --body \"Starting work on bead: \$bead\""
send_to_pane 3 "    fi"
send_to_pane 3 "  done"
send_to_pane 3 "  sleep 15"
send_to_pane 3 "done"

# Reviewer
send_to_pane 4 "clear"
send_to_pane 4 "echo '=== REVIEWER (with Agent Mail) ==='"
send_to_pane 4 "export AGENT_MAIL_URL='http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}'"
send_to_pane 4 "export AGENT_ID='reviewer'"
send_to_pane 4 "echo 'Agent Mail integration enabled'"
send_to_pane 4 "watch -n 30 'curl -s http://${AGENT_MAIL_HOST}:${AGENT_MAIL_PORT}/api/beads/status?status=assigned | head -10'"

echo ""
echo "✅ Agent Mail integration complete!"
echo ""
echo "Server running at: http://localhost:8765"
echo "Logs at: .agent-mail/logs/server.log"
echo "To stop server: kill \$(cat .agent-mail/server.pid)"
echo ""
echo "Agents will now coordinate through Agent Mail for bead assignment!"
