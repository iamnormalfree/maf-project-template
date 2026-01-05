#!/bin/bash
# ABOUTME: Main orchestrator script for MAF tmux-based agent spawning and management.
# ABOUTME: Integrates tmux-utils.sh, agent-utils.sh, error-handling.sh, and profile utilities for multi-Codex support.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Calculate project root independently of SCRIPT_DIR to avoid conflicts
MAF_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
# For subtree layout (maf/scripts/maf/), go up three levels from scripts/ to reach project root
# For direct layout (scripts/maf/), go up two levels from scripts/ to reach project root
# Detect if we're in a subtree by checking path pattern
if [[ "$MAF_SCRIPT_DIR" == *"/maf/scripts/maf" ]]; then
    # We're in a subtree: maf/scripts/maf/ -> go up 3 levels to project root
    # dirname(maf/scripts/maf) = maf/scripts -> ../.. = project root
    PROJECT_ROOT="$(cd "$(dirname "$MAF_SCRIPT_DIR")/../.." && pwd)"
else
    # We're in direct layout: scripts/maf/ -> go up 2 levels to project root
    # dirname(scripts/maf) = scripts -> .. = project root
    PROJECT_ROOT="$(cd "$(dirname "$MAF_SCRIPT_DIR")/.." && pwd)"
fi

# Source core libraries
source "$LIB_DIR/error-handling.sh"
source "$LIB_DIR/tmux-utils.sh"
source "$LIB_DIR/agent-utils.sh"

# Source profile utilities for multi-Codex support
source "$LIB_DIR/profile-loader.sh"
source "$LIB_DIR/credential-manager.sh"

# Configuration defaults
DEFAULT_CONFIG_FILE="$PROJECT_ROOT/.maf/config/default-agent-config.json"
DEFAULT_SESSION_NAME="maf-session"
DEFAULT_LAYOUT="glm_review_3_pane"
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
    -l, --layout LAYOUT         Session layout (default: glm_review_3_pane)
    -w, --workers COUNT         Number of worker agents (default: 3)
    -b, --background            Run in background mode (don't attach to session)
    -v, --verbose               Enable verbose logging
    -d, --debug                 Enable debug logging
    -p, --profile NAME          Force specific Codex profile for all agents
    -r, --force-rotation        Force profile rotation even if not rate limited
    --list-profiles             List available Codex profiles and exit
    -h, --help                  Show this help message

EXAMPLES:
    # Basic session with defaults
    ./spawn-agents.sh

    # Custom session with 5 workers
    ./spawn-agents.sh --session my-session --workers 5

    # Background mode with custom layout
    ./spawn-agents.sh --background --layout minimal_2_pane

    # Force specific Codex profile
    ./spawn-agents.sh --profile claude-sonnet-4

    # Force profile rotation
    ./spawn-agents.sh --force-rotation

    # List available profiles
    ./spawn-agents.sh --list-profiles

    # Debug mode with custom config
    ./spawn-agents.sh --debug --config my-config.json

AVAILABLE LAYOUTS:
    glm_review_3_pane - 3 agents: glm-worker, codex-reviewer, claude-committer (default)
    default_4_pane    - 4 agents: coordinator, 2 workers, reviewer
    focused_3_pane    - 3 agents: worker, committer, reviewer
    minimal_2_pane    - 2 agents: worker, committer

PROFILE FEATURES:
    - Multi-Codex account support with automatic profile selection
    - Rate limit aware profile rotation and fallback
    - Secure credential management per profile
    - Health monitoring for profile availability
    - Round-robin and priority-based selection algorithms

INTEGRATION:
    - Works with npm run maf:claim-task
    - Integrates with agent-mail system
    - Supports beads task management
    - Includes git workflow automation

EOF
}

# Check if agent type has Codex profiles configuration
has_codex_profiles() {
    local agent_type="$1"
    
    # Check if codex_profiles is configured for this agent type
    local codex_config
    codex_config=$(jq -r ".agent_types.\"$agent_type\".codex_profiles // empty" "$CONFIG_FILE")
    
    if [[ -n "$codex_config" ]] && [[ "$codex_config" != "null" ]]; then
        return 0
    fi
    
    # Check if codex_profiles is globally enabled
    local global_enabled
    global_enabled=$(jq -r '.codex_profiles.enable // false' "$CONFIG_FILE")
    
    if [[ "$global_enabled" == "true" ]]; then
        return 0
    fi
    
    return 1
}

