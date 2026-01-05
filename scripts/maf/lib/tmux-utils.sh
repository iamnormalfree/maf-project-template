#!/bin/bash
# ABOUTME: Core tmux session management utilities for MAF orchestration system.
# ABOUTME: Provides session creation, window management, and layout operations.

set -euo pipefail

# Script directory and project root detection
# Use unique variable name to avoid inheriting parent's SCRIPT_DIR
TMUX_UTILS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# MAF scripts are in scripts/maf/lib/ or maf/scripts/maf/lib/
# Detect subtree layout and adjust PROJECT_ROOT accordingly
if [[ "$TMUX_UTILS_SCRIPT_DIR" == *"/maf/scripts/maf/lib" ]]; then
    # Subtree layout: maf/scripts/maf/lib/ -> go up 4 levels
    PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$TMUX_UTILS_SCRIPT_DIR/../../../.." && pwd)}"
else
    # Direct layout: scripts/maf/lib/ -> go up 3 levels
    PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$TMUX_UTILS_SCRIPT_DIR/../../.." && pwd)}"
fi

# Source dependencies relative to this repo
source "$TMUX_UTILS_SCRIPT_DIR/error-handling.sh"

# Configuration defaults
TMUX_SESSION_PREFIX="maf-agent"
TMUX_BASE_SESSION="maf-base"
TMUX_WORK_DIR="$PROJECT_ROOT"
TMUX_CONFIG_FILE="$PROJECT_ROOT/.maf/tmux.conf"

# Colors for output
source "$TMUX_UTILS_SCRIPT_DIR/../colors.sh" 2>/dev/null || {
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
}

# Logging functions
log_tmux_info() {
    echo -e "${BLUE}[TMUX]${NC} $1"
}

log_tmux_success() {
    echo -e "${GREEN}[TMUX]${NC} $1"
}

log_tmux_warning() {
    echo -e "${YELLOW}[TMUX]${NC} $1"
}

log_tmux_error() {
    echo -e "${RED}[TMUX]${NC} $1"
}

# Validate tmux installation and version
validate_tmux_installation() {
    log_func_info "Validating tmux installation"
    
    if ! command -v tmux &> /dev/null; then
        handle_error "TMUX_NOT_FOUND" "tmux is required but not installed. Install with: sudo apt-get install tmux" 1
    fi
    
    local tmux_version
    tmux_version=$(tmux -V 2>/dev/null | cut -d' ' -f2 || echo "unknown")
    log_tmux_info "tmux version: $tmux_version"
    
    # Check for minimum version (tmux 3.0+ recommended)
    if [[ "$tmux_version" != "unknown" ]]; then
        local major_version=$(echo "$tmux_version" | cut -d'.' -f1)
        if [[ "$major_version" -lt 3 ]]; then
            log_tmux_warning "tmux version $tmux_version detected. Version 3.0+ recommended for full functionality"
        fi
    fi
    
    return 0
}

# Check if tmux server is running
is_tmux_server_running() {
    tmux list-sessions &>/dev/null
}

# Start tmux server if not running
ensure_tmux_server() {
    log_func_info "Ensuring tmux server is running"
    
    if ! is_tmux_server_running; then
        log_tmux_info "Starting tmux server..."
        tmux new-session -d -s "$TMUX_BASE_SESSION" -c "$TMUX_WORK_DIR" \
            "echo 'MAF tmux server started. Press Ctrl+B, D to detach.' && sleep 3600"
        
        if is_tmux_server_running; then
            log_tmux_success "tmux server started successfully"
        else
            handle_error "TMUX_SERVER_START_FAILED" "Failed to start tmux server" 1
        fi
    else
        log_tmux_info "tmux server already running"
    fi
    
    return 0
}

