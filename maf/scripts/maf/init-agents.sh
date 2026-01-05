#!/bin/bash
# ABOUTME: Agent initialization module for MAF orchestration system that handles individual agent setup and lifecycle management.
# ABOUTME: Integrates with tmux-utils.sh, agent-utils.sh, and supports claude-worker, claude-committer, codex-reviewer, coordinator, glm-worker, minimax-debug, and codex-planner types.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

LIB_DIR="$SCRIPT_DIR/lib"
# Source core libraries
source "$LIB_DIR/error-handling.sh"
source "$LIB_DIR/tmux-utils.sh"
source "$LIB_DIR/agent-utils.sh"

# Configuration defaults
DEFAULT_CONFIG_FILE="$PROJECT_ROOT/.maf/config/default-agent-config.json"
DEFAULT_AGENT_TYPE="claude-worker"
DEFAULT_SESSION_NAME=""
DEFAULT_WINDOW_NAME="workspace"
DEFAULT_PANE_TARGET="0"

# Global variables for agent initialization
AGENT_ID=""
AGENT_TYPE=""
SESSION_NAME=""
WINDOW_NAME=""
PANE_TARGET=""
CONFIG_FILE=""
RECLAIM_MODE=""
LABEL_FILTERS=""
VERBOSE_LOGGING=""

# Colors for output
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

# Enhanced logging functions for agent initialization
log_init() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%H:%M:%S')
    
    case "$level" in
        "INFO")
            echo -e "${CYAN}[INIT ${timestamp}]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[INIT ${timestamp}]${NC} $message"
            ;;
        "WARNING")
            echo -e "${YELLOW}[INIT ${timestamp}]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[INIT ${timestamp}]${NC} $message"
            ;;
        "DEBUG")
            if [[ "$VERBOSE_LOGGING" == "true" ]]; then
                echo -e "${MAGENTA}[INIT ${timestamp}]${NC} $message"
            fi
            ;;
    esac
}

# Print usage information
print_usage() {
    cat << 'USAGEEOF'
MAF Agent Initialization System
===============================

USAGE:
    init-agents.sh [OPTIONS] --agent-id ID --agent-type TYPE

REQUIRED OPTIONS:
    --agent-id ID              Unique identifier for the agent
    --agent-type TYPE          Type of agent (claude-worker, claude-committer, codex-reviewer, coordinator, glm-worker, minimax-debug, codex-planner)

SESSION OPTIONS:
    --session NAME             tmux session name (required for multi-agent sessions)
    --window NAME              tmux window name (default: workspace)
    --pane-target NUM          Target pane number (default: 0)

CONFIGURATION OPTIONS:
    --config FILE              Configuration file (default: .maf/config/default-agent-config.json)
    --label-filters FILTERS    Comma-separated list of constraint labels for task claiming
    --re-claim                 Re-claim tasks for existing agent
    --verbose                  Enable verbose logging

HELP OPTIONS:
    -h, --help                 Show this help message

AGENT TYPES:
    claude-worker       General task execution and development
    claude-committer    Git commit management and integration
    codex-reviewer      Code review and analysis
    coordinator         Session monitoring and coordination
    glm-worker          GLM-4.6 implementation and development tasks
    minimax-debug       Minimax m2 debugging and rescue operations
    codex-planner       Codex planning and audit tasks

EXAMPLES:
    # Initialize a basic worker agent
    ./init-agents.sh --agent-id worker-1 --agent-type claude-worker --session my-session

    # Initialize with label filtering
    ./init-agents.sh --agent-id worker-2 --agent-type claude-worker --session prod --label-filters constraint-b,feature-x

    # Re-claim tasks for existing agent
    ./init-agents.sh --agent-id claude-worker-1 --re-claim --label-filters constraint-a

    # Initialize a reviewer in specific pane
    ./init-agents.sh --agent-id reviewer-1 --agent-type codex-reviewer --session review --window review --pane-target 2

INTEGRATION:
    - Works with npm run maf:claim-task and MAF CLI
    - Integrates with agent-mail system in mcp_agent_mail/
    - Supports beads task management workflow
    - Includes git workflow automation
    - Provides health monitoring and logging

USAGEEOF
}

