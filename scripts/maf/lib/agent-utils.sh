#!/bin/bash
# ABOUTME: Agent environment setup and lifecycle management for MAF orchestration system.
# ABOUTME: Integrates with existing MAF CLI and supports claude-worker, codex-reviewer, claude-committer types.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
# MAF scripts are in scripts/maf/lib/, so project root is three levels up
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# Source dependencies relative to this repo
source "$SCRIPT_DIR/error-handling.sh"
source "$SCRIPT_DIR/tmux-utils.sh"
# Configuration defaults
AGENT_REGISTRY_FILE="$PROJECT_ROOT/.maf/agents.json"
AGENT_WORK_DIR="$PROJECT_ROOT"
AGENT_LOGS_DIR="$PROJECT_ROOT/.maf/logs/agents"
AGENT_CONFIG_DIR="$PROJECT_ROOT/.maf/config"
AGENT_ENV_FILE="$PROJECT_ROOT/.maf/agent.env"

# Supported agent types
declare -A AGENT_TYPES=(
    ["claude-worker"]="Claude AI worker for task execution and development"
    ["codex-reviewer"]="Code review and analysis specialist"
    ["claude-committer"]="Git commit management and integration specialist"
)

# Default agent configurations
declare -A AGENT_DEFAULT_CONFIGS=(
    ["claude-worker"]='{"windows":["workspace","monitor","git","test"],"startup_cmd":"npm run maf:claim-task"}'
    ["codex-reviewer"]='{"windows":["review","analysis","lint"],"startup_cmd":"npm run test:coverage"}'
    ["claude-committer"]='{"windows":["commit","staging","history"],"startup_cmd":"git status"}'
)

# Colors for output
source "$SCRIPT_DIR/../colors.sh" 2>/dev/null || {
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
}

# Logging functions
log_agent_info() {
    echo -e "${BLUE}[AGENT]${NC} $1"
}

log_agent_success() {
    echo -e "${GREEN}[AGENT]${NC} $1"
}

log_agent_warning() {
    echo -e "${YELLOW}[AGENT]${NC} $1"
}

log_agent_error() {
    echo -e "${RED}[AGENT]${NC} $1"
}

# Initialize agent environment
initialize_agent_environment() {
    log_func_info "initialize_agent_environment" "Initializing MAF agent environment"
    
    # Create necessary directories
    mkdir -p "$AGENT_LOGS_DIR" "$AGENT_CONFIG_DIR"
    
    # Initialize agent registry if it doesn't exist
    if [[ ! -f "$AGENT_REGISTRY_FILE" ]]; then
        cat > "$AGENT_REGISTRY_FILE" << 'REGEOF'
{
  "agents": [],
  "metadata": {
    "created": "",
    "last_updated": "",
    "version": "1.0"
  }
}
REGEOF
        log_agent_info "Created agent registry: $AGENT_REGISTRY_FILE"
    fi
    
    # Create default environment file if it doesn't exist
    if [[ ! -f "$AGENT_ENV_FILE" ]]; then
        cat > "$AGENT_ENV_FILE" << 'ENVEOF'
# MAF Agent Environment Variables
# These variables are available to all agent sessions

# Project information
# Auto-detect project root
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
export AGENT_WORK_DIR="$PROJECT_ROOT"

# Node.js environment
export NODE_ENV="development"
export DEBUG_MODE="${DEBUG_MODE:-false}"

# MAF Configuration
export MAF_LOG_LEVEL="${MAF_LOG_LEVEL:-info}"
export MAF_TASK_TIMEOUT="${MAF_TASK_TIMEOUT:-300}"  # 5 minutes
export MAF_MAX_RETRIES="${MAF_MAX_RETRIES:-3}"

# Agent configuration
export AGENT_AUTO_RESTART="${AGENT_AUTO_RESTART:-false}"
export AGENT_CLEANUP_ON_EXIT="${AGENT_CLEANUP_ON_EXIT:-true}"

# Integration settings
export ENABLE_AGENT_MAIL="${ENABLE_AGENT_MAIL:-true}"
export ENABLE_BEADS_INTEGRATION="${ENABLE_BEADS_INTEGRATION:-true}"

# Performance settings
export AGENT_CPU_LIMIT="${AGENT_CPU_LIMIT:-80}"
export AGENT_MEMORY_LIMIT="${AGENT_MEMORY_LIMIT:-512}"  # MB
ENVEOF
        log_agent_info "Created agent environment file: $AGENT_ENV_FILE"
    fi
    
    # Update registry metadata
    update_registry_metadata
    
    log_agent_success "Agent environment initialized successfully"
    return 0
}

