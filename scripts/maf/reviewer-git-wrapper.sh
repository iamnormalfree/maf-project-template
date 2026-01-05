#!/bin/bash
# Reviewer Git Guardrail - Prevents "drive-by fixes" by blocking write operations
# This is the primary wrapper for git commands in the reviewer role
#
# Usage (sourced from .bashrc or called directly):
#   reviewer-git-wrapper.sh git commit -m "message"
#   reviewer-git-wrapper.sh git push
#   reviewer-git-wrapper.sh git add .
#
# Blocked commands for reviewer:
# - git commit (write operation)
# - git push (write operation)
# - git merge (write operation)
# - git rebase (rewrite operation)
# - git reset --hard (destructive)
# - git clean -fd (destructive)
# - git am (apply patches)
# - git cherry-pick (write operation)
#
# Allowed commands for reviewer:
# - git status (read-only)
# - git diff (read-only)
# - git log (read-only)
# - git show (read-only)
# - git blame (read-only)
# - git checkout (switch branches, read-only context)
# - git branch (read-only)
# - git fetch (update local refs, no local write)
# - git pull (allowed ONLY with --ff-only or --no-commit)
# - git test/read operations

set -e

# ANSI colors for error message
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Commands that are ALWAYS blocked for reviewer
BLOCKED_COMMANDS=(
    "commit"
    "push"
    "merge"
    "rebase"
    "am"
    "cherry-pick"
)

# Commands that are blocked with specific flags
BLOCKED_FLAG_PATTERNS=(
    "reset --hard"
    "clean -fd"
    "clean -f"
    "clean -d"
    "clean -fxd"
)

# Commands that require special handling (may be allowed with specific flags)
RESTRICTED_COMMANDS=(
    "pull"
)

# Check if this is being run in the reviewer pane
# Reviewer is pane 1 (bottom) in maf-cli:agents window
check_reviewer_context() {
    local current_pane="${TMUX_PANE:-}"

    # Try to detect if we're in the reviewer pane
    if [ -n "$current_pane" ]; then
        # Get pane index from tmux
        local pane_index=$(tmux display -p -t "$current_pane" "#{pane_index}" 2>/dev/null || echo "")
        local window_name=$(tmux display -p -t "$current_pane" "#{window_name}" 2>/dev/null || echo "")

        # Check if we're in pane 1 of agents window (reviewer's pane)
        if [ "$window_name" = "agents" ] && [ "$pane_index" = "1" ]; then
            return 0  # We are in reviewer pane
        fi
    fi

    # Environment variable override (for testing)
    if [ "${MAF_ROLE:-}" = "reviewer" ] || [ "${MAF_ROLE:-}" = "BlackDog" ]; then
        return 0  # Explicitly set as reviewer
    fi

    return 1  # Not in reviewer context
}

# Show error message for blocked commands
show_blocked_error() {
    local cmd="$1"
    local reason="${2:-write operation}"

    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}⚠️  REVIEWER GUARDRAIL: Command blocked${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Command blocked:${NC} git ${cmd}"
    echo -e "${YELLOW}Reason:${NC} Reviewer role cannot perform ${reason}"
    echo ""
    echo -e "${GREEN}Reviewer responsibilities:${NC}"
    echo "  ✓ Review code changes with git diff"
    echo "  ✓ Check status with git status"
    echo "  ✓ Run tests and verify receipts"
    echo "  ✓ Provide feedback via Agent Mail"
    echo "  ✓ Approve or reopen beads"
    echo ""
    echo -e "${RED}Reviewer CANNOT:${NC}"
    echo "  ✗ Commit changes (use bd close to approve)"
    echo "  ✗ Push to repository (supervisor handles this)"
    echo "  ✗ Make direct edits to implementation files"
    echo "  ✗ Perform merge/rebase operations"
    echo ""
    echo -e "${YELLOW}If you need to suggest implementation changes:${NC}"
    echo "  1. Send feedback via Agent Mail to implementor"
    echo "  2. Reopen bead with specific feedback"
    echo "  3. Let implementor make the changes"
    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Show warning for restricted commands
show_restricted_warning() {
    local cmd="$1"
    local allowed_flags="$2"

    echo ""
    echo -e "${YELLOW}⚠️  REVIEWER GUARDRAIL: Restricted command${NC}"
    echo ""
    echo -e "Command:${NC} git ${cmd}"
    echo -e "${YELLOW}Restriction:${NC} This command may write to repository"
    echo ""
    if [ -n "$allowed_flags" ]; then
        echo -e "${GREEN}Allowed with:${NC} ${allowed_flags}"
    fi
    echo ""
    echo -e "${YELLOW}Continue anyway?${NC} This is unusual for reviewer role."
    echo ""
}

# Check if command is in blocked list
is_blocked_command() {
    local cmd="$1"
    for blocked in "${BLOCKED_COMMANDS[@]}"; do
        if [ "$cmd" = "$blocked" ]; then
            return 0  # Is blocked
        fi
    done
    return 1  # Not blocked
}

# Check if command matches blocked flag pattern
has_blocked_flags() {
    local cmdline="$*"
    for pattern in "${BLOCKED_FLAG_PATTERNS[@]}"; do
        if [[ "$cmdline" == *"$pattern"* ]]; then
            return 0  # Has blocked flags
        fi
    done
    return 1  # No blocked flags
}

# Check if command is restricted (may be allowed with specific flags)
is_restricted_command() {
    local cmd="$1"
    for restricted in "${RESTRICTED_COMMANDS[@]}"; do
        if [ "$cmd" = "$restricted" ]; then
            return 0  # Is restricted
        fi
    done
    return 1  # Not restricted
}

# Main guardrail logic
main() {
    # If not in reviewer context, pass through to git
    if ! check_reviewer_context; then
        git "$@"
        exit $?
    fi

    # We are in reviewer context - enforce guardrails
    local git_command="$1"

    # Check for completely blocked commands
    if is_blocked_command "$git_command"; then
        show_blocked_error "$git_command" "write operations"
        exit 1
    fi

    # Check for blocked flag patterns
    if has_blocked_flags "$*"; then
        show_blocked_error "$*" "destructive operations"
        exit 1
    fi

    # Check for restricted commands
    if is_restricted_command "$git_command"; then
        case "$git_command" in
            pull)
                # git pull is allowed ONLY with --ff-only or --no-commit
                if [[ "$*" == *"--ff-only"* ]] || [[ "$*" == *"--no-commit"* ]]; then
                    # Safe - read-only fetch or no-commit preview
                    git "$@"
                    exit $?
                else
                    show_blocked_error "pull" "use 'git pull --ff-only' or 'git fetch' instead"
                    echo ""
                    echo -e "${GREEN}Alternative:${NC} git fetch origin (read-only update)"
                    exit 1
                fi
                ;;
        esac
    fi

    # Command is allowed - pass through to git
    git "$@"
    exit $?
}

# Run main logic
main "$@"
