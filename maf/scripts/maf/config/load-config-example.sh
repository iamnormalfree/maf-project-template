#!/bin/bash
# ABOUTME: Example of how to load and use the MAF agent configuration
# This demonstrates integration with agent-utils.sh

set -euo pipefail

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Configuration file path (matches agent-utils.sh AGENT_CONFIG_DIR)
AGENT_CONFIG_FILE="${AGENT_CONFIG_FILE:-$PROJECT_ROOT/.maf/config/default-agent-config.json}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to load agent type configuration
load_agent_config() {
    local agent_type="$1"
    
    if [[ ! -f "$AGENT_CONFIG_FILE" ]]; then
        echo -e "${RED}Error: Configuration file not found: $AGENT_CONFIG_FILE${NC}"
        return 1
    fi
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required to load configuration${NC}"
        return 1
    fi
    
    # Load agent configuration
    local agent_config
    agent_config=$(jq -r ".agent_types[\"$agent_type\"]" "$AGENT_CONFIG_FILE" 2>/dev/null)
    
    if [[ "$agent_config" == "null" ]]; then
        echo -e "${RED}Error: Agent type '$agent_type' not found in configuration${NC}"
        return 1
    fi
    
    echo "$agent_config"
}

# Function to get environment variables for agent type
get_agent_environment() {
    local agent_type="$1"
    local agent_config
    agent_config=$(load_agent_config "$agent_type")
    
    if [[ -z "$agent_config" ]]; then
        return 1
    fi
    
    # Extract environment variables and export them
    echo "$agent_config" | jq -r '.environment | to_entries[] | "export \(.key)=\(.value)"'
}

# Function to get agent startup command
get_agent_startup_command() {
    local agent_type="$1"
    
    # Load from configuration
    local startup_cmd
    startup_cmd=$(jq -r ".agent_types[\"$agent_type\"].environment.MAF_STARTUP_CMD // empty" "$AGENT_CONFIG_FILE")
    
    if [[ -n "$startup_cmd" ]] && [[ "$startup_cmd" != "null" ]]; then
        echo "$startup_cmd"
        return 0
    fi
    
    # Fallback to default commands based on agent type
    case "$agent_type" in
        "claude-worker")
            echo "npm run maf:claim-task"
            ;;
        "claude-committer")
            echo "git status"
            ;;
        "codex-reviewer")
            echo "npm run lint"
            ;;
        "coordinator")
            echo "npm run maf:status"
            ;;
        *)
            echo "echo 'Agent $agent_type started'"
            ;;
    esac
}

# Function to get resource limits for agent type
get_agent_limits() {
    local agent_type="$1"
    local agent_config
    agent_config=$(load_agent_config "$agent_type")
    
    if [[ -z "$agent_config" ]]; then
        return 1
    fi
    
    # Extract resource limits
    local cpu_limit mem_limit max_sessions
    cpu_limit=$(echo "$agent_config" | jq -r '.resource_limits.cpu_percent // 50')
    mem_limit=$(echo "$agent_config" | jq -r '.resource_limits.memory_mb // 256')
    max_sessions=$(echo "$agent_config" | jq -r '.resource_limits.max_sessions // 1')
    
    echo "CPU: ${cpu_limit}%, Memory: ${mem_limit}MB, Max Sessions: $max_sessions"
}

# Example usage
main() {
    local agent_type="${1:-claude-worker}"
    
    echo -e "${BLUE}MAF Agent Configuration Loader${NC}"
    echo "================================="
    echo "Agent Type: $agent_type"
    echo ""
    
    echo -e "${YELLOW}Loading configuration...${NC}"
    
    # Show agent configuration
    local agent_config
    agent_config=$(load_agent_config "$agent_type")
    
    if [[ -z "$agent_config" ]]; then
        echo -e "${RED}Failed to load configuration for agent type: $agent_type${NC}"
        echo ""
        echo "Available agent types:"
        jq -r '.agent_types | keys[]' "$AGENT_CONFIG_FILE" 2>/dev/null || echo "Configuration file not accessible"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Configuration loaded successfully${NC}"
    echo ""
    
    # Show agent description
    local description
    description=$(echo "$agent_config" | jq -r '.description')
    echo "Description: $description"
    
    # Show capabilities
    local capabilities
    capabilities=$(echo "$agent_config" | jq -r '.capabilities | join(", ")')
    echo "Capabilities: $capabilities"
    
    # Show resource limits
    echo ""
    echo -e "${YELLOW}Resource Limits:${NC}"
    get_agent_limits "$agent_type"
    
    # Show environment variables
    echo ""
    echo -e "${YELLOW}Environment Variables:${NC}"
    get_agent_environment "$agent_type"
    
    # Show startup command
    echo ""
    echo -e "${YELLOW}Startup Command:${NC}"
    get_agent_startup_command "$agent_type"
    
    echo ""
    echo -e "${GREEN}Configuration integration ready!${NC}"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
