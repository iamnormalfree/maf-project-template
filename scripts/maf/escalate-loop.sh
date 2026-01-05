#!/bin/bash
# ABOUTME: Escalation CLI for agent handoff in MAF (Codex-senior or Minimax).
# ABOUTME: Creates escalation beads, notifies target agent, and updates agent status.

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
DEFAULT_ESCALATION_THRESHOLD=3
DEFAULT_ESCALATION_TARGET="minimax-debug-1"
DEFAULT_MONITOR_INTERVAL=30

# Global variables
AGENT_ID=""
ERROR_CONTEXT=""
BEAD_ID=""
MONITOR_MODE=false
ESCALATION_THRESHOLD=""
MONITOR_INTERVAL=""
VERBOSE_LOGGING=""
ESCALATION_TARGET=""

# Colors for output
source "$SCRIPT_DIR/lib/colors.sh" 2>/dev/null || {
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    NC='\033[0m'
}

# Create escalation bead with metadata
create_escalation_bead() {
    local agent_id="$1"
    local error_context="$2"
    local bead_id="$3"

    echo "Creating escalation bead for agent: $glm_agent_id"

    local bead_dir="$PROJECT_ROOT/.maf/beads/escalation"
    mkdir -p "$bead_dir"

    local bead_file="$bead_dir/${bead_id}-escalate.json"

    # Create escalation bead metadata
    local bead_metadata
    bead_metadata=$(jq -n \
        --arg bead_id "$bead_id" \
        --arg agent_id "$agent_id" \
        --arg error_context "$error_context" \
        --arg escalation_threshold "$ESCALATION_THRESHOLD" \
        --arg escalated_to "$ESCALATION_TARGET" \
        --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            "bead_id": $bead_id,
            "created_by": $agent_id,
            "escalated_to": $escalated_to,
            "escalation_reason": "persistent_error",
            "error_context": $error_context,
            "escalation_threshold": ($escalation_threshold | tonumber),
            "created_at": $created_at,
            "status": "pending"
        }')

    echo "$bead_metadata" > "$bead_file"
    echo "Escalation bead created: $bead_file"
    return 0
}

# Notify Minimax agent via agent-mail
notify_target_agent() {
    local bead_id="$1"

    echo "Notifying escalation target for bead: $bead_id"

    local target_id="$ESCALATION_TARGET"
    local mail_dir="$PROJECT_ROOT/.agent-mail/outbox"
    mkdir -p "$mail_dir"

    local mail_file="$mail_dir/escalation-${bead_id}-$(date +%s).json"

    local notification
    notification=$(jq -n \
        --arg to "$target_id" \
        --arg subject "Escalation Request: $bead_id" \
        --arg bead_id "$bead_id" \
        '{
            "to": $to,
            "from": "escalation-system",
            "subject": $subject,
            "message_type": "escalation_request",
            "bead_id": $bead_id
        }')

    echo "$notification" > "$mail_file"
    echo "Escalation target notified: $mail_file"
    return 0
}

# Update GLM agent status
update_agent_status() {
    local agent_id="$1"
    local bead_id="$2"

    echo "Updating agent status: $agent_id"

    # Update agent status in registry
    local agent_registry="$PROJECT_ROOT/.maf/agents/registry.json"
    mkdir -p "$(dirname "$agent_registry")"

    if [[ -f "$agent_registry" ]]; then
        # Update existing agent status
        jq --arg agent_id "$agent_id" \
           --arg status "escalated" \
           --arg bead_id "$bead_id" \
           --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
           '.agents[] |= if .id == $agent_id then .status = $status | .last_escalation = $bead_id | .updated_at = $timestamp else . end' \
           "$agent_registry" > "$agent_registry.tmp" && mv "$agent_registry.tmp" "$agent_registry" 2>/dev/null || true
    fi

    echo "Agent status updated: $agent_id -> escalated"
    return 0
}

