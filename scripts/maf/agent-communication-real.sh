#!/bin/bash
# Real agent communication using MCP Agent Mail
# Replaces echo-based simulated communication with actual message passing

set -e

SESSION_NAME="maf-5pane"
AGENT_MAIL_URL="http://127.0.0.1:8765"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to send a real message via MCP Agent Mail
send_message() {
    local from_agent=$1
    local to_agent=$2
    local message=$3
    local pane_num=$4

    echo -e "${BLUE}📧 Sending message from $from_agent to $to_agent${NC}"

    if [ -n "$pane_num" ]; then
        # Send command to agent pane
        tmux send-keys -t "$SESSION_NAME:0.$pane_num" << EOF
# Send message via MCP Agent Mail
mcp__agent_mail__send_message \
  --to "$to_agent" \
  --message "$message" \
  --subject "Status Update" \
  --from "$from_agent"

echo "✅ Message sent to $to_agent"
EOF
    fi
}

# Function to check agent inbox
check_inbox() {
    local agent_id=$1
    local pane_num=$2

    echo -e "${YELLOW}📬 Checking inbox for $agent_id${NC}"

    if [ -n "$pane_num" ]; then
        tmux send-keys -t "$SESSION_NAME:0.$pane_num" << EOF
# Check for new messages
mcp__agent_mail__fetch_inbox \
  --agent-id "$agent_id" \
  --limit 10

echo "--- End of inbox ---"
EOF
    fi
}

# Function to send heartbeat
send_heartbeat() {
    local agent_id=$1
    local pane_num=$2
    local status=${3:-"working"}

    if [ -n "$pane_num" ]; then
        tmux send-keys -t "$SESSION_NAME:0.$pane_num" << EOF
# Send heartbeat
mcp__agent_mail__send_message \
  --to "reviewer" \
  --message "♥ heartbeat - Status: $status" \
  --subject "Heartbeat" \
  --from "$agent_id"
EOF
    fi
}

# Function to detect stuck agent
check_agent_stuck() {
    local target_agent=$1
    local checking_agent=$2
    local pane_num=$3

    echo -e "${YELLOW}⚠️  Checking if $target_agent is stuck...${NC}"

    if [ -n "$pane_num" ]; then
        tmux send-keys -t "$SESSION_NAME:0.$pane_num" << EOF
# Check if agent is stuck
mcp__agent_mail__send_message \
  --to "$target_agent" \
  --message "🔍 Status check: Are you stuck? Last activity?" \
  --subject "Stuck Agent Check" \
  --from "$checking_agent"

echo "Ping sent to $target_agent"
EOF
    fi
}

# Main execution
case "${1:-help}" in
    "send")
        send_message "$2" "$3" "$4" "$5"
        ;;
    "check")
        check_inbox "$2" "$3"
        ;;
    "heartbeat")
        send_heartbeat "$2" "$3" "$4"
        ;;
    "stuck")
        check_agent_stuck "$2" "$3" "$4"
        ;;
    "monitor")
        # Start monitoring all agents
        echo -e "${GREEN}🚀 Starting real agent communication monitoring${NC}"

        # Register and start communication for each agent
        echo "Implementor-1 (Circle page): Pane 1"
        send_heartbeat "implementor-1" "1" "working on Circle page rendering"

        echo "Implementor-2 (Room page): Pane 2"
        send_heartbeat "implementor-2" "2" "working on Room page rendering"

        echo "Implementor-3 (Eleventy): Pane 3"
        send_heartbeat "implementor-3" "3" "working on Eleventy setup"

        echo "Reviewer: Pane 4"
        check_inbox "reviewer" "4"
        ;;
    "help"|*)
        echo "Usage: $0 {send|check|heartbeat|stuck|monitor}"
        echo ""
        echo "Commands:"
        echo "  send <from> <to> <message> <pane>    Send message via MCP"
        echo "  check <agent> <pane>                 Check agent's inbox"
        echo "  heartbeat <agent> <pane> [status]    Send heartbeat"
        echo "  stuck <target> <checker> <pane>      Check if agent is stuck"
        echo "  monitor                              Start monitoring all agents"
        echo ""
        echo "Examples:"
        echo "  $0 monitor                          # Monitor all agents"
        echo "  $0 stuck implementor-2 reviewer 4   # Check if implementor-2 is stuck"
        echo "  $0 send implementor-1 reviewer \"Task complete\" 1"
        ;;
esac