# Load profile in tmux pane
load_profile_in_pane() {
    local session_name="$1"
    local profile_name="$2"
    
    log_orchestrator "DEBUG" "Loading profile $profile_name in session $session_name"
    
    # Get credentials for the profile
    local credentials
    credentials=$(get_profile_credentials "$profile_name" "export")
    
    if [[ -z "$credentials" ]] || [[ "$credentials" == "null" ]]; then
        log_orchestrator "WARNING" "No credentials found for profile: $profile_name"
        return 1
    fi
    
    # Set environment variables in the pane
    echo "$credentials" | jq -r 'to_entries[] | "export \(.key)=\(.value)"' | while read -r export_cmd; do
        if [[ -n "$export_cmd" ]] && [[ "$export_cmd" != "export =" ]]; then
            tmux send-keys -t "$session_name" "$export_cmd" Enter
        fi
    done
    
    # Add profile identification
    tmux send-keys -t "$session_name" "export CODEX_PROFILE=\"$profile_name\"" Enter
    tmux send-keys -t "$session_name" "export MAF_CODEX_PROFILE=\"$profile_name\"" Enter
    tmux send-keys -t "$session_name" "export MAF_AGENT_PROFILE_LOADED=\"true\"" Enter
    
    return 0
}

# Parse command line arguments
parse_arguments() {
    log_orchestrator "DEBUG" "Parsing command line arguments"
    
    # Set defaults
    SESSION_NAME="$DEFAULT_SESSION_NAME"
    CONFIG_FILE="$DEFAULT_CONFIG_FILE"
    LAYOUT="$DEFAULT_LAYOUT"
    AGENT_COUNT="$DEFAULT_AGENT_COUNT"
    BACKGROUND_MODE="$DEFAULT_BACKGROUND_MODE"
    VERBOSITY="info"
    CLEANUP_ON_EXIT="true"
    FORCE_PROFILE=""
    FORCE_ROTATION=false
    LIST_PROFILES=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--session)
                SESSION_NAME="$2"
                shift 2
                ;;
            -c|--config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -l|--layout)
                LAYOUT="$2"
                shift 2
                ;;
            -w|--workers)
                AGENT_COUNT="$2"
                shift 2
                ;;
            -b|--background)
                BACKGROUND_MODE="true"
                shift
                ;;
            -v|--verbose)
                VERBOSITY="verbose"
                export VERBOSE_LOGGING="true"
                shift
                ;;
            -d|--debug)
                VERBOSITY="debug"
                export DEBUG_MODE="true"
                export VERBOSE_LOGGING="true"
                shift
                ;;
            -p|--profile)
                FORCE_PROFILE="$2"
                shift 2
                ;;
            -r|--force-rotation)
                FORCE_ROTATION=true
                shift
                ;;
            --list-profiles)
                LIST_PROFILES=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                handle_error "INVALID_ARGUMENT" "Unknown argument: $1" 2 "Use -h for help"
                ;;
        esac
    done
    
    # Handle --list-profiles early
    if [[ "$LIST_PROFILES" == "true" ]]; then
        echo "Available Codex Profiles:"
        echo "========================"
        
        # Initialize profile system
        initialize_profile_system
        
        # List available profiles
        if list_profiles; then
            echo ""
            echo "Profile Selection Strategies:"
            echo "- Use --profile NAME to force specific profile"
            echo "- Use --force-rotation to enable rate limit based rotation"
            echo "- Configure agent-specific profiles in agent-types.json"
        else
            echo "No profiles available. Set up profiles in .maf/credentials/"
        fi
        exit 0
    fi
    
    # Validate parsed arguments
    validate_arguments
    
    log_orchestrator "INFO" "Arguments parsed successfully"
    log_orchestrator "DEBUG" "Session: $SESSION_NAME, Config: $CONFIG_FILE, Layout: $LAYOUT, Workers: $AGENT_COUNT"
    log_orchestrator "DEBUG" "Profile: $FORCE_PROFILE, Force Rotation: $FORCE_ROTATION"
}

