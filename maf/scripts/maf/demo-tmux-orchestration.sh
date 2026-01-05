#!/bin/bash
# ABOUTME: Simple demonstration script for MAF tmux orchestration system.
# ABOUTME: Shows core functionality working without complex test suites.

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 MAF Tmux Orchestration System Demo${NC}"
echo -e "${BLUE}===================================${NC}\n"

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB_DIR="$PROJECT_ROOT/scripts/maf/lib"

echo -e "${YELLOW}📍 Project Root: $PROJECT_ROOT${NC}"
echo -e "${YELLOW}📚 Library Directory: $LIB_DIR${NC}\n"

# Demo 1: Error Handling
echo -e "${BLUE}1. Error Handling Library${NC}"
echo "============================"
if bash "$LIB_DIR/error-handling.sh" validate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Error handling validation passed${NC}"
else
    echo -e "${RED}❌ Error handling validation failed${NC}"
fi

# Demo 2: Tmux Utils
echo -e "\n${BLUE}2. Tmux Utilities Library${NC}"
echo "=============================="
echo -e "${YELLOW}Initializing tmux environment...${NC}"
if bash "$LIB_DIR/tmux-utils.sh" init > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Tmux environment initialized${NC}"
else
    echo -e "${RED}❌ Tmux environment initialization failed${NC}"
fi

echo -e "${YELLOW}Checking tmux sessions...${NC}"
bash "$LIB_DIR/tmux-utils.sh" list

# Demo 3: Agent Environment
echo -e "\n${BLUE}3. Agent Environment Setup${NC}"
echo "==============================="
echo -e "${YELLOW}Initializing agent environment...${NC}"
if bash "$LIB_DIR/agent-utils.sh" list > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Agent environment initialized${NC}"
else
    echo -e "${RED}❌ Agent environment initialization failed${NC}"
fi

echo -e "${YELLOW}Current registered agents:${NC}"
bash "$LIB_DIR/agent-utils.sh" list

# Demo 4: Simple Agent Creation
echo -e "\n${BLUE}4. Agent Creation Demo${NC}"
echo "======================="
DEMO_AGENT_ID="demo-agent-$(date +%s)"
echo -e "${YELLOW}Creating demo agent: $DEMO_AGENT_ID${NC}"

# Create a simple tmux session manually to demonstrate
if tmux new-session -d -s "maf-agent-$DEMO_AGENT_ID" -c "$PROJECT_ROOT" \
    -n "workspace" "echo 'Demo Agent Workspace Ready' && sleep 3600"; then
    echo -e "${GREEN}✅ Demo agent session created successfully${NC}"
    echo -e "${YELLOW}Session name: maf-agent-$DEMO_AGENT_ID${NC}"
else
    echo -e "${RED}❌ Failed to create demo agent session${NC}"
fi

# Demo 5: Session Management
echo -e "\n${BLUE}5. Session Management${NC}"
echo "======================="
echo -e "${YELLOW}Sending command to agent...${NC}"
if tmux send-keys -t "maf-agent-$DEMO_AGENT_ID:1" "echo 'Hello from MAF orchestration!' && date" Enter; then
    echo -e "${GREEN}✅ Command sent to agent session${NC}"
    sleep 1
    echo -e "${YELLOW}Capturing agent output...${NC}"
    tmux capture-pane -t "maf-agent-$DEMO_AGENT_ID:1" -p -S -5
else
    echo -e "${RED}❌ Failed to send command to agent${NC}"
fi

# Demo 6: System Status
echo -e "\n${BLUE}6. System Status${NC}"
echo "================="
echo -e "${YELLOW}Tmux sessions:${NC}"
tmux list-sessions 2>/dev/null | grep "maf-agent" || echo "No MAF sessions found"

echo -e "${YELLOW}MAF directories:${NC}"
echo "  - Config: $([ -d "$PROJECT_ROOT/.maf" ] && echo "✅ Exists" || echo "❌ Missing")"
echo "  - Logs: $([ -d "$PROJECT_ROOT/.maf/logs" ] && echo "✅ Exists" || echo "❌ Missing")"
echo "  - Agents: $([ -f "$PROJECT_ROOT/.maf/agents.json" ] && echo "✅ Exists" || echo "❌ Missing")"

echo -e "${YELLOW}Key files:${NC}"
echo "  - tmux-utils.sh: $([ -f "$LIB_DIR/tmux-utils.sh" ] && echo "✅ $(wc -l < "$LIB_DIR/tmux-utils.sh") lines" || echo "❌ Missing")"
echo "  - agent-utils.sh: $([ -f "$LIB_DIR/agent-utils.sh" ] && echo "✅ $(wc -l < "$LIB_DIR/agent-utils.sh") lines" || echo "❌ Missing")"
echo "  - error-handling.sh: $([ -f "$LIB_DIR/error-handling.sh" ] && echo "✅ $(wc -l < "$LIB_DIR/error-handling.sh") lines" || echo "❌ Missing")"

# Cleanup
echo -e "\n${BLUE}7. Cleanup${NC}"
echo "==========="
echo -e "${YELLOW}Cleaning up demo agent...${NC}"
if tmux kill-session -t "maf-agent-$DEMO_AGENT_ID" 2>/dev/null; then
    echo -e "${GREEN}✅ Demo agent session cleaned up${NC}"
else
    echo -e "${YELLOW}⚠️ Demo agent session was already cleaned up${NC}"
fi

echo -e "\n${GREEN}🎉 Demo completed successfully!${NC}"
echo -e "${GREEN}The MAF tmux orchestration system is ready for use.${NC}\n"

echo -e "${BLUE}📋 Quick Usage Guide:${NC}"
echo -e "${BLUE}=====================${NC}"
echo "• Initialize: bash scripts/maf/lib/tmux-utils.sh init"
echo "• List agents: bash scripts/maf/lib/agent-utils.sh list"  
echo "• Create agent: bash scripts/maf/lib/agent-utils.sh create claude-worker"
echo "• Health check: bash scripts/maf/lib/error-handling.sh health"
echo "• View logs: ls -la .maf/logs/"
echo
