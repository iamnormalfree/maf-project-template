# ABOUTME: MAF Bash Integration - Aliases and Functions for Agents
# ABOUTME: Source this file in agent sessions to enable automatic receipt workflow

# MAF Bash Integration for Autonomous Agents
# This file provides aliases and functions that automate receipt generation
# when MAF agents close beads.
#
# Usage:
#   source scripts/maf/maf-bash-integration.sh
#
# Or add to context-manager.sh to load automatically on agent start:

# Override bd close to use bd-close wrapper
# This intercepts "bd close" calls and routes them through the receipt-generating wrapper
bd_close_wrapper() {
    local bead_id="$1"

    # Check if this is a close command
    if [ "$1" = "close" ] && [ -n "$2" ]; then
        # Route to bd-close wrapper
        ./scripts/maf/bd-close "$2"
    elif [ "$1" = "close" ] && [ -z "$2" ]; then
        echo "Usage: bd close <bead_id>" >&2
        echo "Note: Using MAF wrapper - receipts will be generated automatically" >&2
        return 1
    else
        # Pass through to original bd command for other operations
        command bd "$@"
    fi
}

# Create alias for bd close -> bd-close
# Note: This alias only works when NOT using npm/npx global bd
# The alias intercepts "bd close" and redirects to ./scripts/maf/bd-close
alias bd='bd_close_wrapper'

# Convenience function: Close bead with automatic receipt (shorter form)
close() {
    if [ -z "$1" ]; then
        echo "Usage: close <bead_id>" >&2
        echo "Closes bead with automatic receipt generation" >&2
        return 1
    fi

    ./scripts/maf/bd-close "$@"
}

# Convenience function: Close bead AND post receipt to Agent Mail
close-and-post() {
    if [ -z "$1" ]; then
        echo "Usage: close-and-post <bead_id>" >&2
        echo "Closes bead, generates receipt, and posts to Agent Mail" >&2
        return 1
    fi

    ./scripts/maf/bd-close "$@" --post-receipt
}

# Convenience function: Generate receipt only (without closing)
receipt() {
    if [ -z "$1" ]; then
        echo "Usage: receipt <bead_id>" >&2
        echo "Generates receipt only (does not close bead)" >&2
        return 1
    fi

    mkdir -p receipts
    ./scripts/maf/receipt.sh "$1" | tee "receipts/$1.md"
}

# Convenience function: Generate visual receipt for UI beads
visual-receipt() {
    if [ -z "$1" ]; then
        echo "Usage: visual-receipt <bead_id> [options]" >&2
        echo "Generates screenshots for UI-related beads" >&2
        echo "" >&2
        echo "Options:" >&2
        echo "  --mode dark|light|both    Color mode (default: both)" >&2
        echo "  --device desktop|mobile|both  Device (default: both)" >&2
        return 1
    fi

    ./scripts/maf/visual-receipt.sh "$@"
}

# Convenience function: Close UI bead with visual receipt
close-ui() {
    local bead_id="$1"
    shift

    if [ -z "$bead_id" ]; then
        echo "Usage: close-ui <bead_id> [visual-receipt-options]" >&2
        echo "Generates visual receipt, then closes bead with receipt" >&2
        return 1
    fi

    echo "=== Closing UI bead with visual receipt ==="
    echo ""
    echo "Step 1: Generating visual receipts..."
    ./scripts/maf/visual-receipt.sh "$bead_id" "$@"

    echo ""
    echo "Step 2: Generating full receipt..."
    ./scripts/maf/bd-close "$bead_id"
}

# Show MAF workflow help
maf-help() {
    cat << 'EOF'
MAF Agent Workflow Commands

Bead Closure (with automatic receipts):
    close <bead_id>              Close bead with automatic receipt
    close-and-post <bead_id>     Close + post receipt to Agent Mail
    close-ui <bead_id>           Close UI bead with visual receipts

Receipt Generation:
    receipt <bead_id>            Generate receipt only (don't close)
    visual-receipt <bead_id>     Generate screenshots for UI beads

Bead Management:
    bd ready                      Show ready-to-work beads
    bd show <bead_id>            Show bead details
    bd reopen <bead_id>          Reopen a closed bead

Receipt Workflow:
    1. Complete implementation work
    2. Run: close <bead_id>
       → Receipt auto-generated
       → Bead auto-closed
    3. Reviewer verifies receipt
    4. Supervisor closes epic

For more details, see: docs/operations/beads-system-ops.md
EOF
}

# Display help on first load (optional - comment out if too verbose)
# echo "=== MAF Bash Integration Loaded ==="
# echo "Type 'maf-help' for available commands"
# echo ""