# Parse command line arguments
parse_arguments() {
    log_init "DEBUG" "Parsing command line arguments"
    
    # Set defaults
    AGENT_ID=""
    AGENT_TYPE=""
    SESSION_NAME=""
    WINDOW_NAME="$DEFAULT_WINDOW_NAME"
    PANE_TARGET="$DEFAULT_PANE_TARGET"
    CONFIG_FILE="$DEFAULT_CONFIG_FILE"
    RECLAIM_MODE="false"
    LABEL_FILTERS=""
    VERBOSE_LOGGING="false"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-id)
                AGENT_ID="$2"
                shift 2
                ;;
            --agent-type)
                AGENT_TYPE="$2"
                shift 2
                ;;
            --session)
                SESSION_NAME="$2"
                shift 2
                ;;
            --window)
                WINDOW_NAME="$2"
                shift 2
                ;;
            --pane-target)
                PANE_TARGET="$2"
                shift 2
                ;;
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --label-filters)
                LABEL_FILTERS="$2"
                shift 2
                ;;
            --re-claim)
                RECLAIM_MODE="true"
                shift
                ;;
            --verbose)
                VERBOSE_LOGGING="true"
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
    
    # Validate parsed arguments
    validate_arguments
    
    log_init "DEBUG" "Agent ID: $AGENT_ID, Type: $AGENT_TYPE, Session: $SESSION_NAME"
}

# Validate parsed arguments
validate_arguments() {
    log_func_info "validate_arguments" "Validating parsed arguments"
    
    # Validate agent ID
    if [[ -z "$AGENT_ID" ]]; then
        handle_error "MISSING_AGENT_ID" "Agent ID is required (use --agent-id)" 3
    fi
    
    # Validate agent type
    if [[ -z "$AGENT_TYPE" ]]; then
        handle_error "MISSING_AGENT_TYPE" "Agent type is required (use --agent-type)" 4
    fi
    
    # Validate agent type is supported
    if [[ ! "$AGENT_TYPE" =~ ^(claude-worker|claude-committer|codex-reviewer|coordinator|glm-worker|minimax-debug|codex-planner)$ ]]; then
        handle_error "INVALID_AGENT_TYPE" \
            "Unsupported agent type: $AGENT_TYPE. Supported: claude-worker, claude-committer, codex-reviewer, coordinator, glm-worker, minimax-debug, codex-planner" \
            5
    fi
    
    # For non-reclaim mode, validate session requirements
    if [[ "$RECLAIM_MODE" != "true" ]]; then
        if [[ -z "$SESSION_NAME" ]]; then
            handle_error "MISSING_SESSION_NAME" "Session name is required for agent initialization (use --session)" 6
        fi
        
        # Validate pane target is a number
        if ! [[ "$PANE_TARGET" =~ ^[0-9]+$ ]]; then
            handle_error "INVALID_PANE_TARGET" "Pane target must be a number (got: $PANE_TARGET)" 7
        fi
    fi
    
    # Validate config file exists
    validate_file_exists "$CONFIG_FILE" "Configuration file"
    
    # Validate label filters format
    if [[ -n "$LABEL_FILTERS" ]]; then
        if [[ ! "$LABEL_FILTERS" =~ ^[a-zA-Z0-9_,-]+$ ]]; then
            handle_error "INVALID_LABEL_FILTERS" "Label filters can only contain letters, numbers, underscores, commas, and hyphens" 8
        fi
    fi
    
    return 0
}

# Load and validate configuration
load_configuration() {
    log_func_info "load_configuration" "Loading configuration from: $CONFIG_FILE"
    
    # Validate JSON format
    if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
        handle_error "INVALID_CONFIG_JSON" "Configuration file is not valid JSON: $CONFIG_FILE" 9
    fi
    
    # Extract agent type configuration
    local agent_config
    agent_config=$(jq ".agent_types.\"$AGENT_TYPE\"" "$CONFIG_FILE")
    
    if [[ -z "$agent_config" ]] || [[ "$agent_config" == "null" ]]; then
        handle_error "AGENT_CONFIG_MISSING" "Agent type configuration not found: $AGENT_TYPE" 10
    fi
    
    log_init "SUCCESS" "Configuration loaded successfully for agent type: $AGENT_TYPE"
    return 0
}