# Create custom tmux config if not exists
create_tmux_config() {
    log_func_info "Creating tmux configuration"
    
    if [[ ! -f "$TMUX_CONFIG_FILE" ]]; then
        mkdir -p "$(dirname "$TMUX_CONFIG_FILE")"
        cat > "$TMUX_CONFIG_FILE" << 'TMUXCONF'
# MAF Tmux Configuration
# Optimized for multi-agent development workflow

# Increase scrollback buffer
set -g history-limit 50000

# Enable mouse support
set -g mouse on

# Use vi keys
setw -g mode-keys vi

# Better window naming
set -g automatic-rename on
set -g automatic-rename-format "#{pane_current_command}"

# Status bar customization
set -g status-bg black
set -g status-fg white
set -g status-left-length 30
set -g status-left '#[fg=green]MAF: #S #[default]'

# Window status
set -g window-status-current-bg white
set -g window-status-current-fg black
set -g window-status-current-attr bold

# Pane border colors
set -g pane-border-fg colour238
set -g pane-active-border-fg green

# Message colors
set -g message-bg colour235
set -g message-fg colour255

# Activity monitoring
setw -g monitor-activity on
set -g visual-activity on

# Faster command sequences
set -s escape-time 10

# Increase repeat timeout
set -sg repeat-time 600

# Focus events enabled for terminals that support them
set -g focus-events on

# Super useful when using "grouped sessions" and multi-monitor setup
setw -g aggressive-resize on

# Base index for windows and panes
set -g base-index 1
setw -g pane-base-index 1

# Copy-paste improvements
bind-key -T copy-mode-vi v send -X begin-selection
bind-key -T copy-mode-vi y send -X copy-selection-and-cancel
TMUXCONF
        
        log_tmux_success "Created tmux configuration: $TMUX_CONFIG_FILE"
    else
        log_tmux_info "tmux configuration already exists: $TMUX_CONFIG_FILE"
    fi
    
    return 0
}

# Create a new agent session
create_agent_session() {
    local agent_id="$1"
    local agent_type="${2:-claude-worker}"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    
    log_func_info "Creating tmux session for agent: $agent_id (type: $agent_type)"
    
    # Validate inputs
    validate_required_args "create_agent_session" "$agent_id"
    
    # Check if session already exists
    if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_warning "Session $session_name already exists"
        return 1
    fi
    
    # Ensure tmux server is running
    ensure_tmux_server
    
    # Create session with initial window
    case "$agent_type" in
        "claude-worker")
            tmux new-session -d -s "$session_name" -c "$TMUX_WORK_DIR" \
                -n "workspace" \
                "echo 'Claude Worker Environment Ready' && npm run maf:claim-task"
            ;;
        "codex-reviewer")
            tmux new-session -d -s "$session_name" -c "$TMUX_WORK_DIR" \
                -n "review" \
                "echo 'CodeX Reviewer Environment Ready' && npm run test:coverage"
            ;;
        "claude-committer")
            tmux new-session -d -s "$session_name" -c "$TMUX_WORK_DIR" \
                -n "commit" \
                "echo 'Claude Committer Environment Ready' && git status"
            ;;
        *)
            # Default session setup
            tmux new-session -d -s "$session_name" -c "$TMUX_WORK_DIR" \
                -n "workspace" \
                "echo 'Agent $agent_id Environment Ready' && bash"
            ;;
    esac
    
    if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_success "Created session: $session_name"
        
        # Setup additional windows based on agent type
        setup_agent_windows "$session_name" "$agent_type"
        
        return 0
    else
        handle_error "SESSION_CREATE_FAILED" "Failed to create session: $session_name" 1
    fi
}

# Setup additional windows for agent sessions
setup_agent_windows() {
    local session_name="$1"
    local agent_type="$2"
    
    log_func_info "Setting up windows for session: $session_name (type: $agent_type)"
    
    case "$agent_type" in
        "claude-worker")
            # Window 2: Task monitoring
            tmux new-window -t "$session_name:2" -n "monitor" \
                -c "$TMUX_WORK_DIR" "watch -n 5 'ls -la .maf/logs/ || echo \"No logs yet\"'"
            
            # Window 3: Git status
            tmux new-window -t "$session_name:3" -n "git" \
                -c "$TMUX_WORK_DIR" "git status && sleep 3600"
            
            # Window 4: Test runner
            tmux new-window -t "$session_name:4" -n "test" \
                -c "$TMUX_WORK_DIR" "npm run test:watch || echo 'Tests ready'"
            ;;
            
        "codex-reviewer")
            # Window 2: Code analysis
            tmux new-window -t "$session_name:2" -n "analysis" \
                -c "$TMUX_WORK_DIR" "echo 'Code analysis window ready' && sleep 3600"
            
            # Window 3: Linting
            tmux new-window -t "$session_name:3" -n "lint" \
                -c "$TMUX_WORK_DIR" "npm run lint:all || echo 'Linting ready'"
            ;;
            
        "claude-committer")
            # Window 2: Staging area
            tmux new-window -t "$session_name:2" -n "staging" \
                -c "$TMUX_WORK_DIR" "git add -i && echo 'Staging ready'"
            
            # Window 3: Commit history
            tmux new-window -t "$session_name:3" -n "history" \
                -c "$TMUX_WORK_DIR" "git log --oneline -10 && sleep 3600"
            ;;
    esac
    
    # Return to first window
    tmux select-window -t "$session_name:1"
    
    log_tmux_success "Configured windows for session: $session_name"
    return 0
}

