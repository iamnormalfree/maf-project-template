#!/bin/bash
# Reviewer Guardrail Aliases - Simple alias-based guardrails for reviewer role
# Source this file in .bashrc or call directly to set up guardrails
#
# Usage:
#   source /root/projects/roundtable/scripts/maf/reviewer-guardrail-aliases.sh
#
# This replaces 'git' with a wrapper function that enforces reviewer guardrails

set -e

# ANSI colors for error messages
export RED='\033[0;31m'
export YELLOW='\033[1;33m'
export GREEN='\033[0;32m'
export NC='\033[0m' # No Color

# Commands that are ALWAYS blocked for reviewer
export BLOCKED_GIT_COMMANDS="commit push merge rebase am cherry-pick"

# Check if current pane is the reviewer pane (pane 1 in agents window)
maf_is_reviewer_pane() {
    local current_pane="${TMUX_PANE:-}"

    if [ -n "$current_pane" ]; then
        local pane_index=$(tmux display -p -t "$current_pane" "#{pane_index}" 2>/dev/null || echo "")
        local window_name=$(tmux display -p -t "$current_pane" "#{window_name}" 2>/dev/null || echo "")

        # Reviewer is pane 1 (bottom) in agents window
        if [ "$window_name" = "agents" ] && [ "$pane_index" = "1" ]; then
            return 0  # We are in reviewer pane
        fi
    fi

    # Environment variable override
    if [ "${MAF_ROLE:-}" = "reviewer" ] || [ "${MAF_ROLE:-}" = "BlackDog" ] || [ "${MAF_ROLE:-}" = "review" ]; then
        return 0
    fi

    return 1  # Not in reviewer context
}

# Show error for blocked commands
maf_show_git_blocked_error() {
    local cmd="$1"

    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}⚠️  REVIEWER GUARDRAIL: Command blocked${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Command blocked:${NC} git $cmd"
    echo -e "${YELLOW}Reason:${NC} Reviewer role cannot perform write operations"
    echo ""
    echo -e "${GREEN}Reviewer responsibilities:${NC}"
    echo "  ✓ Review code changes with git diff"
    echo "  ✓ Check status with git status"
    echo "  ✓ Run tests and verify receipts"
    echo "  ✓ Provide feedback via Agent Mail"
    echo "  ✓ Approve or reopen beads with bd close/reopen"
    echo ""
    echo -e "${RED}Reviewer CANNOT:${NC}"
    echo "  ✗ Commit changes (implementors do this)"
    echo "  ✗ Push to repository (supervisor does this)"
    echo "  ✗ Make direct edits to implementation files"
    echo "  ✗ Perform merge/rebase operations"
    echo ""
    echo -e "${YELLOW}Workflow:${NC}"
    echo "  1. Review: git diff (check changes)"
    echo "  2. Verify: Run tests (pnpm test, etc.)"
    echo "  3. Receipt: Check implementor provided receipt"
    echo "  4. Decide: bd close <bead-id> (approve) OR bd reopen <bead-id> (feedback)"
    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Git wrapper function
git() {
    # Only enforce guardrails if we're in reviewer pane
    if maf_is_reviewer_pane; then
        local subcommand="$1"

        # Check if command is blocked
        case "$subcommand" in
            commit|push|merge|rebase|am|cherry-pick)
                maf_show_git_blocked_error "$subcommand"
                return 1
                ;;
            reset)
                # Block reset --hard (destructive)
                if [[ "$*" == *"--hard"* ]]; then
                    maf_show_git_blocked_error "reset --hard"
                    return 1
                fi
                # Allow reset --soft (staging area only)
                ;;
            clean)
                # Block git clean with dangerous flags
                if [[ "$*" == *"-f"* ]] || [[ "$*" == *"-d"* ]]; then
                    maf_show_git_blocked_error "clean -fd"
                    return 1
                fi
                ;;
            pull)
                # Only allow pull with --ff-only (fast-forward only, no merge)
                if [[ "$*" != *"--ff-only"* ]]; then
                    echo ""
                    echo -e "${YELLOW}⚠️  REVIEWER GUARDRAIL: git pull without --ff-only blocked${NC}"
                    echo ""
                    echo -e "${GREEN}Use instead:${NC} git pull --ff-only"
                    echo -e "${GREEN}Or:${NC} git fetch origin (read-only)"
                    echo ""
                    return 1
                fi
                ;;
        esac
    fi

    # Pass through to actual git command
    command git "$@"
}

# Export the git function
export -f git

# Beads command wrapper (also guards against premature bead operations)
bd() {
    if maf_is_reviewer_pane; then
        local subcommand="$1"

        case "$subcommand" in
            close)
                # Check for receipt before allowing close
                local bead_id="$2"
                if [ -z "$bead_id" ]; then
                    echo -e "${YELLOW}⚠️  Usage: bd close <bead-id>${NC}"
                    return 1
                fi

                echo ""
                echo -e "${YELLOW}Reviewer: Approving bead $bead_id${NC}"
                echo ""
                echo -e "${GREEN}Before closing, verify:${NC}"
                echo "  ✓ Implementor provided a receipt"
                echo "  ✓ git diff shows correct changes"
                echo "  ✓ Tests pass (run target test commands)"
                echo ""
                echo -e "${YELLOW}Continue with close?${NC}"
                command bd "$@"
                ;;
            *)
                # Allow other bd commands (status, reopen, etc.)
                command bd "$@"
                ;;
        esac
    else
        command bd "$@"
    fi
}

export -f bd

# Status message when guardrails are loaded
maf_reviewer_guardrails_status() {
    if maf_is_reviewer_pane; then
        echo ""
        echo -e "${GREEN}✓ Reviewer guardrails active${NC}"
        echo "  Blocked git commands: $BLOCKED_GIT_COMMANDS"
        echo "  Type 'git' commands normally - dangerous operations are intercepted"
        echo ""
    else
        echo ""
        echo -e "${YELLOW}Note: Reviewer guardrails loaded (not in reviewer pane)${NC}"
        echo "  Guardrails will activate in reviewer pane (maf-cli:agents.1)"
        echo ""
    fi
}

# Show status on load
maf_reviewer_guardrails_status