# Validate parsed arguments
validate_arguments() {
    log_func_info "validate_arguments" "Validating parsed arguments"
    
    # Validate session name
    if [[ -z "$SESSION_NAME" ]]; then
        handle_error "INVALID_SESSION_NAME" "Session name cannot be empty" 3
    fi
    
    # Validate config file exists
    validate_file_exists "$CONFIG_FILE" "Configuration file"
    
    # Validate layout is available in config
    if ! jq -e ".session_layouts.\"$LAYOUT\"" "$CONFIG_FILE" &>/dev/null; then
        local available_layouts
        available_layouts=$(jq -r '.session_layouts | keys[]' "$CONFIG_FILE" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
        handle_error "INVALID_LAYOUT" \
            "Layout '$LAYOUT' not found in configuration. Available: $available_layouts" \
            4
    fi
    
    # Validate worker count
    if ! [[ "$AGENT_COUNT" =~ ^[0-9]+$ ]] || [[ "$AGENT_COUNT" -lt 1 ]] || [[ "$AGENT_COUNT" -gt 10 ]]; then
        handle_error "INVALID_WORKER_COUNT" "Worker count must be between 1 and 10" 5
    fi
    
    # Validate forced profile if specified
    if [[ -n "$FORCE_PROFILE" ]]; then
        if ! validate_profile "$FORCE_PROFILE"; then
            handle_error "INVALID_PROFILE" "Forced profile '$FORCE_PROFILE' is not valid" 6
        fi
    fi
    
    return 0
}

# Load and validate configuration
load_configuration() {
    log_func_info "load_configuration" "Loading configuration from: $CONFIG_FILE"
    
    # Validate JSON format
    if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
        handle_error "INVALID_CONFIG_JSON" "Configuration file is not valid JSON: $CONFIG_FILE" 7
    fi
    
    # Extract configuration values
    local layout_config
    layout_config=$(jq ".session_layouts.\"$LAYOUT\"" "$CONFIG_FILE")
    
    if [[ -z "$layout_config" ]] || [[ "$layout_config" == "null" ]]; then
        handle_error "LAYOUT_CONFIG_MISSING" "Layout configuration not found: $LAYOUT" 8
    fi
    
    # Initialize profile system if enabled
    local codex_profiles_enabled
    codex_profiles_enabled=$(jq -r '.codex_profiles.enable // false' "$CONFIG_FILE")
    
    if [[ "$codex_profiles_enabled" == "true" ]]; then
        log_orchestrator "INFO" "Initializing Codex profile system..."
        initialize_profile_system
        initialize_credential_system
        log_orchestrator "SUCCESS" "Codex profile system initialized"
    fi
    
    log_orchestrator "SUCCESS" "Configuration loaded successfully"
    return 0
}

# Validate system prerequisites
validate_system_prerequisites() {
    log_func_info "validate_system_prerequisites" "Validating system prerequisites"
    
    log_orchestrator "INFO" "Validating system prerequisites..."
    
    # Use the centralized validation function
    if ! validate_prerequisites; then
        handle_error "PREREQUISITES_FAILED" "System prerequisites validation failed" 9
    fi
    
    # Additional MAF-specific validations
    log_orchestrator "INFO" "Validating MAF-specific prerequisites..."
    
    # Check if MAF CLI is available
    if ! jq -e '.scripts["maf:claim-task"]' "$PROJECT_ROOT/package.json" &>/dev/null; then
        log_orchestrator "WARNING" "MAF CLI script not found in package.json"
    else
        log_orchestrator "SUCCESS" "MAF CLI script available"
    fi
    
    # Check agent mail system
    if [[ -d "$PROJECT_ROOT/mcp_agent_mail" ]]; then
        log_orchestrator "SUCCESS" "Agent mail system available"
    else
        log_orchestrator "WARNING" "Agent mail system not found"
    fi
    
    # Check beads directory
    if [[ -d "$PROJECT_ROOT/.maf" ]]; then
        log_orchestrator "SUCCESS" "MAF directory structure exists"
    else
        log_orchestrator "WARNING" "MAF directory structure missing"
    fi
    
    # Check Codex profile system
    local codex_profiles_enabled
    codex_profiles_enabled=$(jq -r '.codex_profiles.enable // false' "$CONFIG_FILE")
    
    if [[ "$codex_profiles_enabled" == "true" ]]; then
        if [[ -d "$PROJECT_ROOT/.codex" ]]; then
            log_orchestrator "SUCCESS" "Codex profile system available"
        else
            log_orchestrator "WARNING" "Codex profile system not initialized"
        fi
    fi
    
    log_orchestrator "SUCCESS" "System prerequisites validated"
    return 0
}

# Create the main orchestration session
create_main_session() {
    local main_session_name="$1"
    
    log_func_info "create_main_session" "Creating main session: $main_session_name"
    
    log_orchestrator "INFO" "Creating main orchestration session: $main_session_name"
    
    # Check if session already exists
    if tmux list-sessions 2>/dev/null | grep -q "^$main_session_name:"; then
        log_orchestrator "WARNING" "Session $main_session_name already exists"
        read -p "Session exists. Kill and recreate? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_orchestrator "INFO" "Killing existing session: $main_session_name"
            tmux kill-session -t "$main_session_name" 2>/dev/null || true
        else
            handle_error "SESSION_EXISTS" "Session $main_session_name already exists" 10
        fi
    fi
    
    # Ensure tmux server is running
    ensure_tmux_server
    
    # Create main session with coordinator
    tmux new-session -d -s "$main_session_name" -c "$PROJECT_ROOT" \
        -n "coordinator" \
        "echo 'MAF Orchestration Session Started' && sleep 3600"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$main_session_name:"; then
        handle_error "SESSION_CREATE_FAILED" "Failed to create main session: $main_session_name" 11
    fi
    
    log_orchestrator "SUCCESS" "Main session created: $main_session_name"
    return 0
}

# Setup session layout based on configuration
setup_session_layout() {
    local session_name="$1"
    local layout_name="$2"
    
    log_func_info "setup_session_layout" "Setting up layout: $layout_name"
    
    log_orchestrator "INFO" "Setting up session layout: $layout_name"
    
    # Get layout configuration
    local layout_config
    layout_config=$(jq ".session_layouts.\"$layout_name\"" "$CONFIG_FILE")
    
    local pane_count
    pane_count=$(echo "$layout_config" | jq '.panes | length')
    
    log_orchestrator "DEBUG" "Layout has $pane_count panes"
    
    # Create panes according to layout
    local agent_counter=0
    
    # Skip first pane (coordinator already exists)
    for ((i = 1; i < pane_count; i++)); do
        local pane_config
        pane_config=$(echo "$layout_config" | jq ".panes[$i]")
        
        local agent_type
        local agent_name
        local position
        
        agent_type=$(echo "$pane_config" | jq -r '.agent_type')
        agent_name=$(echo "$pane_config" | jq -r '.name')
        position=$(echo "$pane_config" | jq -r '.position')
        
        log_orchestrator "DEBUG" "Creating pane for agent: $agent_name ($agent_type) at $position"
        
        # Split window and create new pane
        case "$position" in
            "top-right"|"bottom-right")
                tmux split-window -h -c "$PROJECT_ROOT"
                ;;
            "bottom-left"|"bottom-right")
                tmux split-window -v -c "$PROJECT_ROOT"
                ;;
            *)
                tmux split-window -h -c "$PROJECT_ROOT"
                ;;
        esac
        
        # Create agent for this pane
        local agent_id
        agent_id=$(create_agent "$agent_type" "" "Agent for $position pane")
        
        if [[ -n "$agent_id" ]]; then
            log_orchestrator "SUCCESS" "Created agent: $agent_id for pane: $agent_name"
            
            # Setup agent in the current pane
            setup_agent_in_pane "$session_name" "$agent_id" "$agent_type" "$pane_config"
            
            ((agent_counter++))
            
            # Limit number of agents based on AGENT_COUNT
            if [[ $agent_counter -ge $AGENT_COUNT ]]; then
                log_orchestrator "INFO" "Reached agent count limit: $AGENT_COUNT"
                break
            fi
        else
            log_orchestrator "ERROR" "Failed to create agent for pane: $agent_name"
        fi
    done
    
    # Apply layout options
    local tmux_options
    tmux_options=$(echo "$layout_config" | jq -r '.tmux_options // {}')
    
    if [[ "$tmux_options" != "null" ]] && [[ -n "$tmux_options" ]]; then
        # Apply mouse support
        if echo "$tmux_options" | jq -e '.mouse' &>/dev/null; then
            local mouse_enabled
            mouse_enabled=$(echo "$tmux_options" | jq -r '.mouse')
            if [[ "$mouse_enabled" == "true" ]]; then
                tmux set-option -g mouse on -t "$session_name"
            fi
        fi
        
        # Apply remain-on-exit
        if echo "$tmux_options" | jq -e '.remain_on_exit' &>/dev/null; then
            local remain_on_exit
            remain_on_exit=$(echo "$tmux_options" | jq -r '.remain_on_exit')
            tmux set-option -g remain-on-exit "$remain_on_exit" -t "$session_name"
        fi
    fi
    
    log_orchestrator "SUCCESS" "Session layout completed: $layout_name"
    return 0
}