# Update agent registry metadata
update_registry_metadata() {
    local temp_file
    temp_file=$(mktemp)
    
    jq --arg timestamp "$(date -Iseconds)" '
        .metadata.last_updated = $timestamp |
        if .metadata.created == "" then
            .metadata.created = $timestamp
        else
            .
        end
    ' "$AGENT_REGISTRY_FILE" > "$temp_file" && mv "$temp_file" "$AGENT_REGISTRY_FILE"
    
    log_debug "Agent registry metadata updated"
}

# Validate agent type
validate_agent_type() {
    local agent_type="$1"
    
    log_func_info "validate_agent_type" "Validating agent type: $agent_type"
    
    if [[ -z "$agent_type" ]]; then
        handle_error "INVALID_AGENT_TYPE" "Agent type cannot be empty" 2
    fi
    
    if [[ ! -v "AGENT_TYPES[$agent_type]" ]]; then
        local supported_types
        supported_types=$(printf "%s, " "${!AGENT_TYPES[@]}" | sed 's/, $//')
        handle_error "UNSUPPORTED_AGENT_TYPE" \
            "Unsupported agent type: $agent_type. Supported types: $supported_types" \
            2 \
            "Agent type requested: $agent_type"
    fi
    
    log_debug "Agent type validated: $agent_type"
    return 0
}

# Generate unique agent ID
generate_agent_id() {
    local agent_type="$1"
    local timestamp
    timestamp=$(date +%s)
    local random_suffix
    random_suffix=$(head -c 4 /dev/urandom | od -A n -t x | tr -d '[:space:]')
    
    echo "${agent_type}-${timestamp}-${random_suffix}"
}

# Register agent in registry
register_agent() {
    local agent_id="$1"
    local agent_type="$2"
    local session_name="${3:-}"
    local description="${4:-$agent_type agent}"
    
    log_func_info "register_agent" "Registering agent: $agent_id"
    
    validate_required_args "register_agent" "$agent_id" "$agent_type"
    validate_agent_type "$agent_type"
    
    local temp_file
    temp_file=$(mktemp)
    
    local agent_entry
    agent_entry=$(jq -n \
        --arg id "$agent_id" \
        --arg type "$agent_type" \
        --arg session "$session_name" \
        --arg description "$description" \
        --arg status "initializing" \
        --arg created "$(date -Iseconds)" \
        --arg last_seen "$(date -Iseconds)" '{
            id: $id,
            type: $type,
            session: $session,
            description: $description,
            status: $status,
            created: $created,
            last_seen: $last_seen,
            tasks_completed: 0,
            errors_count: 0
        }')
    
    # Add agent to registry
    jq --argjson new_agent "$agent_entry" '.agents += [$new_agent]' "$AGENT_REGISTRY_FILE" > "$temp_file" && mv "$temp_file" "$AGENT_REGISTRY_FILE"
    
    update_registry_metadata
    
    log_agent_success "Agent registered: $agent_id"
    return 0
}

