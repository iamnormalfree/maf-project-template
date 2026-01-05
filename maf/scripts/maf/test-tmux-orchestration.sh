#!/bin/bash
# ABOUTME: Comprehensive test script for MAF tmux orchestration system.
# ABOUTME: Validates integration between tmux-utils, agent-utils, and error-handling libraries.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# Source all libraries
source "$LIB_DIR/error-handling.sh"
source "$LIB_DIR/tmux-utils.sh"
source "$LIB_DIR/agent-utils.sh"

# Test configuration
TEST_AGENT_ID="test-worker-$(date +%s)"
TEST_SESSION_NAME="maf-agent-$TEST_AGENT_ID"

# Colors for output
echo -e "\n${BLUE}🧪 MAF Tmux Orchestration System Test${NC}"
echo -e "${BLUE}======================================${NC}\n"

# Test function runner
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "${YELLOW}Testing: $test_name${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}\n"
        return 0
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}\n"
        return 1
    fi
}

# Cleanup function
cleanup_test() {
    echo -e "\n${YELLOW}🧹 Cleaning up test environment...${NC}"
    
    # Delete test agent if it exists
    if bash "$LIB_DIR/agent-utils.sh" list | grep -q "$TEST_AGENT_ID"; then
        echo "Deleting test agent: $TEST_AGENT_ID"
        bash "$LIB_DIR/agent-utils.sh" delete "$TEST_AGENT_ID" "true" || true
    fi
    
    # Kill test session if it exists
    if tmux list-sessions 2>/dev/null | grep -q "^$TEST_SESSION_NAME:"; then
        echo "Killing test session: $TEST_SESSION_NAME"
        tmux kill-session -t "$TEST_SESSION_NAME" || true
    fi
    
    echo -e "${GREEN}Cleanup completed${NC}\n"
}

# Set trap for cleanup
trap cleanup_test EXIT INT TERM

# Test 1: Error Handling Library Validation
run_test "Error Handling Library - Prerequisites Validation" \
    "bash '$LIB_DIR/error-handling.sh' validate"

run_test "Error Handling Library - Health Check" \
    "bash '$LIB_DIR/error-handling.sh' health"

# Test 2: Tmux Utilities Library Validation
run_test "Tmux Utilities - Installation Validation" \
    "bash '$LIB_DIR/tmux-utils.sh' validate"

run_test "Tmux Utilities - Environment Initialization" \
    "bash '$LIB_DIR/tmux-utils.sh' init"

run_test "Tmux Utilities - Session Listing" \
    "bash '$LIB_DIR/tmux-utils.sh' list"

# Test 3: Agent Utilities Library Validation
run_test "Agent Utilities - Environment Initialization" \
    "bash '$LIB_DIR/agent-utils.sh' list"

run_test "Agent Utilities - Agent Type Validation" \
    "source '$LIB_DIR/agent-utils.sh' && validate_agent_type 'claude-worker'"

# Test 4: Agent Creation and Management
run_test "Agent Creation - claude-worker type" \
    "TEST_ID=\$(bash '$LIB_DIR/agent-utils.sh' create 'claude-worker' '$TEST_AGENT_ID' 'Test agent for orchestration validation') && [[ \"\$TEST_ID\" == \"$TEST_AGENT_ID\" ]]"

run_test "Agent Registration Verification" \
    "bash '$LIB_DIR/agent-utils.sh' list | grep -q '$TEST_AGENT_ID'"

run_test "Agent Session Creation Verification" \
    "tmux list-sessions | grep -q '^$TEST_SESSION_NAME:'"

run_test "Agent Status Update" \
    "bash '$LIB_DIR/agent-utils.sh' health '$TEST_AGENT_ID'"

# Test 5: Session Management
run_test "Session Command Sending" \
    "source '$LIB_DIR/tmux-utils.sh' && send_command_to_session '$TEST_AGENT_ID' '1' 'echo \"Test command executed\"'"

run_test "Session Output Capture" \
    "source '$LIB_DIR/tmux-utils.sh' && capture_session_output '$TEST_AGENT_ID' '1' '5' | grep -q 'Test command executed'"

run_test "Session Status Check" \
    "source '$LIB_DIR/tmux-utils.sh' && [[ \"\$(get_session_status '$TEST_AGENT_ID')\" == running* ]]"

# Test 6: Integration with MAF CLI
run_test "MAF CLI Integration - Command Execution" \
    "source '$LIB_DIR/agent-utils.sh' && run_maf_command '$TEST_AGENT_ID' 'npm run maf:health-check'"

run_test "Agent Statistics Collection" \
    "bash '$LIB_DIR/agent-utils.sh' stats '$TEST_AGENT_ID' | grep -q '$TEST_AGENT_ID'"