# Setup agent in specific pane
setup_agent_in_pane() {
    local session_name="$1"
    local agent_id="$2"
    local agent_type="$3"
    local pane_config="$4"
    
    log_func_info "setup_agent_in_pane" "Setting up agent $agent_id in session $session_name"
    
    # Get agent environment variables from config
    local env_vars
    env_vars=$(jq -r ".agent_types.\"$agent_type\".environment // {}" "$CONFIG_FILE")
    
    # Set up environment variables in the pane
    if [[ "$env_vars" != "null" ]] && [[ -n "$env_vars" ]]; then
        echo "$env_vars" | jq -r 'to_entries[] | "export \(.key)=\(.value)"' | while read -r export_cmd; do
            if [[ -n "$export_cmd" ]] && [[ "$export_cmd" != "export =" ]]; then
                tmux send-keys -t "$session_name" "$export_cmd" Enter
            fi
        done
    fi
    
    # Load agent environment
    if [[ -f "$PROJECT_ROOT/.maf/agent.env" ]]; then
        tmux send-keys -t "$session_name" "source '$PROJECT_ROOT/.maf/agent.env'" Enter
    fi
    
    # Load Codex profile if configured
    if has_codex_profiles "$agent_type"; then
        local selected_profile
        local agent_config
        agent_config=$(jq ".agent_types.\"$agent_type\"" "$CONFIG_FILE")
        
        selected_profile=$(select_profile_for_agent "$agent_type" "$agent_config" "$session_name" "$FORCE_PROFILE")
        
        if [[ -n "$selected_profile" ]] && [[ "$selected_profile" != "null" ]]; then
            if load_profile_in_pane "$session_name" "$selected_profile"; then
                log_orchestrator "SUCCESS" "Loaded Codex profile: $selected_profile for agent: $agent_type"
            else
                log_orchestrator "WARNING" "Failed to load profile: $selected_profile for agent: $agent_type"
            fi
        else
            log_orchestrator "INFO" "No Codex profile selected for agent: $agent_type"
        fi
    fi
    
    log_orchestrator "SUCCESS" "Agent setup completed: $agent_id"
    return 0
}