# Validate system prerequisites
validate_system_prerequisites() {
    log_func_info "validate_system_prerequisites" "Validating system prerequisites"
    
    log_init "INFO" "Validating system prerequisites..."
    
    # Use centralized validation
    if ! validate_prerequisites; then
        handle_error "PREREQUISITES_FAILED" "System prerequisites validation failed" 11
    fi
    
    # Additional agent-specific validations
    log_init "INFO" "Validating agent-specific prerequisites..."
    
    # Check if MAF CLI is available
    if ! command -v node &>/dev/null; then
        handle_error "NODE_NOT_FOUND" "Node.js is required for MAF CLI" 12
    fi
    
    # Check MAF CLI functionality
    local maf_index_path="$PROJECT_ROOT/lib/maf/cli/index.js"
    if [[ ! -f "$maf_index_path" ]] && [[ ! -f "$PROJECT_ROOT/lib/maf/cli/index.ts" ]]; then
        log_init "WARNING" "MAF CLI not found at expected path"
    else
        log_init "SUCCESS" "MAF CLI available"
    fi
    
    # Check agent mail system
    if [[ -d "$PROJECT_ROOT/mcp_agent_mail" ]]; then
        log_init "SUCCESS" "Agent mail system available"
    else
        log_init "WARNING" "Agent mail system not found"
    fi
    
    # Check beads workflow
    if jq -e '.integration_settings.beads_workflow.enabled // false' "$CONFIG_FILE" &>/dev/null; then
        log_init "SUCCESS" "Beads workflow integration enabled"
    fi
    
    log_init "SUCCESS" "System prerequisites validated"
    return 0
}

# Initialize agent environment variables
setup_agent_environment() {
    local session_name="$1"
    
    log_func_info "setup_agent_environment" "Setting up environment for agent: $AGENT_ID"
    
    # Load environment variables from config
    local env_vars
    env_vars=$(jq -r ".agent_types.\"$AGENT_TYPE\".environment // {}" "$CONFIG_FILE")
    
    # Set core agent environment variables
    local core_vars=(
        "MAF_AGENT_ID=$AGENT_ID"
        "MAF_AGENT_TYPE=$AGENT_TYPE"
        "SESSION_NAME=$session_name"
        "WINDOW_NAME=$WINDOW_NAME"
        "PROJECT_ROOT=$PROJECT_ROOT"
        "AGENT_WORK_DIR=$PROJECT_ROOT"
        "NODE_ENV=development"
        "MAF_CONFIG_FILE=$CONFIG_FILE"
    )
    
    # Export core variables to the target session/window
    for var in "${core_vars[@]}"; do
        if [[ -n "$session_name" ]] && [[ -n "$WINDOW_NAME" ]]; then
            tmux send-keys -t "$session_name:$WINDOW_NAME" "export $var" Enter
        fi
        log_init "DEBUG" "Set environment variable: $var"
    done
    
    # Export agent-specific environment variables from config
    if [[ "$env_vars" != "null" ]] && [[ -n "$env_vars" ]]; then
        echo "$env_vars" | jq -r 'to_entries[] | "export \(.key)=\(.value)"' | while read -r export_cmd; do
            if [[ -n "$export_cmd" ]] && [[ "$export_cmd" != "export =" ]]; then
                if [[ -n "$session_name" ]] && [[ -n "$WINDOW_NAME" ]]; then
                    tmux send-keys -t "$session_name:$WINDOW_NAME" "$export_cmd" Enter
                fi
                log_init "DEBUG" "Set agent-specific variable: $export_cmd"
            fi
        done
    fi
    
    # Load agent environment file if it exists
    if [[ -f "$PROJECT_ROOT/.maf/agent.env" ]]; then
        if [[ -n "$session_name" ]] && [[ -n "$WINDOW_NAME" ]]; then
            tmux send-keys -t "$session_name:$WINDOW_NAME" "source '$PROJECT_ROOT/.maf/agent.env'" Enter
        fi
        log_init "DEBUG" "Loaded agent environment file"
    fi
    
    log_init "SUCCESS" "Agent environment setup completed"
    return 0
}