# List all MAF agent sessions
list_agent_sessions() {
    log_func_info "Listing MAF agent sessions"
    
    if ! is_tmux_server_running; then
        log_tmux_warning "tmux server not running"
        return 1
    fi
    
    echo "MAF Agent Sessions:"
    echo "=================="
    
    tmux list-sessions 2>/dev/null | grep "^${TMUX_SESSION_PREFIX}-" | while IFS=':' read -r session_name rest; do
        local agent_id=$(echo "$session_name" | sed "s/^${TMUX_SESSION_PREFIX}-//")
        local window_count=$(echo "$rest" | grep -o '[0-9]* windows' | cut -d' ' -f1)
        local created_date=$(echo "$rest" | grep -o '(created [^)]*)' || echo "unknown")
        
        echo "  $session_name"
        echo "    Agent ID: $agent_id"
        echo "    Windows: $window_count"
        echo "    Created: $created_date"
        echo
    done
    
    return 0
}

# Attach to an agent session
attach_to_session() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    
    log_func_info "Attaching to session: $session_name"
    
    validate_required_args "attach_to_session" "$agent_id"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi
    
    log_tmux_info "Attaching to session $session_name (use Ctrl+B, D to detach)"
    tmux attach-session -t "$session_name"
    
    return 0
}

# Send command to a specific session and window
send_command_to_session() {
    local agent_id="$1"
    local window="${2:-1}"
    local command="$3"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    
    log_func_info "Sending command to session: $session_name:$window"
    
    validate_required_args "send_command_to_session" "$agent_id" "$command"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi
    
    tmux send-keys -t "$session_name:$window" "$command" Enter
    log_tmux_success "Command sent to $session_name:$window: $command"
    
    return 0
}

# Capture output from a session window
capture_session_output() {
    local agent_id="$1"
    local window="${2:-1}"
    local lines="${3:-50}"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    
    log_func_info "Capturing output from session: $session_name:$window"
    
    validate_required_args "capture_session_output" "$agent_id"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi
    
    # Capture pane output
    tmux capture-pane -t "$session_name:$window" -p -S "-$lines"
    
    return 0
}

# Kill an agent session
kill_agent_session() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    local force="${2:-false}"
    
    log_func_info "Killing session: $session_name (force: $force)"
    
    validate_required_args "kill_agent_session" "$agent_id"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_warning "Session $session_name not found"
        return 1
    fi
    
    if [[ "$force" == "true" ]]; then
        tmux kill-session -t "$session_name"
    else
        # Try graceful shutdown first
        send_command_to_session "$agent_id" "1" "exit"
        sleep 2
        
        # Check if session still exists
        if tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
            log_tmux_warning "Graceful shutdown failed, forcing session kill"
            tmux kill-session -t "$session_name"
        fi
    fi
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_success "Session killed: $session_name"
    else
        log_tmux_error "Failed to kill session: $session_name"
        return 1
    fi
    
    return 0
}

# Cleanup all MAF sessions
cleanup_all_sessions() {
    local force="${1:-false}"
    
    log_func_info "Cleaning up all MAF sessions (force: $force)"
    
    if ! is_tmux_server_running; then
        log_tmux_warning "tmux server not running"
        return 0
    fi
    
    local sessions_to_kill
    sessions_to_kill=$(tmux list-sessions 2>/dev/null | grep "^${TMUX_SESSION_PREFIX}-" | cut -d':' -f1)
    
    if [[ -z "$sessions_to_kill" ]]; then
        log_tmux_info "No MAF sessions to clean up"
        return 0
    fi
    
    echo "$sessions_to_kill" | while read -r session_name; do
        local agent_id=$(echo "$session_name" | sed "s/^${TMUX_SESSION_PREFIX}-//")
        kill_agent_session "$agent_id" "$force" || true
    done
    
    return 0
}