# Setup coordinator pane
setup_coordinator_pane() {
    local session_name="$1"
    
    log_func_info "setup_coordinator_pane" "Setting up coordinator pane for session: $session_name"
    
    # Switch to coordinator pane (pane 0)
    tmux select-pane -t "$session_name:coordinator.0"
    
    # Clear pane and set up coordinator
    tmux send-keys -t "$session_name:coordinator.0" "clear" Enter
    tmux send-keys -t "$session_name:coordinator.0" "echo '=== MAF Session Coordinator ==='" Enter
    tmux send-keys -t "$session_name:coordinator.0" "echo 'Session: $session_name'" Enter
    tmux send-keys -t "$session_name:coordinator.0" "echo 'Layout: $LAYOUT'" Enter
    tmux send-keys -t "$session_name:coordinator.0" "echo 'Agents: $AGENT_COUNT'" Enter
    
    # Add profile information if enabled
    local codex_profiles_enabled
    codex_profiles_enabled=$(jq -r '.codex_profiles.enable // false' "$CONFIG_FILE")
    
    if [[ "$codex_profiles_enabled" == "true" ]]; then
        tmux send-keys -t "$session_name:coordinator.0" "echo 'Codex Profiles: Enabled'" Enter
        if [[ -n "$FORCE_PROFILE" ]]; then
            tmux send-keys -t "$session_name:coordinator.0" "echo 'Forced Profile: $FORCE_PROFILE'" Enter
        fi
    fi
    
    tmux send-keys -t "$session_name:coordinator.0" "echo ''" Enter
    
    # Start monitoring
    if command -v watch &>/dev/null; then
        tmux send-keys -t "$session_name:coordinator.0" "watch -n 10 'echo \"=== MAF Session Status ($(date)) ===\" && tmux list-sessions | grep \"$session_name\" && echo \"\" && echo \"=== Agent Status ===\" && \"$SCRIPT_DIR/lib/agent-utils.sh\" list 2>/dev/null || echo \"Agent listing failed\"'" Enter
    else
        tmux send-keys -t "$session_name:coordinator.0" "echo 'Monitoring started (install watch for better monitoring)'" Enter
        tmux send-keys -t "$session_name:coordinator.0" "while true; do echo \"=== \$(date) ===\"; \"$SCRIPT_DIR/lib/agent-utils.sh\" list 2>/dev/null || echo \"Agent listing failed\"; sleep 30; done" Enter
    fi
    
    log_orchestrator "SUCCESS" "Coordinator pane setup completed"
    return 0
}

