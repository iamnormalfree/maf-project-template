#!/bin/bash
# ABOUTME: Main orchestrator script for MAF tmux-based agent spawning and management with multi-Codex profile support.
# ABOUTME: Integrates tmux-utils.sh, agent-utils.sh, profile-loader.sh, and error-handling.sh to coordinate multi-agent environments.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Calculate project root independently of SCRIPT_DIR to avoid conflicts
MAF_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
PROJECT_ROOT="$(cd "$(dirname "$MAF_SCRIPT_DIR")/.." && pwd)"

# Source core libraries
source "$LIB_DIR/error-handling.sh"
source "$LIB_DIR/tmux-utils.sh"
source "$LIB_DIR/agent-utils.sh"
source "$LIB_DIR/profile-loader.sh"
source "$LIB_DIR/credential-manager.sh"

# Configuration defaults
DEFAULT_CONFIG_FILE="$PROJECT_ROOT/.maf/config/default-agent-config.json"
DEFAULT_SESSION_NAME="maf-session"
DEFAULT_LAYOUT="default_4_pane"
DEFAULT_AGENT_COUNT=3
DEFAULT_BACKGROUND_MODE=false

# Global variables for session management
SESSION_NAME=""
CONFIG_FILE=""
LAYOUT=""
AGENT_COUNT=""
BACKGROUND_MODE=""
VERBOSITY=""
CLEANUP_ON_EXIT=""

# Profile-related global variables
FORCE_PROFILE=""
FORCE_ROTATION=false
LIST_PROFILES=false

# Colors for output (override if not sourced)
source "$SCRIPT_DIR/lib/colors.sh" 2>/dev/null || {
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
}

# Enhanced logging functions for orchestrator
log_orchestrator() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%H:%M:%S')
    
    case "$level" in
        "INFO")
            echo -e "${CYAN}[ORCHESTRATOR ${timestamp}]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[ORCHESTRATOR ${timestamp}]${NC} $message"
            ;;
        "WARNING")
            echo -e "${YELLOW}[ORCHESTRATOR ${timestamp}]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[ORCHESTRATOR ${timestamp}]${NC} $message"
            ;;
        "DEBUG")
            if [[ "$VERBOSITY" == "debug" ]]; then
                echo -e "${MAGENTA}[ORCHESTRATOR ${timestamp}]${NC} $message"
            fi
            ;;
    esac
}

# Print usage information
print_usage() {
    cat << 'EOF'
MAF Agent Orchestration System with Multi-Codex Profile Support
===============================================================

USAGE:
    spawn-agents.sh [OPTIONS]

OPTIONS:
    -s, --session NAME          Session name (default: maf-session)
    -c, --config FILE           Configuration file (default: .maf/config/default-agent-config.json)
    -l, --layout LAYOUT         Session layout (default: default_4_pane)
    -w, --workers COUNT         Number of worker agents (default: 3)
    -b, --background            Run in background mode (don't attach to session)
    -v, --verbose               Enable verbose logging
    -d, --debug                 Enable debug logging
    -h, --help                  Show this help message

PROFILE OPTIONS:
    -p, --profile NAME          Force specific Codex profile for all agents
    -r, --force-rotation        Enable profile rotation awareness
    --list-profiles             Show available Codex profiles and exit

EXAMPLES:
    # Basic session with defaults
    ./spawn-agents.sh

    # Custom session with 5 workers
    ./spawn-agents.sh --session my-session --workers 5

    # Background mode with custom layout
    ./spawn-agents.sh --background --layout minimal_2_pane

    # Debug mode with custom config
    ./spawn-agents.sh --debug --config my-config.json

    # Force specific Codex profile
    ./spawn-agents.sh --profile codex-plus-premium

    # Enable profile rotation for load balancing
    ./spawn-agents.sh --force-rotation

    # List available profiles
    ./spawn-agents.sh --list-profiles

AVAILABLE LAYOUTS:
    default_4_pane    - 4 agents: coordinator, 2 workers, reviewer
    focused_3_pane    - 3 agents: worker, committer, reviewer
    minimal_2_pane    - 2 agents: worker, committer

PROFILE FEATURES:
    - Multi-Codex account support with automatic load balancing
    - Round-robin profile selection with priority fallback
    - Rate limit awareness and credential management
    - Profile-specific environment isolation
    - Health monitoring and usage tracking

INTEGRATION:
    - Works with npm run maf:claim-task
    - Integrates with agent-mail system
    - Supports beads task management
    - Includes git workflow automation

