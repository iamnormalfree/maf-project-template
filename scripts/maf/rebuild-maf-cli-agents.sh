#!/bin/bash
# ABOUTME: Rebuild script for maf-cli:agents tmux session with mixed Codex/Claude mode
# ABOUTME: Restores 4-pane layout with correct roles: Supervisor(Codex), Reviewer(Codex), Imp-1(Claude), Imp-2(Claude)
# COMPLETION_DRIVE: Implements roundtable-2kt.3 based on synthesis blueprint
# LCL: maf_mode::mixed_codex_supervisor_claude_implementors
# LCL: framework_hierarchy::ra_primary_mandatory_sp_advisory
# LCL: rebuild_strategy::tmux_session_restore

set -euo pipefail

# #PARADIGM_CLASH_CHECK: This script destroys and recreates the session, preserving agent state via Memlayer
# DETAIL_DRIFT_GUARD: Focus ONLY on session rebuild. No context manager, no monitoring, no agent prompts.

# Configuration
SESSION_NAME="maf-cli"
WINDOW_NAME="agents"
FULL_TARGET="${SESSION_NAME}:${WINDOW_NAME}"
PROJECT_ROOT="/root/projects/roundtable"
TOPOLOGY_FILE="${PROJECT_ROOT}/.maf/config/agent-topology.json"

# Agent commands by role
# COMPLETION_DRIVE: Pane 0 (top) = Supervisor (GreenMountain) - Codex
# COMPLETION_DRIVE: Pane 1 (bottom) = Reviewer (BlackDog) - Codex  
# COMPLETION_DRIVE: Pane 2 = Implementor-1 (OrangePond) - Claude
# COMPLETION_DRIVE: Pane 3 = Implementor-2 (FuchsiaCreek) - Claude

# Default commands (can be overridden via environment)
SUPERVISOR_CMD="${MAF_SUPERVISOR_CMD:-codex}"
REVIEWER_CMD="${MAF_REVIEWER_CMD:-codex}"
IMPLEMENTOR_CMD="${MAF_IMPLEMENTOR_CMD:-claude --settings ${PROJECT_ROOT}/.claude}"

# Memory script for state preservation
MEMORY_SCRIPT="${PROJECT_ROOT}/scripts/maf/agent-memory.sh"
AGENT_MAIL_FETCH_SCRIPT="${PROJECT_ROOT}/scripts/maf/agent-mail-fetch.sh"

# Worktree support
WORKTREES_FILE="${PROJECT_ROOT}/.maf/worktrees.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Usage
show_usage() {
    cat << EOF
Usage: $0 [--force]

Rebuild the maf-cli:agents tmux session with correct 4-pane layout and roles.

OPTIONS:
  --force    Kill existing session before rebuilding (default: prompt)
  -h, --help Show this help

LAYOUT (4-pane):
┌────────┬────────┬────────┐
│ 0.top  │   2    │   3    │  Supervisor(top) | Imp-1 | Imp-2
│        │        │        │
│0.bottom│        │        │  Reviewer(bottom)
└────────┴────────┴────────┘

ROLES:
  Pane 0 (top):    Supervisor (GreenMountain) - Codex
  Pane 1 (bottom): Reviewer (BlackDog) - Codex
  Pane 2:          Implementor-1 (OrangePond) - Claude
  Pane 3:          Implementor-2 (FuchsiaCreek) - Claude

ENVIRONMENT VARIABLES:
  MAF_SUPERVISOR_CMD    Command for Supervisor (default: codex)
  MAF_REVIEWER_CMD      Command for Reviewer (default: codex)
  MAF_IMPLEMENTOR_CMD   Command for Implementors (default: claude --settings ...)

EXAMPLES:
  $0              # Rebuild with confirmation
  $0 --force      # Rebuild without confirmation
EOF
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check tmux
    if ! command -v tmux >/dev/null 2>&1; then
        log_error "tmux not found. Please install tmux."
        exit 1
    fi
    
    # Check topology config
    if [[ ! -f "$TOPOLOGY_FILE" ]]; then
        log_error "Topology config not found: $TOPOLOGY_FILE"
        exit 1
    fi
    
    # Check project root
    if [[ ! -d "$PROJECT_ROOT" ]]; then
        log_error "Project root not found: $PROJECT_ROOT"
        exit 1
    fi
    
    log_info "Prerequisites OK"
}