# Setup integration features
setup_integrations() {
    local session_name="$1"
    
    log_func_info "setup_integrations" "Setting up integration features"
    
    log_orchestrator "INFO" "Setting up integration features..."
    
    # Setup agent mail integration
    local agent_mail_enabled
    agent_mail_enabled=$(jq -r '.integration_settings.agent_mail.enabled // false' "$CONFIG_FILE")
    
    if [[ "$agent_mail_enabled" == "true" ]] && [[ -d "$PROJECT_ROOT/mcp_agent_mail" ]]; then
        log_orchestrator "INFO" "Setting up agent mail integration..."
        
        # Start agent mail MCP server in background
        if [[ -f "$PROJECT_ROOT/mcp_agent_mail/package.json" ]]; then
            tmux new-window -t "$session_name" -n "agent-mail" -c "$PROJECT_ROOT/mcp_agent_mail" \
                "npm start 2>/dev/null || echo 'Agent mail server failed to start' && sleep 3600"
            log_orchestrator "SUCCESS" "Agent mail integration started"
        else
            log_orchestrator "WARNING" "Agent mail package.json not found"
        fi
    fi
    
    # Setup beads workflow integration
    local beads_enabled
    beads_enabled=$(jq -r '.integration_settings.beads_workflow.enabled // false' "$CONFIG_FILE")
    
    if [[ "$beads_enabled" == "true" ]]; then
        log_orchestrator "INFO" "Setting up beads workflow integration..."
        
        # Check if beads commands are available
        if jq -e '.scripts["maf:beads-ready"]' "$PROJECT_ROOT/package.json" &>/dev/null; then
            log_orchestrator "SUCCESS" "Beads workflow commands available"
        else
            log_orchestrator "WARNING" "Beads workflow commands not found in package.json"
        fi
    fi
    
    # Setup git workflow integration
    local git_workflow_enabled
    git_workflow_enabled=$(jq -r '.integration_settings.git_workflow.auto_branch_creation // false' "$CONFIG_FILE")
    
    if [[ "$git_workflow_enabled" == "true" ]]; then
        log_orchestrator "INFO" "Git workflow auto-branch creation enabled"
    fi
    
    # Start audit-guard monitor (fresh reviewer trigger) in a background window
    if [[ -f "$SCRIPT_DIR/audit-guard-monitor.sh" ]]; then
        log_orchestrator "INFO" "Starting audit-guard monitor window"
        tmux new-window -t "$session_name" -n "audit-guard" -c "$PROJECT_ROOT" \
            "bash \"$SCRIPT_DIR/audit-guard-monitor.sh\" 2>&1 | tee -a .maf/logs/audit-guard-monitor.log"
        log_orchestrator "SUCCESS" "Audit-guard monitor started"
    else
        log_orchestrator "WARNING" "audit-guard-monitor.sh not found; skipping audit guard"
    fi

    log_orchestrator "SUCCESS" "Integration features setup completed"
    return 0
}

# Start monitoring and health checks
start_monitoring() {
    local session_name="$1"
    
    log_func_info "start_monitoring" "Starting monitoring for session: $session_name"
    
    local health_checks_enabled
    health_checks_enabled=$(jq -r '.monitoring.health_checks.enabled // true' "$CONFIG_FILE")
    
    if [[ "$health_checks_enabled" == "true" ]]; then
        local interval
        interval=$(jq -r '.monitoring.health_checks.interval // 30' "$CONFIG_FILE")
        
        log_orchestrator "INFO" "Starting health monitoring (interval: ${interval}s)"
        
        # Create monitoring window
        tmux new-window -t "$session_name" -n "health-monitor" -c "$PROJECT_ROOT" \
            "echo 'Health monitoring started (interval: ${interval}s)' && while true; do echo \"=== Health Check \$(date) ===\"; \"$SCRIPT_DIR/lib/agent-utils.sh\" health 2>/dev/null || echo \"Health check failed\"; sleep $interval; done"
    fi
    
    log_orchestrator "SUCCESS" "Monitoring started"
    return 0
}