# Setup agent mail integration
setup_agent_mail() {
    local session_name="$1"
    
    log_func_info "setup_agent_mail" "Setting up agent mail integration"
    
    local agent_mail_enabled
    agent_mail_enabled=$(jq -r '.integration_settings.agent_mail.enabled // false' "$CONFIG_FILE")
    
    if [[ "$agent_mail_enabled" != "true" ]]; then
        log_init "INFO" "Agent mail integration disabled in configuration"
        return 0
    fi
    
    if [[ ! -d "$PROJECT_ROOT/mcp_agent_mail" ]]; then
        log_init "WARNING" "Agent mail system directory not found: $PROJECT_ROOT/mcp_agent_mail"
        return 1
    fi
    
    # Set up agent mail environment variables
    local mail_vars=(
        "ENABLE_AGENT_MAIL=true"
        "AGENT_MAILBOX_PATH=$PROJECT_ROOT/.agent-mail"
        "MCP_SERVER_PATH=$PROJECT_ROOT/mcp_agent_mail"
    )
    
    for var in "${mail_vars[@]}"; do
        tmux send-keys -t "$session_name:$WINDOW_NAME" "export $var" Enter
    done
    
    # Configure task routing based on agent type
    local task_routing
    task_routing=$(jq -r ".integration_settings.agent_mail.task_routing.\"$AGENT_TYPE\" // []" "$CONFIG_FILE")
    
    if [[ "$task_routing" != "null" ]] && [[ "$task_routing" != "[]" ]]; then
        local routing_str
        routing_str=$(echo "$task_routing" | jq -r 'join(",")')
        tmux send-keys -t "$session_name:$WINDOW_NAME" "export AGENT_TASK_ROUTES=\"$routing_str\"" Enter
        log_init "DEBUG" "Set task routing for $AGENT_TYPE: $routing_str"
    fi
    
    log_init "SUCCESS" "Agent mail integration configured"
    return 0
}

# Setup git workflow environment
setup_git_workflow() {
    local session_name="$1"
    
    log_func_info "setup_git_workflow" "Setting up git workflow environment"
    
    local git_workflow_enabled
    git_workflow_enabled=$(jq -r '.integration_settings.git_workflow.auto_branch_creation // false' "$CONFIG_FILE")
    
    # Set git configuration based on agent type
    if [[ "$AGENT_TYPE" == "claude-committer" ]]; then
        # Configure git author for committer agents
        local git_name
        local git_email
        
        git_name=$(jq -r '.agent_types.claude-committer.environment.GIT_COMMITTER_NAME // "Claude Committer"' "$CONFIG_FILE")
        git_email=$(jq -r '.agent_types.claude-committer.environment.GIT_COMMITTER_EMAIL // "claude@nextnest.internal"' "$CONFIG_FILE")
        
        tmux send-keys -t "$session_name:$WINDOW_NAME" "git config user.name '$git_name'" Enter
        tmux send-keys -t "$session_name:$WINDOW_NAME" "git config user.email '$git_email'" Enter
        
        log_init "DEBUG" "Set git committer identity: $git_name <$git_email>"
    fi
    
    # Configure git workflow settings
    if [[ "$git_workflow_enabled" == "true" ]]; then
        local branch_prefix
        branch_prefix=$(jq -r '.integration_settings.git_workflow.branch_prefix // "maf/"' "$CONFIG_FILE")
        
        tmux send-keys -t "$session_name:$WINDOW_NAME" "export GIT_BRANCH_PREFIX=\"$branch_prefix\"" Enter
        tmux send-keys -t "$session_name:$WINDOW_NAME" "export AUTO_BRANCH_CREATE=true" Enter
        
        log_init "DEBUG" "Git workflow auto-branch creation enabled with prefix: $branch_prefix"
    fi
    
    # Set commit template if configured
    local commit_template
    commit_template=$(jq -r '.integration_settings.git_workflow.commit_template // empty' "$CONFIG_FILE")
    
    if [[ -n "$commit_template" ]] && [[ "$commit_template" != "null" ]]; then
        # Create commit template file
        local template_file="$PROJECT_ROOT/.maf/commit-template.txt"
        echo -e "$commit_template" > "$template_file"
        tmux send-keys -t "$session_name:$WINDOW_NAME" "git config commit.template '$template_file'" Enter
        
        log_init "DEBUG" "Configured git commit template: $template_file"
    fi
    
    log_init "SUCCESS" "Git workflow environment configured"
    return 0
}