# Update agent status
update_agent_status() {
    local agent_id="$1"
    local status="$2"
    local additional_data="${3:-}"
    
    log_func_info "update_agent_status" "Updating agent $agent_id status to: $status"
    
    validate_required_args "update_agent_status" "$agent_id" "$status"
    
    local temp_file
    temp_file=$(mktemp)
    
    local update_filter
    if [[ -n "$additional_data" ]]; then
        update_filter="--argjson additional $additional_data"
    else
        update_filter=""
    fi
    
    # Update agent status and last_seen timestamp
    jq --arg id "$agent_id" \
       --arg status "$status" \
       --arg timestamp "$(date -Iseconds)" \
       $update_filter '
        .agents |= map(
            if .id == $id then
                .status = $status |
                .last_seen = $timestamp |
                if $additional then . += $additional else . end
            else
                .
            end
        )
    ' "$AGENT_REGISTRY_FILE" > "$temp_file" && mv "$temp_file" "$AGENT_REGISTRY_FILE"
    
    log_debug "Agent status updated: $agent_id -> $status"
    return 0
}

# Find agent in registry
find_agent() {
    local agent_id="$1"
    
    log_func_info "find_agent" "Looking for agent: $agent_id"
    
    validate_required_args "find_agent" "$agent_id"
    
    local agent_info
    agent_info=$(jq -r --arg id "$agent_id" '
        .agents[] | select(.id == $id)
    ' "$AGENT_REGISTRY_FILE" 2>/dev/null || echo "")
    
    if [[ -z "$agent_info" ]]; then
        log_debug "Agent not found: $agent_id"
        return 1
    fi
    
    echo "$agent_info"
    return 0
}

# List all registered agents
list_agents() {
    local status_filter="${1:-}"
    
    log_func_info "list_agents" "Listing agents (filter: ${statusFilter:-all})"
    
    echo "Registered MAF Agents:"
    echo "====================="
    
    local filter_query='.agents[]'
    if [[ -n "$status_filter" ]]; then
        filter_query="$filter_query | select(.status == \"$status_filter\")"
    fi
    
    jq -r "$filter_query | 
        \"ID: \(.id)\n  Type: \(.type)\n  Status: \(.status)\n  Session: \(.session // \"None\")\n  Created: \(.created)\n  Tasks: \(.tasks_completed // 0)\n\"" \
        "$AGENT_REGISTRY_FILE" 2>/dev/null || echo "No agents found or registry inaccessible"
    
    return 0
}

# Create and start agent session
create_agent() {
    local agent_type="$1"
    local agent_id="${2:-}"
    local description="${3:-}"
    
    log_func_info "create_agent" "Creating agent of type: $agent_type"
    
    validate_agent_type "$agent_type"
    
    # Generate agent ID if not provided
    if [[ -z "$agent_id" ]]; then
        agent_id=$(generate_agent_id "$agent_type")
    fi
    
    # Validate agent ID is unique
    if find_agent "$agent_id" &>/dev/null; then
        handle_error "AGENT_EXISTS" "Agent with ID $agent_id already exists" 3
    fi
    
    # Register agent first
    register_agent "$agent_id" "$agent_type" "" "$description"
    
    # Create tmux session
    local session_name
    session_name="maf-agent-$agent_id"
    
    if create_agent_session "$agent_id" "$agent_type"; then
        # Update agent registry with session name
        update_agent_status "$agent_id" "active" '{"session": "'"$session_name"'"}'
        
        # Setup agent logging
        setup_agent_logging "$agent_id" "$session_name"
        
        # Load agent environment
        load_agent_environment "$session_name"
        
        log_agent_success "Agent created successfully: $agent_id"
        echo "$agent_id"
        return 0
    else
        # Cleanup registry entry if session creation failed
        cleanup_agent_registry "$agent_id"
        handle_error "AGENT_CREATE_FAILED" "Failed to create agent session for: $agent_id" 4
    fi
}

# Setup agent-specific logging
setup_agent_logging() {
    local agent_id="$1"
    local session_name="$2"
    
    log_func_info "setup_agent_logging" "Setting up logging for agent: $agent_id"
    
    local agent_log_dir="$AGENT_LOGS_DIR/$agent_id"
    mkdir -p "$agent_log_dir"
    
    # Create log files for each window
    local config
    config="${AGENT_DEFAULT_CONFIGS[$agent_type]}"
    local windows
    windows=$(echo "$config" | jq -r '.windows[]' 2>/dev/null || echo "workspace")
    
    local window_num=1
    for window in $windows; do
        local log_file="$agent_log_dir/${window}.log"
        touch "$log_file"
        
        # Configure tmux to pipe output to log file
        tmux pipe-pane -t "$session_name:$window_num" "cat >> '$log_file'" 2>/dev/null || \
            log_agent_warning "Failed to setup logging for window: $window"
        
        ((window_num++))
    done
    
    log_debug "Agent logging configured: $agent_id"
    return 0
}

# Load agent environment into session
load_agent_environment() {
    local session_name="$1"
    
    log_func_info "load_agent_environment" "Loading environment for session: $session_name"
    
    if [[ -f "$AGENT_ENV_FILE" ]]; then
        # Source environment file in the first window
        tmux send-keys -t "$session_name:1" "source '$AGENT_ENV_FILE'" Enter
        log_debug "Agent environment loaded: $session_name"
    else
        log_agent_warning "Agent environment file not found: $AGENT_ENV_FILE"
    fi
    
    return 0
}

# Start agent (resume existing session)
start_agent() {
    local agent_id="$1"
    
    log_func_info "start_agent" "Starting agent: $agent_id"
    
    validate_required_args "start_agent" "$agent_id"
    
    local agent_info
    agent_info=$(find_agent "$agent_id")
    
    if [[ -z "$agent_info" ]]; then
        handle_error "AGENT_NOT_FOUND" "Agent $agent_id not found in registry" 5
    fi
    
    local session_name
    session_name=$(echo "$agent_info" | jq -r '.session // empty')
    
    if [[ -z "$session_name" ]]; then
        handle_error "AGENT_NO_SESSION" "Agent $agent_id has no associated session" 6
    fi
    
    # Validate session exists
    if ! validate_session "$agent_id"; then
        handle_error "SESSION_NOT_FOUND" "Session for agent $agent_id not found" 7
    fi
    
    # Update agent status
    update_agent_status "$agent_id" "active"
    
    log_agent_success "Agent started: $agent_id"
    return 0
}

# Stop agent (pause session)
stop_agent() {
    local agent_id="$1"
    
    log_func_info "stop_agent" "Stopping agent: $agent_id"
    
    validate_required_args "stop_agent" "$agent_id"
    
    local agent_info
    agent_info=$(find_agent "$agent_id")
    
    if [[ -z "$agent_info" ]]; then
        handle_error "AGENT_NOT_FOUND" "Agent $agent_id not found in registry" 5
    fi
    
    local session_name
    session_name=$(echo "$agent_info" | jq -r '.session // empty')
    
    if [[ -n "$session_name" ]]; then
        # Send Ctrl+C to interrupt current process
        send_command_to_session "$agent_id" "1" "C-c"
        update_agent_status "$agent_id" "stopped"
        log_agent_success "Agent stopped: $agent_id"
    else
        log_agent_warning "Agent $agent_id has no session to stop"
    fi
    
    return 0
}

# Delete agent (cleanup session and registry)
delete_agent() {
    local agent_id="$1"
    local force="${2:-false}"
    
    log_func_info "delete_agent" "Deleting agent: $agent_id (force: $force)"
    
    validate_required_args "delete_agent" "$agent_id"
    
    local agent_info
    agent_info=$(find_agent "$agent_id")
    
    if [[ -z "$agent_info" ]]; then
        log_agent_warning "Agent $agent_id not found in registry"
        return 1
    fi
    
    local session_name
    session_name=$(echo "$agent_info" | jq -r '.session // empty')
    local status
    status=$(echo "$agent_info" | jq -r '.status // unknown')
    
    # Check if agent is active and not force-deleting
    if [[ "$status" == "active" ]] && [[ "$force" != "true" ]]; then
        handle_error "AGENT_ACTIVE" "Agent $agent_id is currently active. Use force=true to delete" 8
    fi
    
    # Kill session if it exists
    if [[ -n "$session_name" ]]; then
        kill_agent_session "$agent_id" "$force" || log_agent_warning "Failed to kill session for agent: $agent_id"
    fi
    
    # Clean up agent logs (optional - keep for history)
    if [[ "$force" == "true" ]]; then
        local agent_log_dir="$AGENT_LOGS_DIR/$agent_id"
        if [[ -d "$agent_log_dir" ]]; then
            rm -rf "$agent_log_dir" || log_agent_warning "Failed to clean up logs for agent: $agent_id"
        fi
    fi
    
    # Remove from registry
    cleanup_agent_registry "$agent_id"
    
    log_agent_success "Agent deleted: $agent_id"
    return 0
}

# Remove agent from registry
cleanup_agent_registry() {
    local agent_id="$1"
    
    log_func_info "cleanup_agent_registry" "Removing agent from registry: $agent_id"
    
    local temp_file
    temp_file=$(mktemp)
    
    jq --arg id "$agent_id" '.agents |= map(select(.id != $id))' "$AGENT_REGISTRY_FILE" > "$temp_file" && mv "$temp_file" "$AGENT_REGISTRY_FILE"
    
    update_registry_metadata
    
    log_debug "Agent removed from registry: $agent_id"
    return 0
}

# Get agent statistics
get_agent_stats() {
    local agent_id="$1"
    
    log_func_info "get_agent_stats" "Getting statistics for agent: $agent_id"
    
    validate_required_args "get_agent_stats" "$agent_id"
    
    local agent_info
    agent_info=$(find_agent "$agent_id")
    
    if [[ -z "$agent_info" ]]; then
        log_agent_error "Agent $agent_id not found"
        return 1
    fi
    
    # Get session statistics if session exists
    local session_name
    session_name=$(echo "$agent_info" | jq -r '.session // empty')
    
    if [[ -n "$session_name" ]] && validate_session "$agent_id" &>/dev/null; then
        local resource_usage
        resource_usage=$(monitor_resource_usage "$agent_id" 2>/dev/null || echo "0|0|unknown")
        local cpu_usage=$(echo "$resource_usage" | cut -d'|' -f1)
        local mem_usage=$(echo "$resource_usage" | cut -d'|' -f2)
        local session_pid=$(echo "$resource_usage" | cut -d'|' -f3)
        
        # Update agent info with resource usage
        agent_info=$(echo "$agent_info" | jq --arg cpu "$cpu_usage" --arg mem "$mem_usage" --arg pid "$session_pid" \
            '. + {cpu_usage: $cpu, memory_usage: $mem, session_pid: $pid}')
    fi
    
    echo "$agent_info"
    return 0
}

# Agent health check
agent_health_check() {
    local agent_id="$1"
    
    log_func_info "agent_health_check" "Checking health of agent: $agent_id"
    
    validate_required_args "agent_health_check" "$agent_id"
    
    local health_issues=0
    
    # Check if agent exists in registry
    if ! find_agent "$agent_id" &>/dev/null; then
        log_agent_error "Agent not found in registry: $agent_id"
        ((health_issues++))
    fi
    
    # Check if session is running
    if ! validate_session "$agent_id" &>/dev/null; then
        log_agent_warning "Agent session not accessible: $agent_id"
        ((health_issues++))
    fi
    
    # Check agent log files
    local agent_log_dir="$AGENT_LOGS_DIR/$agent_id"
    if [[ -d "$agent_log_dir" ]]; then
        local log_files
        log_files=$(find "$agent_log_dir" -name "*.log" -type f 2>/dev/null | wc -l)
        if [[ $log_files -eq 0 ]]; then
            log_agent_warning "No log files found for agent: $agent_id"
            ((health_issues++))
        fi
    else
        log_agent_warning "Agent log directory not found: $agent_id"
        ((health_issues++))
    fi
    
    # Report health status
    if [[ $health_issues -eq 0 ]]; then
        update_agent_status "$agent_id" "healthy"
        log_agent_success "Agent health check passed: $agent_id"
        return 0
    else
        update_agent_status "$agent_id" "unhealthy"
        log_agent_warning "Agent health check failed with $health_issues issues: $agent_id"
        return 1
    fi
}

# Run health check on all agents
health_check_all_agents() {
    log_func_info "health_check_all_agents" "Running health check on all agents"
    
    local healthy_agents=0
    local unhealthy_agents=0
    local total_agents=0
    
    jq -r '.agents[].id' "$AGENT_REGISTRY_FILE" 2>/dev/null | while read -r agent_id; do
        if [[ -n "$agent_id" ]]; then
            ((total_agents++))
            if agent_health_check "$agent_id"; then
                ((healthy_agents++))
            else
                ((unhealthy_agents++))
            fi
        fi
    done
    
    log_agent_info "Health check completed: $healthy_agents/$total_agents agents healthy"
    return $unhealthy_agents
}

# Integration with MAF CLI
run_maf_command() {
    local agent_id="$1"
    local maf_command="$2"
    local window="${3:-1}"
    
    log_func_info "run_maf_command" "Running MAF command for agent $agent_id: $maf_command"
    
    validate_required_args "run_maf_command" "$agent_id" "$maf_command"
    
    # Validate agent exists and is active
    if ! find_agent "$agent_id" &>/dev/null; then
        handle_error "AGENT_NOT_FOUND" "Agent $agent_id not found" 5
    fi
    
    # Send MAF command to agent session
    send_command_to_session "$agent_id" "$window" "$maf_command"
    
    # Update agent statistics
    local temp_file
    temp_file=$(mktemp)
    
    jq --arg id "$agent_id" '
        .agents |= map(
            if .id == $id then
                .tasks_completed = (.tasks_completed // 0) + 1 |
                .last_seen = now | strftime("%Y-%m-%dT%H:%M:%SZ")
            else
                .
            end
        )
    ' "$AGENT_REGISTRY_FILE" > "$temp_file" && mv "$temp_file" "$AGENT_REGISTRY_FILE"
    
    log_agent_success "MAF command sent to agent $agent_id: $maf_command"
    return 0
}

# Main execution block for standalone usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Initialize agent environment
    initialize_agent_environment
    
    # Simple CLI interface for testing
    case "${1:-}" in
        "list")
            list_agents "${2:-}"
            ;;
        "create")
            create_agent "${2:-claude-worker}" "${3:-}" "${4:-}"
            ;;
        "start")
            start_agent "${2:-}"
            ;;
        "stop")
            stop_agent "${2:-}"
            ;;
        "delete")
            delete_agent "${2:-}" "${3:-false}"
            ;;
        "health")
            if [[ -n "${2:-}" ]]; then
                agent_health_check "$2"
            else
                health_check_all_agents
            fi
            ;;
        "stats")
            get_agent_stats "${2:-}"
            ;;
        *)
            echo "Usage: $0 {list [status]|create [type] [id] [desc]|start <id>|stop <id>|delete <id> [force]|health [id]|stats <id>}"
            echo "  list    - List all agents (optional status filter)"
            echo "  create  - Create new agent (type: claude-worker, codex-reviewer, claude-committer)"
            echo "  start   - Start existing agent"
            echo "  stop    - Stop active agent"
            echo "  delete  - Delete agent (use force=true to delete active agents)"
            echo "  health  - Run health check (specific agent or all)"
            echo "  stats   - Get agent statistics"
            echo
            echo "Agent types:"
            for type in "${!AGENT_TYPES[@]}"; do
                echo "  $type - ${AGENT_TYPES[$type]}"
            done
            exit 1
            ;;
    esac
fi
