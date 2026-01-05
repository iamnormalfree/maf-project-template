#!/bin/bash
# Register an agent with MCP Agent Mail system
# Usage: ./register-agent-with-mcp.sh <agent-id> <agent-description>

set -e

AGENT_ID=$1
AGENT_DESCRIPTION=${2:-"Agent $AGENT_ID in MAF session"}
SESSION_NAME="maf-5pane"
PANE_NUM=$3  # Optional: tmux pane number

if [ -z "$AGENT_ID" ]; then
    echo "Usage: $0 <agent-id> [agent-description] [pane-num]"
    exit 1
fi

echo "=== Registering Agent: $AGENT_ID ==="

# Create registration JSON
cat > /tmp/agent-register-$AGENT_ID.json << EOF
{
  "agent_id": "$AGENT_ID",
  "description": "$AGENT_DESCRIPTION",
  "capabilities": [
    "file_reservation",
    "messaging",
    "task_coordination",
    "heartbeat"
  ],
  "metadata": {
    "session": "$SESSION_NAME",
    "pane": "$PANE_NUM",
    "registered_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  }
}
EOF

# Use Claude's MCP tools to register the agent
if [ -n "$PANE_NUM" ]; then
    tmux send-keys -t "$SESSION_NAME:0.$PANE_NUM" << 'EOF'
# Register with MCP Agent Mail
mcp__agent_mail__register_agent \
  --agent-id "$AGENT_ID" \
  --description "$AGENT_DESCRIPTION" \
  --capabilities file_reservation,messaging,task_coordination,heartbeat

# Create agent identity
mcp__agent_mail__create_agent_identity \
  --agent-id "$AGENT_ID" \
  --display-name "$AGENT_ID" \
  --type "implementor"
EOF

    echo "✅ Registration commands sent to pane $PANE_NUM"
else
    echo "Registration JSON created at /tmp/agent-register-$AGENT_ID.json"
    echo "Send registration commands manually or provide pane number"
fi

echo ""
echo "Agent $AGENT_ID registration initiated"