# Setup beads task management
setup_beads_workflow() {
    local session_name="$1"
    
    log_func_info "setup_beads_workflow" "Setting up beads task management"
    
    local beads_enabled
    beads_enabled=$(jq -r '.integration_settings.beads_workflow.enabled // false' "$CONFIG_FILE")
    
    if [[ "$beads_enabled" != "true" ]]; then
        log_init "INFO" "Beads workflow integration disabled in configuration"
        return 0
    fi
    
    # Set beads environment variables
    local beads_vars=(
        "ENABLE_BEADS_INTEGRATION=true"
        "BEADS_CONSTRAINT_FILTERING=true"
        "BEADS_AUTO_ASSIGNMENT=true"
        "BEADS_EVIDENCE_COLLECTION=true"
    )
    
    for var in "${beads_vars[@]}"; do
        tmux send-keys -t "$session_name:$WINDOW_NAME" "export $var" Enter
    done
    
    # Check beads CLI commands
    local beads_commands=("maf:beads-ready" "maf:beads-assign" "maf:beads-close")
    local available_commands=()
    
    for cmd in "${beads_commands[@]}"; do
        if jq -e ".scripts.\"$cmd\"" "$PROJECT_ROOT/package.json" &>/dev/null; then
            available_commands+=("$cmd")
        fi
    done
    
    if [[ ${#available_commands[@]} -gt 0 ]]; then
        local commands_str
        commands_str=$(IFS=','; echo "${available_commands[*]}")
        tmux send-keys -t "$session_name:$WINDOW_NAME" "export BEADS_AVAILABLE_COMMANDS=\"$commands_str\"" Enter
        
        log_init "DEBUG" "Available beads commands: $commands_str"
    else
        log_init "WARNING" "No beads commands found in package.json"
    fi
    
    log_init "SUCCESS" "Beads workflow integration configured"
    return 0
}

# Start task claiming workflow
start_task_claiming() {
    local session_name="$1"
    local agent_id="$2"
    
    log_func_info "start_task_claiming" "Starting task claiming for agent: $agent_id"
    
    # Build claim task command
    local claim_cmd="node lib/maf/cli/index.js claim-task"
    
    # Add agent ID
    claim_cmd="$claim_cmd --agent-id $agent_id"
    
    # Add label filters if provided
    if [[ -n "$LABEL_FILTERS" ]]; then
        # Convert comma-separated to space-separated for CLI
        local filters_cli
        filters_cli=$(echo "$LABEL_FILTERS" | sed 's/,/ --label-filter /g')
        claim_cmd="$claim_cmd --label-filter $filters_cli"
    fi
    
    # Add dry run for reclaim mode
    if [[ "$RECLAIM_MODE" == "true" ]]; then
        claim_cmd="$claim_cmd --dry-run"
    fi
    
    # Start task claiming in the background with monitoring
    if [[ "$AGENT_TYPE" == "coordinator" ]]; then
        # Coordinator runs monitoring instead of task claiming
        local monitoring_cmd="watch -n 15 'echo \"=== Coordinator Status \$(date) ===\" && node lib/maf/cli/index.js status'"
        tmux send-keys -t "$session_name:$WINDOW_NAME" "$monitoring_cmd" Enter
        
        log_init "INFO" "Started coordinator monitoring: $monitoring_cmd"
    else
        # Workers, committers, and reviewers claim tasks
        local claiming_loop="while true; do echo \"=== Claiming task for $AGENT_TYPE (\$(date)) ===\"; $claim_cmd; sleep 30; done"
        tmux send-keys -t "$session_name:$WINDOW_NAME" "$claiming_loop" Enter
        
        log_init "INFO" "Started task claiming loop: $claim_cmd"
    fi
    
    log_init "SUCCESS" "Task claiming workflow started for agent: $agent_id"
    return 0
}

# Setup agent-specific startup commands
setup_agent_startup() {
    local session_name="$1"
    local agent_type="$2"
    
    log_func_info "setup_agent_startup" "Setting up startup commands for agent type: $agent_type"
    
    case "$agent_type" in
        "claude-worker")
            # Setup worker-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== Claude Worker Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: code_implementation, debugging, testing, documentation'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter
            
            # Start task claiming
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;
            
        "claude-committer")
            # Setup committer-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== Claude Committer Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: git_operations, commit_message_generation, workflow_automation'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter
            
            # Start git status monitoring
            local git_monitor="watch -n 10 'echo \"=== Git Status \$(date) ===\" && git status --porcelain && echo \"\" && git log --oneline -3'"
            tmux send-keys -t "$session_name:$WINDOW_NAME" "$git_monitor" Enter
            
            # Also start task claiming in a separate loop
            sleep 2
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;
            
        "codex-reviewer")
            # Setup reviewer-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== Codex Reviewer Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: static_analysis, security_review, performance_analysis, code_quality'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter
            
            # Start code quality monitoring
            local review_monitor="watch -n 20 'echo \"=== Code Review Status \$(date) ===\" && npm run lint 2>/dev/null || echo \"Lint failed\" && echo \"\" && npm test 2>/dev/null || echo \"Tests failed\"'"
            tmux send-keys -t "$session_name:$WINDOW_NAME" "$review_monitor" Enter
            
            # Also start task claiming
            sleep 2
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;
            
        "coordinator")
            # Setup coordinator-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== Session Coordinator Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: session_management, resource_monitoring, health_checking'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter

            # Start coordinator monitoring
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;

        "glm-worker")
            # Setup GLM worker-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== GLM-4.6 Worker Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: implementation, coding, development (GLM-4.6 via z.ai API)'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Escalation: Auto-escalate to Minimax after 3 failed attempts'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter

            # Start task claiming
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;

        "minimax-debug")
            # Setup Minimax debug-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== Minimax m2 Debug Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: debug, rescue, error_analysis (Minimax m2 API)'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Mode: Activated by GLM escalation for root cause analysis'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter

            # Start escalation monitoring
            local escalate_monitor="watch -n 15 'echo \"=== Escalation Monitor \$(date) ===\" && find .maf/beads/escalation -name \"*.json\" -mtime -1 2>/dev/null | head -3 || echo \"No recent escalations\"'"
            tmux send-keys -t "$session_name:$WINDOW_NAME" "$escalate_monitor" Enter

            # Also start task claiming for debug tasks
            sleep 2
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;

        "codex-planner")
            # Setup Codex planner-specific commands
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo '=== Codex Planner Agent ==='" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Agent ID: $AGENT_ID'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Capabilities: planning, audit, architecture, constraint_validation'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Role: Validate GLM work and provide planning oversight'" Enter
            tmux send-keys -t "$session_name:$WINDOW_NAME" "echo ''" Enter

            # Start planning and audit monitoring
            local plan_monitor="watch -n 25 'echo \"=== Planning Status \$(date) ===\" && ls -la docs/plans/active/ 2>/dev/null | head -5 || echo \"No active plans\" && echo \"\" && echo \"=== Recent commits ===\" && git log --oneline -5'"
            tmux send-keys -t "$session_name:$WINDOW_NAME" "$plan_monitor" Enter

            # Also start task claiming
            sleep 2
            start_task_claiming "$session_name" "$AGENT_ID"
            ;;
    esac
    
    log_init "SUCCESS" "Agent startup commands configured for: $agent_type"
    return 0
}