# Get session status information
get_session_status() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    
    log_func_info "Getting status for session: $session_name"
    
    validate_required_args "get_session_status" "$agent_id"
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "not_found"
        return 1
    fi
    
    # Get session details
    local session_info
    session_info=$(tmux list-sessions 2>/dev/null | grep "^$session_name:")
    
    # Extract window count and creation info
    local windows=$(echo "$session_info" | grep -o '[0-9]* windows' | cut -d' ' -f1 || echo "0")
    local created=$(echo "$session_info" | grep -o '(created [^)]*)' || echo "unknown")
    
    echo "running|$windows|$created"
    return 0
}

# Validate session exists and is accessible
validate_session() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    
    log_func_info "Validating session: $session_name"
    
    validate_required_args "validate_session" "$agent_id"
    
    if ! is_tmux_server_running; then
        handle_error "TMUX_SERVER_NOT_RUNNING" "tmux server is not running" 1
    fi
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        handle_error "SESSION_NOT_FOUND" "Session $session_name not found" 1
    fi
    
    return 0
}

# Auto-discover and initialize tmux environment
initialize_tmux_environment() {
    log_func_info "Initializing tmux environment for MAF"
    
    # Step 1: Validate installation
    validate_tmux_installation
    
    # Step 2: Create configuration
    create_tmux_config
    
    # Step 3: Start server
    ensure_tmux_server
    
    # Step 4: Create base session if needed
    if ! tmux list-sessions 2>/dev/null | grep -q "^$TMUX_BASE_SESSION:"; then
        tmux new-session -d -s "$TMUX_BASE_SESSION" -c "$TMUX_WORK_DIR" \
            "echo 'MAF Base Session Ready' && sleep 3600"
        log_tmux_success "Created base session: $TMUX_BASE_SESSION"
    fi
    
    log_tmux_success "tmux environment initialized successfully"
    return 0
}

# SESSION STATE DETECTION FUNCTIONS (Supervisor Phase 2)

# Function to capture last line of each pane in a session
capture_session_last_lines() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"
    local window="${2:-1}"

    log_func_info "Capturing last lines from session: $session_name:$window"

    validate_required_args "capture_session_last_lines" "$agent_id"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi

    # Capture last 3 lines from each pane in the window
    local panes_output
    panes_output=$(tmux list-panes -t "$session_name:$window" 2>/dev/null || echo "")

    if [[ -z "$panes_output" ]]; then
        echo "no_panes"
        return 1
    fi

    echo "$panes_output" | while IFS= read -r pane_line; do
        local pane_id=$(echo "$pane_line" | cut -d':' -f1)
        local pane_info=$(echo "$pane_line" | cut -d' ' -f2-)

        echo "=== PANE $pane_id ==="
        # Capture last 3 lines from this pane
        tmux capture-pane -t "$session_name:$window.$pane_id" -p -S "-3" 2>/dev/null || echo "capture_failed"
        echo ""
    done

    return 0
}

# Function to detect if agent is at prompt (idle)
is_agent_at_prompt() {
    local session_name="$1"
    local window="${2:-1}"

    log_func_info "Checking if agent at prompt: $session_name:$window"

    validate_required_args "is_agent_at_prompt" "$session_name"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "session_not_found"
        return 1
    fi

    # Get the current line content from pane 0 (main pane)
    local current_line
    current_line=$(tmux capture-pane -t "$session_name:$window.0" -p 2>/dev/null | tail -1 || echo "")

    # Check for prompt patterns (common shell prompts)
    local prompt_patterns=(
        "^\$ "           # Bash $
        "^# "           # Bash root #
        "^% "           # Zsh %
        "^> "           # PowerShell >
        "^❯ "           # Starship/Oh My Zsh
        "^➜ "           # Oh My Zsh arrow
        "^.*@.*:.*[$%] " # user@host:path$ format
        "^.*\[\].*[$%] " # [path]$ format
    )

    for pattern in "${prompt_patterns[@]}"; do
        if [[ "$current_line" =~ $pattern ]]; then
            echo "at_prompt"
            return 0
        fi
    done

    # Additional checks for agent-specific states
    if [[ "$current_line" =~ "npm run" ]]; then
        echo "running_npm"
        return 1
    elif [[ "$current_line" =~ "npx" ]] || [[ "$current_line" =~ "node" ]]; then
        echo "running_node"
        return 1
    elif [[ "$current_line" =~ "bash" ]] || [[ "$current_line" =~ "sh" ]]; then
        echo "running_shell"
        return 1
    fi

    echo "not_at_prompt"
    return 1
}

