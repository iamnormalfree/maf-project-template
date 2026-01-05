#!/bin/bash
# Claude CLI Command Execution Fix
# Solves the issue where commands get stuck in Claude CLI input buffer

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect if a tmux session is in Claude CLI mode
is_claude_cli_mode() {
    local session=$1
    local pane=$2

    # Look for Claude CLI indicators
    local content=$(tmux capture-pane -t "${session}:${pane}" -p 2>/dev/null || echo "")

    if echo "$content" | grep -q -E "(Claude>|Use Enter to run.*Alt-Enter|Ctrl-G to edit|ctrl-g to edit)" || \
       echo "$content" | grep -q -E "^[^$#]*Claude.*>$" || \
       echo "$content" | tail -5 | grep -q -E "(Claude>|ctrl-g)"; then
        return 0
    fi

    return 1
}

# Detect if commands are stuck in Vim/Vi mode
is_in_vim_mode() {
    local session=$1
    local pane=$2

    local content=$(tmux capture-pane -t "${session}:${pane}" -p 2>/dev/null || echo "")

    # Check for Vim indicators
    if echo "$content" | grep -q -E "^(INSERT|VISUAL|REPLACE)" || \
       echo "$content" | grep -q -E "^[^$#]*\%$" || \
       echo "$content" | tail -3 | grep -q -E "(INSERT|VISUAL|\%)"; then
        return 0
    fi

    return 1
}

# Clear stuck commands and exit Claude CLI/Vim modes
clear_stuck_commands() {
    local session=$1
    local pane=$2

    log_info "Clearing stuck commands in ${session}:${pane}"

    # Try to exit Vim/Vi mode first
    if is_in_vim_mode "$session" "$pane"; then
        log_info "Detected Vim mode, exiting..."
        tmux send-keys -t "${session}:${pane}" "Escape" "Escape" "Escape"
        sleep 0.5
        tmux send-keys -t "${session}:${pane}" ":q!" "Enter"
        sleep 0.5
    fi

    # Clear any existing commands
    tmux send-keys -t "${session}:${pane}" "C-c" "C-c" "C-c"
    sleep 0.5

    # If in Claude CLI mode, exit to shell
    if is_claude_cli_mode "$session" "$pane"; then
        log_info "Detected Claude CLI mode, exiting to shell..."
        tmux send-keys -t "${session}:${pane}" "C-c"
        sleep 0.5
        tmux send-keys -t "${session}:${pane}" "C-d"
        sleep 1

        # Still in Claude CLI? Try another approach
        if is_claude_cli_mode "$session" "$pane"; then
            log_warning "Still in Claude CLI, trying alternative exit..."
            tmux send-keys -t "${session}:${pane}" "C-c"
            sleep 0.5
            tmux send-keys -t "${session}:${pane}" "/exit" "Enter"
            sleep 1
        fi
    fi

    # Final clear and ensure we're at a shell prompt
    tmux send-keys -t "${session}:${pane}" "C-c" "clear" "Enter"
    sleep 0.5

    # Verify we're at a shell prompt (look for $ or #)
    local content=$(tmux capture-pane -t "${session}:${pane}" -p | tail -1)
    if echo "$content" | grep -q -E "^\$|^#"; then
        log_success "Successfully cleared commands and at shell prompt"
        return 0
    else
        log_error "Failed to reach shell prompt"
        return 1
    fi
}

# Enhanced command sending with verification
send_command_to_session_safe() {
    local session=$1
    local pane=$2
    local command=$3
    local wait_time=${4:-5}

    log_info "Sending command to ${session}:${pane}: $command"

    # First, clear any stuck commands
    clear_stuck_commands "$session" "$pane"

    # Send the command
    tmux send-keys -t "${session}:${pane}" "$command" "Enter"

    # Wait for command to complete
    log_info "Waiting ${wait_time}s for command completion..."
    sleep "$wait_time"

    # Verify command executed (check for prompt return)
    local content=$(tmux capture-pane -t "${session}:${pane}" -p | tail -1)
    if echo "$content" | grep -q -E "^\$|^#"; then
        log_success "Command executed successfully"
        return 0
    else
        log_warning "Command may still be running or stuck"
        return 1
    fi
}