# Attach to session or run in background
finalize_session() {
    local session_name="$1"
    
    log_func_info "finalize_session" "Finalizing session: $session_name (background: $BACKGROUND_MODE)"
    
    # Switch to coordinator pane
    tmux select-window -t "$session_name:coordinator"
    tmux select-pane -t "$session_name:coordinator.0"
    
    # Balance window sizes
    tmux select-layout -t "$session_name" even-horizontal
    
    if [[ "$BACKGROUND_MODE" == "true" ]]; then
        log_orchestrator "SUCCESS" "Session running in background: $session_name"
        log_orchestrator "INFO" "Attach with: tmux attach-session -t $session_name"
        log_orchestrator "INFO" "List sessions: tmux list-sessions"
        log_orchestrator "INFO" "Kill session: tmux kill-session -t $session_name"
    else
        log_orchestrator "SUCCESS" "Session ready. Attaching..."
        log_orchestrator "INFO" "Use Ctrl+B, D to detach from session"
        
        # Small delay before attaching to allow all processes to start
        sleep 2
        
        # Attach to the session
        tmux attach-session -t "$session_name"
    fi
    
    return 0
}

# Cleanup function on script exit
cleanup_on_exit() {
    local exit_code="$1"
    local error_message="$2"
    
    log_orchestrator "INFO" "Running cleanup on exit (code: $exit_code)"
    
    # Only run cleanup if we created a session
    if [[ -n "$SESSION_NAME" ]] && [[ "$CLEANUP_ON_EXIT" == "true" ]]; then
        # Check if session exists
        if tmux list-sessions 2>/dev/null | grep -q "^$SESSION_NAME:"; then
            log_orchestrator "WARNING" "Cleaning up session due to error: $SESSION_NAME"
            
            # Ask user if they want to keep the session
            if [[ "$BACKGROUND_MODE" != "true" ]]; then
                echo -e "${YELLOW}Session $SESSION_NAME encountered an error. Keep session for debugging? [y/N]:${NC}" >&2
                read -r -t 10 response || response="n"
                
                if [[ ! $response =~ ^[Yy]$ ]]; then
                    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
                    log_orchestrator "INFO" "Session cleaned up: $SESSION_NAME"
                else
                    log_orchestrator "INFO" "Session preserved for debugging: $SESSION_NAME"
                fi
            fi
        fi
    fi
    
    # Run general cleanup
    cleanup_temp_files
    
    log_orchestrator "INFO" "Cleanup completed"
}

# Main orchestration function
main() {
    log_orchestrator "INFO" "MAF Agent Orchestration System with Multi-Codex Profile Support starting..."
    log_orchestrator "INFO" "Project root: $PROJECT_ROOT"
    
    # Setup error traps with custom cleanup
    trap 'cleanup_on_error "ORCHESTRATOR_ERROR" "Script failed at line $LINENO" $?' ERR
    trap 'cleanup_on_exit $? "Script completed"' EXIT
    
    # Parse and validate arguments
    parse_arguments "$@"
    
    # Validate system prerequisites
    validate_system_prerequisites
    
    # Load configuration
    load_configuration
    
    # Initialize agent environment
    log_orchestrator "INFO" "Initializing agent environment..."
    initialize_agent_environment
    
    # Initialize tmux environment
    initialize_tmux_environment
    
    # Create main session
    create_main_session "$SESSION_NAME"
    
    # Setup session layout
    setup_session_layout "$SESSION_NAME" "$LAYOUT"
    
    # Setup coordinator pane
    setup_coordinator_pane "$SESSION_NAME"
    
    # Setup integration features
    setup_integrations "$SESSION_NAME"
    
    # Start monitoring
    start_monitoring "$SESSION_NAME"
    
    # Finalize and attach/run in background
    finalize_session "$SESSION_NAME"
    
    log_orchestrator "SUCCESS" "MAF Agent orchestration with multi-Codex profile support completed successfully!"
}

# Entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