# Print usage information
print_usage() {
    cat << 'EOF'
MAF Escalation CLI for Agent Handoff
====================================

USAGE:
    escalate-loop.sh --agent-id ID --error-context ERROR --bead-id ID [--target minimax-debug-1|codex-senior]
    escalate-loop.sh --glm-agent-id ID --error-context ERROR --bead-id ID  # backward compatible
    escalate-loop.sh --monitor

EXAMPLES:
    # Create escalation bead
    ./escalate-loop.sh --glm-agent-id glm-worker-1 --error-context "Type error" --bead-id task-123

    # Monitor escalation beads
    ./escalate-loop.sh --monitor

EOF
}

# Monitor escalation beads
monitor_escalations() {
    echo "Starting escalation monitor..."
    echo "Watching for escalation beads in .maf/beads/escalation/"

    local escalation_dir="$PROJECT_ROOT/.maf/beads/escalation"
    mkdir -p "$escalation_dir"

    while true; do
        clear
        echo "=== MAF Escalation Monitor ==="
        echo "Last updated: $(date)"
        echo ""

        if [[ -d "$escalation_dir" ]] && [[ $(ls -A "$escalation_dir" 2>/dev/null) ]]; then
            echo "Active escalation beads:"
            for bead_file in "$escalation_dir"/*.json; do
                if [[ -f "$bead_file" ]]; then
                    local bead_id=$(basename "$bead_file" .json)
                    local status=$(jq -r '.status // "unknown"' "$bead_file" 2>/dev/null || echo "unknown")
                    local created_at=$(jq -r '.created_at // "unknown"' "$bead_file" 2>/dev/null || echo "unknown")
                    local glm_agent=$(jq -r '.created_by // "unknown"' "$bead_file" 2>/dev/null || echo "unknown")

                    echo "  📋 $bead_id"
                    echo "     Status: $status"
                    echo "     GLM Agent: $glm_agent"
                    echo "     Created: $created_at"
                    echo ""
                fi
            done
        else
            echo "No escalation beads found."
        fi

        echo "Press Ctrl+C to stop monitoring..."
        sleep 15
    done
}

# Parse command line arguments
parse_arguments() {
    ESCALATION_THRESHOLD="$DEFAULT_ESCALATION_THRESHOLD"
    MONITOR_INTERVAL="$DEFAULT_MONITOR_INTERVAL"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --glm-agent-id)
                AGENT_ID="$2"  # backward compatible flag
                shift 2
                ;;
            --agent-id)
                AGENT_ID="$2"
                shift 2
                ;;
            --error-context)
                ERROR_CONTEXT="$2"
                shift 2
                ;;
            --bead-id)
                BEAD_ID="$2"
                shift 2
                ;;
            --target)
                ESCALATION_TARGET="$2"
                shift 2
                ;;
            --monitor)
                MONITOR_MODE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown argument: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

# Validate arguments
validate_arguments() {
    if [[ -z "$AGENT_ID" ]]; then
        echo "Error: Agent ID is required"
        exit 1
    fi

    if [[ -z "$ERROR_CONTEXT" ]]; then
        echo "Error: Error context is required"
        exit 1
    fi

    if [[ -z "$BEAD_ID" ]]; then
        echo "Error: Bead ID is required"
        exit 1
    fi
    if [[ -z "$ESCALATION_TARGET" ]]; then
        ESCALATION_TARGET="$DEFAULT_ESCALATION_TARGET"
    fi
}

# Main escalation function
main() {
    echo "MAF Escalation CLI starting..."

    # Parse arguments
    parse_arguments "$@"

    # Handle monitor mode
    if [[ "$MONITOR_MODE" == "true" ]]; then
        monitor_escalations
        exit 0
    fi

    # Validate escalation arguments
    validate_arguments

    # Create escalation
    create_escalation_bead "$AGENT_ID" "$ERROR_CONTEXT" "$BEAD_ID"
    notify_target_agent "$BEAD_ID"
    update_agent_status "$AGENT_ID" "$BEAD_ID"

    echo "Escalation workflow completed successfully!"
}

# Entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
