#!/bin/bash
# Simple agent coordinator using file-based messaging
# Works without full MCP setup

set -e

AGENT_MAIL_ROOT=".agent-mail"
RESERVATIONS_DIR="$AGENT_MAIL_ROOT/reservations"
MESSAGES_DIR="$AGENT_MAIL_ROOT/messages"
LOGS_DIR="$AGENT_MAIL_ROOT/logs"

# Ensure directories exist
mkdir -p "$RESERVATIONS_DIR" "$MESSAGES_DIR" "$LOGS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGS_DIR/coordinator.log"
}

# Check if a bead is already reserved
is_bead_reserved() {
    local bead_id="$1"
    [[ -f "$RESERVATIONS_DIR/${bead_id}.json" ]]
}

# Reserve a bead for an agent
reserve_bead() {
    local bead_id="$1"
    local agent_id="$2"
    local reservation_file="$RESERVATIONS_DIR/${bead_id}.json"

    if is_bead_reserved "$bead_id"; then
        log "Bead $bead_id already reserved"
        return 1
    fi

    cat > "$reservation_file" << EOF
{
    "bead_id": "$bead_id",
    "agent_id": "$agent_id",
    "reserved_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "expires_at": "$(date -u -d '+4 hours' +%Y-%m-%dT%H:%M:%SZ)",
    "status": "reserved"
}
EOF

    log "Bead $bead_id reserved for agent $agent_id"
    return 0
}

# Release a bead reservation
release_bead() {
    local bead_id="$1"
    local reservation_file="$RESERVATIONS_DIR/${bead_id}.json"

    if [[ -f "$reservation_file" ]]; then
        rm "$reservation_file"
        log "Bead $bead_id reservation released"
    fi
}

# Get list of ready beads (not reserved)
get_ready_beads() {
    # Get all ready beads
    local ready_beads
    ready_beads=$(bd ready 2>/dev/null | grep -oE 'roundtable-[a-z0-9]+' || true)

    # Filter out reserved ones
    for bead in $ready_beads; do
        if ! is_bead_reserved "$bead"; then
            echo "$bead"
        fi
    done
}

# Assign next available bead to an agent
assign_bead_to_agent() {
    local agent_id="$1"
    local ready_beads
    ready_beads=$(get_ready_beads)

    local first_bead
    first_bead=$(echo "$ready_beads" | head -1)

    if [[ -n "$first_bead" ]]; then
        if reserve_bead "$first_bead" "$agent_id"; then
            echo "$first_bead"
            return 0
        fi
    fi

    return 1
}

# Main coordinator logic
case "${1:-help}" in
    "ready")
        log "Checking for ready beads..."
        get_ready_beads
        ;;
    "reserve")
        if [[ $# -ne 2 ]]; then
            echo "Usage: $0 reserve <bead_id>"
            exit 1
        fi
        reserve_bead "$2" "$(whoami)"
        ;;
    "release")
        if [[ $# -ne 2 ]]; then
            echo "Usage: $0 release <bead_id>"
            exit 1
        fi
        release_bead "$2"
        ;;
    "assign")
        if [[ $# -ne 2 ]]; then
            echo "Usage: $0 assign <agent_id>"
            exit 1
        fi
        local bead
        if bead=$(assign_bead_to_agent "$2"); then
            echo "$bead"
        else
            echo "No available beads"
            exit 1
        fi
        ;;
    "status")
        echo "=== Agent Mail Status ==="
        echo "Reserved beads:"
        ls -1 "$RESERVATIONS_DIR"/*.json 2>/dev/null | sed 's|.*/||; s/\.json$//' || echo "  None"
        echo ""
        echo "Available beads:"
        get_ready_beads | sed 's/^/  /' || echo "  None"
        ;;
    "monitor")
        log "Starting agent monitoring..."
        while true; do
            log "=== Status Check ==="
            for agent_id in implementor-1 implementor-2 implementor-3; do
                if bead=$(assign_bead_to_agent "$agent_id"); then
                    log "Assigned $bead to $agent_id"
                    # Send message to agent's tmux pane
                    case "$agent_id" in
                        "implementor-1")
                            tmux send-keys -t maf-5pane:0.1 "echo 'Agent mail assigned bead: $bead'" Enter 2>/dev/null || true
                            ;;
                        "implementor-2")
                            tmux send-keys -t maf-5pane:0.2 "echo 'Agent mail assigned bead: $bead'" Enter 2>/dev/null || true
                            ;;
                        "implementor-3")
                            tmux send-keys -t maf-5pane:0.3 "echo 'Agent mail assigned bead: $bead'" Enter 2>/dev/null || true
                            ;;
                    esac
                fi
            done
            sleep 30
        done
        ;;
    *)
        echo "Agent Mail Coordinator"
        echo ""
        echo "Usage: $0 {ready|reserve|release|assign|status|monitor}"
        echo ""
        echo "Commands:"
        echo "  ready    - List available beads"
        echo "  reserve  - Reserve a specific bead"
        echo "  release  - Release a bead reservation"
        echo "  assign   - Assign next available bead to agent"
        echo "  status   - Show current status"
        echo "  monitor  - Start monitoring loop"
        ;;
esac