# Setup agent health monitoring
setup_health_monitoring() {
    local session_name="$1"
    
    log_func_info "setup_health_monitoring" "Setting up health monitoring for agent: $AGENT_ID"
    
    local health_checks_enabled
    health_checks_enabled=$(jq -r '.monitoring.health_checks.enabled // true' "$CONFIG_FILE")
    
    if [[ "$health_checks_enabled" != "true" ]]; then
        log_init "INFO" "Health monitoring disabled in configuration"
        return 0
    fi
    
    local health_interval
    health_interval=$(jq -r '.monitoring.health_checks.interval // 30' "$CONFIG_FILE")
    
    # Create agent-specific health check command
    local health_cmd="echo \"=== Health Check \$(date) ===\" && "
    health_cmd="$health_cmd echo \"Agent ID: $AGENT_ID\" && "
    health_cmd="$health_cmd echo \"Agent Type: $AGENT_TYPE\" && "
    health_cmd="$health_cmd echo \"Session: $session_name\" && "
    health_cmd="$health_cmd echo \"Working Directory: \$(pwd)\" && "
    health_cmd="$health_cmd echo \"Node Version: \$(node --version)\" && "
    health_cmd="$health_cmd echo \"Git Status: \$(git status --porcelain 2>/dev/null | wc -l || echo 0) changes\" && "
    health_cmd="$health_cmd echo \"Disk Usage: \$(df -h . | tail -1 | awk '{print \$5}')\""
    
    # Start health monitoring loop
    local health_loop="while true; do $health_cmd; echo ''; sleep $health_interval; done"
    
    # Create a separate window for health monitoring if not reclaim mode
    if [[ "$RECLAIM_MODE" != "true" ]]; then
        tmux new-window -t "$session_name" -n "health" -c "$PROJECT_ROOT" \
            "echo 'Agent Health Monitoring Started' && $health_loop"
    else
        # For reclaim mode, just echo the status
        tmux send-keys -t "$session_name:$WINDOW_NAME" "echo 'Health monitoring: enabled (interval: ${health_interval}s)'" Enter
    fi
    
    log_init "SUCCESS" "Health monitoring configured (interval: ${health_interval}s)"
    return 0
}