# Get worktree path for pane (if configured)
get_worktree_path() {
    local pane_index="$1"
    
    if [[ -f "$TOPOLOGY_FILE" ]]; then
        jq -r ".worktrees[\"$pane_index\"].path // empty" "$TOPOLOGY_FILE" 2>/dev/null
    fi
}

# Save agent state before destroying session
save_agent_states() {
    log_info "Saving agent states..."
    
    local session_exists=false
    if tmux has-session -t "$FULL_TARGET" 2>/dev/null; then
        session_exists=true
    fi
    
    if [[ "$session_exists" == "true" ]]; then
        # Save state via Memlayer if available
        if [[ -x "$MEMORY_SCRIPT" ]]; then
            log_info "Memlayer integration available, saving context..."
            
            # Save each pane's state
            for pane_idx in 0 1 2 3; do
                local pane="${FULL_TARGET}.${pane_idx}"
                if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
                    local context
                    context=$(tmux capture-pane -t "$pane" -p -S -2000 2>/dev/null || echo "")
                    if [[ -n "$context" ]]; then
                        # Determine agent name
                        local agent_name="agent_${pane_idx}"
                        case "$pane_idx" in
                            0) agent_name="GreenMountain" ;;
                            1) agent_name="BlackDog" ;;
                            2) agent_name="OrangePond" ;;
                            3) agent_name="FuchsiaCreek" ;;
                        esac
                        
                        export AGENT_NAME="$agent_name"
                        printf '%s' "$context" | timeout 30s "$MEMORY_SCRIPT" store >/dev/null 2>&1 || true
                        log_info "  Saved context for $agent_name"
                    fi
                fi
            done
        else
            log_warn "Memlayer script not found, skipping state preservation"
        fi
    else
        log_info "No existing session to save from"
    fi
}

# Kill existing session
kill_session() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_info "Killing existing session: $SESSION_NAME"
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
        sleep 1
    else
        log_info "No existing session to kill"
    fi
}

# Create new session with 4-pane layout
create_session() {
    log_info "Creating new session: $FULL_TARGET"
    
    # Kill any existing session first
    kill_session
    
    # Create session in detached mode
    tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" -c "$PROJECT_ROOT"
    
    # Create 4-pane layout: 3 columns, left column split vertically
    # Split into 3 panes horizontally
    tmux split-window -h -t "$FULL_TARGET" -c "$PROJECT_ROOT"
    tmux split-window -h -t "$FULL_TARGET" -c "$PROJECT_ROOT"
    
    # Split left pane (pane 0) vertically
    tmux select-pane -t "$FULL_TARGET.0"
    tmux split-window -v -t "$FULL_TARGET" -c "$PROJECT_ROOT"
    
    # Verify layout
    log_info "Verifying 4-pane layout..."
    local pane_count
    pane_count=$(tmux display-message -t "$FULL_TARGET" -p '#{window_panes}')
    
    if [[ "$pane_count" != "4" ]]; then
        log_error "Failed to create 4-pane layout (got $pane_count panes)"
        exit 1
    fi
    
    log_info "4-pane layout created successfully"
}

# Start agent in pane
start_agent() {
    local pane_index="$1"
    local agent_name="$2"
    local agent_cmd="$3"
    local pane="${FULL_TARGET}.${pane_index}"
    
    log_info "Starting $agent_name in pane $pane_index..."
    
    # Check for worktree
    local worktree_path
    worktree_path=$(get_worktree_path "$pane_index")
    
    if [[ -n "$worktree_path" && -d "$worktree_path" ]]; then
        log_info "  Using worktree: $worktree_path"
        tmux send-keys -t "$pane" -l "cd '$worktree_path' && pwd"
        tmux send-keys -t "$pane" Enter
        sleep 0.5
        
        # Start agent in worktree
        tmux send-keys -t "$pane" -l "$agent_cmd"
        tmux send-keys -t "$pane" Enter
    else
        # Start agent in project root
        tmux send-keys -t "$pane" -l "$agent_cmd"
        tmux send-keys -t "$pane" Enter
    fi
    
    # Wait for agent to initialize
    sleep 2
}