# Function to get current command running in session
get_session_current_command() {
    local session_name="$1"
    local window="${2:-1}"

    log_func_info "Getting current command from session: $session_name:$window"

    validate_required_args "get_session_current_command" "$session_name"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "session_not_found"
        return 1
    fi

    # Get pane information
    local pane_info
    pane_info=$(tmux display-message -t "$session_name:$window.0" -p '#{pane_current_command}' 2>/dev/null || echo "unknown")

    echo "$pane_info"
    return 0
}

# Function to check session responsiveness
check_session_responsiveness() {
    local session_name="$1"

    log_func_info "Checking session responsiveness: $session_name"

    validate_required_args "check_session_responsiveness" "$session_name"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "session_not_found"
        return 1
    fi

    # Try to send a harmless command and check if we get a response
    local start_time=$(date +%s%N 2>/dev/null || date +%s)

    # Send Ctrl+L (clear screen) and check if session responds
    tmux send-keys -t "$session_name:1.0" "C-l" 2>/dev/null || {
        echo "unresponsive"
        return 1
    }

    # Small delay and check if we can still capture output
    sleep 0.1

    local end_time=$(date +%s%N 2>/dev/null || date +%s)
    local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

    # Try to capture a line to verify session is responsive
    if tmux capture-pane -t "$session_name:1.0" -p -S "-1" >/dev/null 2>&1; then
        echo "responsive|$response_time"
        return 0
    else
        echo "unresponsive|$response_time"
        return 1
    fi
}

# SESSION MANAGEMENT FUNCTIONS (Supervisor Phase 2)

# Function to close and recreate a specific agent pane
restart_agent_pane() {
    local agent_id="$1"
    local window="${2:-1}"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"

    log_func_info "Restarting agent pane: $session_name:$window"

    validate_required_args "restart_agent_pane" "$agent_id"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi

    # Get the current agent type from session or infer
    local agent_type="claude-worker"
    local session_info=$(tmux list-sessions 2>/dev/null | grep "^$session_name:")

    if [[ "$session_info" =~ "worker" ]]; then
        agent_type="claude-worker"
    elif [[ "$session_info" =~ "reviewer" ]]; then
        agent_type="codex-reviewer"
    elif [[ "$session_info" =~ "committer" ]]; then
        agent_type="claude-committer"
    fi

    # Kill the target window
    tmux kill-window -t "$session_name:$window" 2>/dev/null || true

    # Recreate the window based on agent type
    case "$agent_type" in
        "claude-worker")
            tmux new-window -t "$session_name:$window" -n "workspace" \
                -c "$TMUX_WORK_DIR" "echo 'Claude Worker Environment Restarted' && npm run maf:claim-task"
            ;;
        "codex-reviewer")
            tmux new-window -t "$session_name:$window" -n "review" \
                -c "$TMUX_WORK_DIR" "echo 'CodeX Reviewer Environment Restarted' && npm run test:coverage"
            ;;
        "claude-committer")
            tmux new-window -t "$session_name:$window" -n "commit" \
                -c "$TMUX_WORK_DIR" "echo 'Claude Committer Environment Restarted' && git status"
            ;;
        *)
            tmux new-window -t "$session_name:$window" -n "workspace" \
                -c "$TMUX_WORK_DIR" "echo 'Agent $agent_id Environment Restarted' && bash"
            ;;
    esac

    log_tmux_success "Restarted pane: $session_name:$window"
    return 0
}

# Function to gracefully restart an agent session
restart_agent_session() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"

    log_func_info "Restarting agent session: $session_name"

    validate_required_args "restart_agent_session" "$agent_id"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi

    # Get current session configuration before killing
    local agent_type="claude-worker"
    local session_info=$(tmux list-sessions 2>/dev/null | grep "^$session_name:")

    if [[ "$session_info" =~ "worker" ]]; then
        agent_type="claude-worker"
    elif [[ "$session_info" =~ "reviewer" ]]; then
        agent_type="codex-reviewer"
    elif [[ "$session_info" =~ "committer" ]]; then
        agent_type="claude-committer"
    fi

    # Kill the old session
    tmux kill-session -t "$session_name" 2>/dev/null || true
    sleep 1

    # Create new session with the same configuration
    if ! create_agent_session "$agent_id" "$agent_type"; then
        log_tmux_error "Failed to recreate session: $session_name"
        return 1
    fi

    log_tmux_success "Restarted session: $session_name"
    return 0
}