# Setup agent logging
setup_agent_logging() {
    log_func_info "setup_agent_logging" "Setting up logging for agent: $AGENT_ID"
    
    local agent_log_dir="$PROJECT_ROOT/.maf/logs/agents/$AGENT_ID"
    mkdir -p "$agent_log_dir"
    
    # Create session log file
    local session_log="$agent_log_dir/session.log"
    touch "$session_log"
    
    # Configure tmux to pipe output to log file if not reclaim mode
    if [[ "$RECLAIM_MODE" != "true" ]] && [[ -n "$SESSION_NAME" ]] && [[ -n "$WINDOW_NAME" ]]; then
        tmux pipe-pane -t "$SESSION_NAME:$WINDOW_NAME" "tee -a '$session_log'" 2>/dev/null || \
            log_init "WARNING" "Failed to setup logging for window: $WINDOW_NAME"
    fi
    
    # Create log rotation script
    local rotation_script="$agent_log_dir/rotate-logs.sh"
    cat > "$rotation_script" << 'ROTEOF'
#!/bin/bash
# Rotate agent logs to prevent disk overflow

LOG_DIR="$(dirname "$0")"
MAX_LOG_SIZE="10M"
MAX_LOG_FILES=5

for log_file in "$LOG_DIR"/*.log; do
    if [[ -f "$log_file" ]]; then
        # Rotate if log exceeds max size
        if [[ $(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo 0) -gt 10485760 ]]; then
            mv "$log_file" "${log_file}.$(date +%Y%m%d-%H%M%S)"
        fi
    fi
done

# Keep only the most recent log files
find "$LOG_DIR" -name "*.log.*" -type f | sort -r | tail -n +$((MAX_LOG_FILES + 1)) | xargs rm -f 2>/dev/null || true
ROTEOF
    
    chmod +x "$rotation_script"
    
    log_init "SUCCESS" "Agent logging configured: $agent_log_dir"
    return 0
}

# Main agent initialization function
initialize_agent() {
    log_init "INFO" "Initializing agent: $AGENT_ID (type: $AGENT_TYPE)"
    
    # Validate system prerequisites
    validate_system_prerequisites
    
    # Load configuration
    load_configuration
    
    # Setup agent logging
    setup_agent_logging
    
    # For reclaim mode, just update existing agent
    if [[ "$RECLAIM_MODE" == "true" ]]; then
        log_init "INFO" "Re-claim mode: updating existing agent"
        
        # Find existing agent session
        local existing_session
        existing_session=$(find_agent "$AGENT_ID" 2>/dev/null | jq -r '.session // empty')
        
        if [[ -n "$existing_session" ]]; then
            log_init "INFO" "Found existing session: $existing_session"
            
            # Start task claiming in existing session
            start_task_claiming "$existing_session" "$AGENT_ID"
            
            log_init "SUCCESS" "Agent task claiming re-initialized: $AGENT_ID"
            return 0
        else
            log_init "WARNING" "No existing session found for agent: $AGENT_ID"
            log_init "INFO" "Proceeding with full initialization"
            RECLAIM_MODE="false"
        fi
    fi
    
    # Validate target session exists
    if ! tmux list-sessions 2>/dev/null | grep -q "^$SESSION_NAME:"; then
        handle_error "SESSION_NOT_FOUND" "Target session not found: $SESSION_NAME" 13
    fi
    
    # Validate target window/pane exists
    if ! tmux list-windows -t "$SESSION_NAME" 2>/dev/null | grep -q "$WINDOW_NAME"; then
        handle_error "WINDOW_NOT_FOUND" "Target window not found: $SESSION_NAME:$WINDOW_NAME" 14
    fi
    
    # Setup agent environment
    setup_agent_environment "$SESSION_NAME"
    
    # Setup integrations
    setup_agent_mail "$SESSION_NAME"
    setup_git_workflow "$SESSION_NAME"
    setup_beads_workflow "$SESSION_NAME"
    
    # Setup agent-specific startup
    setup_agent_startup "$SESSION_NAME" "$AGENT_TYPE"
    
    # Setup health monitoring
    setup_health_monitoring "$SESSION_NAME"
    
    # Register agent if not already registered
    if ! find_agent "$AGENT_ID" &>/dev/null; then
        register_agent "$AGENT_ID" "$AGENT_TYPE" "$SESSION_NAME" "Initialized via init-agents.sh"
    else
        update_agent_status "$AGENT_ID" "active"
    fi
    
    log_init "SUCCESS" "Agent initialization completed: $AGENT_ID"
    return 0
}

# Cleanup function on script exit
cleanup_on_exit() {
    local exit_code="$1"
    
    log_init "INFO" "Running cleanup on exit (code: $exit_code)"
    
    # Run general cleanup
    cleanup_temp_files
    
    log_init "INFO" "Cleanup completed"
}

# Main execution function
main() {
    log_init "INFO" "MAF Agent Initialization System starting..."
    log_init "INFO" "Project root: $PROJECT_ROOT"
    
    # Setup error traps with custom cleanup
    trap 'cleanup_on_error "INITIALIZATION_ERROR" "Script failed at line $LINENO" $?' ERR
    trap 'cleanup_on_exit $?' EXIT
    
    # Parse and validate arguments
    parse_arguments "$@"
    
    # Initialize agent
    initialize_agent
    
    log_init "SUCCESS" "MAF Agent initialization completed successfully!"
    
    # Show status information
    echo
    echo "=== Agent Status ==="
    echo "Agent ID: $AGENT_ID"
    echo "Agent Type: $AGENT_TYPE"
    echo "Session: $SESSION_NAME"
    echo "Window: $WINDOW_NAME"
    echo "Label Filters: ${LABEL_FILTERS:-none}"
    echo "Re-claim Mode: $RECLAIM_MODE"
    echo
    echo "=== Useful Commands ==="
    echo "Attach to session: tmux attach-session -t $SESSION_NAME"
    echo "Switch to window: tmux select-window -t $SESSION_NAME:$WINDOW_NAME"
    echo "Agent status: ./scripts/maf/lib/agent-utils.sh stats $AGENT_ID"
    echo "List agents: ./scripts/maf/lib/agent-utils.sh list"
    echo "Health check: ./scripts/maf/lib/agent-utils.sh health $AGENT_ID"
    echo
}

# Entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