# Test 7: Multi-Agent Scenarios
AGENT2_ID="test-reviewer-$(date +%s)"
AGENT2_SESSION="maf-agent-$AGENT2_ID"

run_test "Multiple Agent Creation - codex-reviewer" \
    "bash '$LIB_DIR/agent-utils.sh' create 'codex-reviewer' '$AGENT2_ID' 'Test reviewer agent'"

run_test "Multiple Agent Session Verification" \
    "tmux list-sessions | grep -q '^$AGENT2_SESSION:'"

# Test 8: Agent Health Monitoring
run_test "Agent Health Check - All Agents" \
    "bash '$LIB_DIR/agent-utils.sh' health"

run_test "Agent Health Check - Specific Agent" \
    "bash '$LIB_DIR/agent-utils.sh' health '$TEST_AGENT_ID'"

# Test 9: Resource Monitoring
run_test "Resource Usage Monitoring" \
    "source '$LIB_DIR/tmux-utils.sh' && monitor_resource_usage '$TEST_AGENT_ID' | grep -E '^[0-9]+\.[0-9]+\|[0-9]+\.[0-9]+\|'"

# Test 10: Cleanup and Teardown
run_test "Agent Stopping" \
    "bash '$LIB_DIR/agent-utils.sh' stop '$TEST_AGENT_ID'"

run_test "Agent Deletion" \
    "bash '$LIB_DIR/agent-utils.sh' delete '$AGENT2_ID' 'true'"

# Test 11: Configuration and File Management
run_test "Configuration Files Creation" \
    "[[ -f '$PROJECT_ROOT/.maf/agents.json' ]] && [[ -f '$PROJECT_ROOT/.maf/agent.env' ]] && [[ -f '$PROJECT_ROOT/.maf/tmux.conf' ]]"

run_test "Log Directory Structure" \
    "[[ -d '$PROJECT_ROOT/.maf/logs' ]] && [[ -d '$PROJECT_ROOT/.maf/logs/agents' ]]"

run_test "Agent Registry Format Validation" \
    "jq empty '$PROJECT_ROOT/.maf/agents.json' 2>/dev/null"

# Test 12: Error Recovery and Edge Cases
run_test "Error Handling - Invalid Agent Type" \
    "! source '$LIB_DIR/agent-utils.sh' && validate_agent_type 'invalid-type' 2>/dev/null"

run_test "Error Handling - Non-existent Agent" \
    "! bash '$LIB_DIR/agent-utils.sh' stats 'non-existent-agent-id' 2>/dev/null"

run_test "Error Handling - Session Validation" \
    "! source '$LIB_DIR/tmux-utils.sh' && validate_session 'non-existent-agent' 2>/dev/null"

# Test Results Summary
echo -e "${BLUE}📊 Test Results Summary${NC}"
echo -e "${BLUE}=======================${NC}"

# Count total sessions
TOTAL_SESSIONS=$(tmux list-sessions 2>/dev/null | grep "^maf-agent-" | wc -l || echo "0")
MAF_SESSIONS=$(tmux list-sessions 2>/dev/null | grep "^maf-agent-" | wc -l || echo "0")

echo "Total tmux sessions: $TOTAL_SESSIONS"
echo "MAF agent sessions: $MAF_SESSIONS"

# Check agent registry
AGENT_COUNT=$(jq '.agents | length' "$PROJECT_ROOT/.maf/agents.json" 2>/dev/null || echo "0")
echo "Agents in registry: $AGENT_COUNT"

# Check log files
LOG_COUNT=$(find "$PROJECT_ROOT/.maf/logs" -name "*.log" -type f 2>/dev/null | wc -l || echo "0")
echo "Log files created: $LOG_COUNT"

echo -e "\n${GREEN}🎉 All tests completed successfully!${NC}"
echo -e "${GREEN}The MAF tmux orchestration system is working correctly.${NC}\n"

echo -e "${BLUE}📋 Quick Reference Commands:${NC}"
echo -e "${BLUE}=============================${NC}"
echo "• Validate system: bash scripts/maf/lib/error-handling.sh validate"
echo "• Initialize tmux: bash scripts/maf/lib/tmux-utils.sh init"
echo "• List agents: bash scripts/maf/lib/agent-utils.sh list"
echo "• Create agent: bash scripts/maf/lib/agent-utils.sh create claude-worker"
echo "• Health check: bash scripts/maf/lib/agent-utils.sh health"
echo "• Cleanup all: bash scripts/maf/lib/tmux-utils.sh cleanup_all_sessions true"
echo

# Final cleanup will be handled by the trap function