# Fix all MAF sessions
fix_existing_sessions() {
    log_info "Fixing all MAF tmux sessions..."

    local sessions=("maf-5pane" "maf-session" "maf-coordination")

    for session in "${sessions[@]}"; do
        if tmux has-session -t "$session" 2>/dev/null; then
            log_info "Processing session: $session"

            # Get all panes in the session
            local panes=$(tmux list-panes -t "$session" -F "#{pane_id}" | sed 's/%//')

            for pane_num in $panes; do
                log_info "Fixing pane $pane_num..."
                clear_stuck_commands "$session" "$pane_num"
            done

            log_success "Fixed session: $session"
        else
            log_warning "Session $session not found"
        fi
    done
}

# Test command execution
test_command_execution() {
    local session=$1
    local pane=$2

    log_info "Testing command execution in ${session}:${pane}"

    # Send a simple test command
    send_command_to_session_safe "$session" "$pane" "echo 'Command test successful'" 2

    # Check if the output appeared
    local content=$(tmux capture-pane -t "${session}:${pane}" -p)
    if echo "$content" | grep -q "Command test successful"; then
        log_success "Command execution test PASSED"
        return 0
    else
        log_error "Command execution test FAILED"
        return 1
    fi
}

# Run diagnostics
run_diagnostics() {
    log_info "Running tmux environment diagnostics..."

    local sessions=("maf-5pane" "maf-session" "maf-coordination")
    local total_issues=0

    for session in "${sessions[@]}"; do
        if tmux has-session -t "$session" 2>/dev/null; then
            echo ""
            log_info "=== Session: $session ==="

            local panes=$(tmux list-panes -t "$session" -F "#{pane_id}" | sed 's/%//')

            for pane_num in $panes; do
                echo -n "  Pane $pane_num: "

                if is_claude_cli_mode "$session" "$pane_num"; then
                    echo -e "${RED}Claude CLI mode (commands won't execute)${NC}"
                    ((total_issues++))
                elif is_in_vim_mode "$session" "$pane_num"; then
                    echo -e "${RED}Vim mode (needs exit)${NC}"
                    ((total_issues++))
                else
                    echo -e "${GREEN}Shell mode (OK)${NC}"
                fi
            done
        fi
    done

    echo ""
    if [ $total_issues -eq 0 ]; then
        log_success "No issues detected! All sessions ready for command execution."
    else
        log_warning "Found $total_issues issue(s). Run fix_existing_sessions to resolve."
    fi

    return $total_issues
}

# Main execution
case "${1:-diagnose}" in
    "diagnose")
        run_diagnostics
        ;;
    "fix")
        fix_existing_sessions
        ;;
    "test")
        if [ -n "${2:-}" ]; then
            IFS=':' read -r session pane <<< "$2"
            test_command_execution "$session" "$pane"
        else
            log_error "Please specify session:pane for testing"
            echo "Example: $0 test maf-5pane:1"
            exit 1
        fi
        ;;
    "clear")
        if [ -n "${2:-}" ]; then
            IFS=':' read -r session pane <<< "$2"
            clear_stuck_commands "$session" "$pane"
        else
            log_error "Please specify session:pane to clear"
            echo "Example: $0 clear maf-5pane:1"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {diagnose|fix|test|clear} [session:pane]"
        echo ""
        echo "Commands:"
        echo "  diagnose    - Check all MAF sessions for issues"
        echo "  fix         - Fix all issues in MAF sessions"
        echo "  test <s:p>  - Test command execution in session:pane"
        echo "  clear <s:p> - Clear stuck commands in session:pane"
        exit 1
        ;;
esac