# Function to send nudge to agent (wakeup signal)
send_agent_nudge() {
    local agent_id="$1"
    local window="${2:-1}"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"

    log_func_info "Sending nudge to agent: $session_name:$window"

    validate_required_args "send_agent_nudge" "$agent_id"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_tmux_error "Session $session_name not found"
        return 1
    fi

    # Send Ctrl+C to interrupt any hanging process
    tmux send-keys -t "$session_name:$window.0" "C-c" 2>/dev/null || true

    # Small delay
    sleep 0.5

    # Send Enter to get to prompt
    tmux send-keys -t "$session_name:$window.0" Enter 2>/dev/null || true

    # Send a wake up message
    tmux send-keys -t "$session_name:$window.0" "echo '🔔 Agent wakeup signal received'" Enter 2>/dev/null || true

    log_tmux_success "Sent nudge to agent: $session_name:$window"
    return 0
}

# Function to get detailed session state for supervisor
get_supervisor_session_state() {
    local agent_id="$1"
    local session_name="${TMUX_SESSION_PREFIX}-${agent_id}"

    log_func_info "Getting supervisor session state: $session_name"

    validate_required_args "get_supervisor_session_state" "$agent_id"

    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo "not_found"
        return 1
    fi

    # Get session info
    local session_info=$(tmux list-sessions 2>/dev/null | grep "^$session_name:")
    local windows=$(echo "$session_info" | grep -o '[0-9]* windows' | cut -d' ' -f1 || echo "0")

    # Check if agent is at prompt
    local prompt_status=$(is_agent_at_prompt "$session_name" 1)

    # Get current command
    local current_command=$(get_session_current_command "$session_name" 1)

    # Check responsiveness
    local responsiveness=$(check_session_responsiveness "$session_name")

    # Determine task state
    local task_state="unknown"
    if [[ "$prompt_status" == "at_prompt" ]]; then
        task_state="idle"
    elif [[ "$current_command" != "unknown" && "$current_command" != "bash" && "$current_command" != "zsh" ]]; then
        task_state="working"
    else
        task_state="blocked"
    fi

    # Output structured state
    echo "found|$windows|$prompt_status|$current_command|$responsiveness|$task_state"
    return 0
}

# Main execution block for standalone usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Simple CLI interface for testing
    case "${1:-}" in
        "init")
            initialize_tmux_environment
            ;;
        "list")
            list_agent_sessions
            ;;
        "validate")
            validate_tmux_installation
            ;;
        "state")
            if [[ -z "${2:-}" ]]; then
                echo "Error: Agent ID required for state command"
                echo "Usage: $0 state <agent-id>"
                exit 1
            fi
            get_supervisor_session_state "$2"
            ;;
        "prompt")
            if [[ -z "${2:-}" ]]; then
                echo "Error: Session name required for prompt command"
                echo "Usage: $0 prompt <session-name>"
                exit 1
            fi
            is_agent_at_prompt "$2" "${3:-1}"
            ;;
        "restart-pane")
            if [[ -z "${2:-}" ]]; then
                echo "Error: Agent ID required for restart-pane command"
                echo "Usage: $0 restart-pane <agent-id> [window]"
                exit 1
            fi
            restart_agent_pane "$2" "${3:-1}"
            ;;
        "restart-session")
            if [[ -z "${2:-}" ]]; then
                echo "Error: Agent ID required for restart-session command"
                echo "Usage: $0 restart-session <agent-id>"
                exit 1
            fi
            restart_agent_session "$2"
            ;;
        "nudge")
            if [[ -z "${2:-}" ]]; then
                echo "Error: Agent ID required for nudge command"
                echo "Usage: $0 nudge <agent-id> [window]"
                exit 1
            fi
            send_agent_nudge "$2" "${3:-1}"
            ;;
        *)
            echo "Usage: $0 {init|list|validate|state|prompt|restart-pane|restart-session|nudge}"
            echo "  init           - Initialize tmux environment"
            echo "  list           - List MAF agent sessions"
            echo "  validate       - Validate tmux installation"
            echo "  state <id>     - Get detailed session state for supervisor"
            echo "  prompt <name>  - Check if agent is at prompt"
            echo "  restart-pane <id> [window] - Restart specific agent pane"
            echo "  restart-session <id> - Restart entire agent session"
            echo "  nudge <id> [window] - Send wakeup signal to agent"
            exit 1
            ;;
    esac
fi