# Restore agent state
restore_agent_state() {
    local pane_index="$1"
    local agent_name="$2"
    local pane="${FULL_TARGET}.${pane_index}"
    
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        log_info "Restoring state for $agent_name..."
        
        export AGENT_NAME="$agent_name"
        
        # Send restore command
        tmux send-keys -t "$pane" -l "$MEMORY_SCRIPT restore"
        tmux send-keys -t "$pane" Enter
        sleep 1
        
        # Fetch unread Agent Mail messages
        if [[ -x "$AGENT_MAIL_FETCH_SCRIPT" ]]; then
            tmux send-keys -t "$pane" -l "$AGENT_MAIL_FETCH_SCRIPT '$agent_name'"
            tmux send-keys -t "$pane" Enter
            sleep 0.8
        fi
        
        # Show ready work
        tmux send-keys -t "$pane" -l "bd ready --json | head -5"
        tmux send-keys -t "$pane" Enter
        sleep 0.5
    fi
}

# Configure all agents
configure_agents() {
    log_info "Configuring agents..."
    
    # Pane 0 (top): Supervisor (GreenMountain) - Codex
    start_agent 0 "GreenMountain" "$SUPERVISOR_CMD"
    restore_agent_state 0 "GreenMountain"
    
    # Pane 1 (bottom): Reviewer (BlackDog) - Codex
    start_agent 1 "BlackDog" "$REVIEWER_CMD"
    restore_agent_state 1 "BlackDog"
    
    # Pane 2: Implementor-1 (OrangePond) - Claude
    start_agent 2 "OrangePond" "$IMPLEMENTOR_CMD"
    restore_agent_state 2 "OrangePond"
    
    # Pane 3: Implementor-2 (FuchsiaCreek) - Claude
    start_agent 3 "FuchsiaCreek" "$IMPLEMENTOR_CMD"
    restore_agent_state 3 "FuchsiaCreek"
    
    log_info "All agents configured"
}

# Show session summary
show_summary() {
    log_info "Session rebuild complete!"
    echo ""
    echo "Session: $FULL_TARGET"
    echo "Layout: 4-pane (3 columns, left split vertically)"
    echo ""
    echo "Panes:"
    echo "  0 (top-left):    GreenMountain (Supervisor) - $SUPERVISOR_CMD"
    echo "  1 (bottom-left): BlackDog (Reviewer) - $REVIEWER_CMD"
    echo "  2 (top-right):   OrangePond (Implementor-1) - $IMPLEMENTOR_CMD"
    echo "  3 (bottom-right): FuchsiaCreek (Implementor-2) - $IMPLEMENTOR_CMD"
    echo ""
    echo "Attach: tmux attach -t $FULL_TARGET"
    echo ""
    
    # Show pane details
    if tmux has-session -t "$FULL_TARGET" 2>/dev/null; then
        echo "Current pane status:"
        tmux list-panes -t "$FULL_TARGET" -F '  #{pane_index}: #{pane_width}x#{pane_height} #{pane_current_command} (pid: #{pane_pid})'
    fi
}

# Main
main() {
    local force=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                force=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Check if session exists
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        if [[ "$force" == "true" ]]; then
            log_warn "Force flag set, proceeding with rebuild"
        else
            echo ""
            echo -e "${YELLOW}WARNING: This will destroy and recreate the tmux session '${SESSION_NAME}'${NC}"
            echo ""
            read -p "Continue? (y/N) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Aborted by user"
                exit 0
            fi
        fi
    fi
    
    # Execute rebuild
    check_prerequisites
    save_agent_states
    create_session
    configure_agents
    show_summary
}

main "$@"
