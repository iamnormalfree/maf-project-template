#!/bin/bash

# Agent Memory Wrapper Script
# Provides easy interface to memory service for agent coordination

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIFIED_SERVICE="$SCRIPT_DIR/memory-service-unified.py"
VENV_PATH="/root/projects/roundtable/venv_memlayer"
ENV_FILE="/root/projects/roundtable/apps/backend/.env"

# Source Python environment (needed for Memlayer when available)
if [[ -d "$VENV_PATH" ]]; then
    source "$VENV_PATH/bin/activate"
fi

# Load OpenAI key (and related env) for Memlayer, if available.
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

# Get current bead ID (if any)
get_current_bead() {
    bd list --status in_progress --json 2>/dev/null | jq -r '.[-1].id // empty'
}

sanitize_agent_label() {
    local raw="${1:-}"
    if [[ -z "$raw" ]]; then
        echo ""
        return
    fi
    printf '%s' "$raw" | tr '[:space:]' '_' | tr -c 'A-Za-z0-9._-' '_'
}

get_session_name() {
    tmux display-message -p '#S' 2>/dev/null
}

get_pane_id() {
    tmux display-message -p '#I.#P' 2>/dev/null
}

# Extract agent name from environment or pane
get_agent_name() {
    if [[ -n "$AGENT_NAME" ]]; then
        sanitize_agent_label "$AGENT_NAME"
        return
    fi

    local session
    local pane
    session=$(get_session_name)
    pane=$(get_pane_id)
    if [[ -n "$session" && -n "$pane" ]]; then
        sanitize_agent_label "${session}_${pane}"
        return
    fi

    echo "unknown"
}

get_team_name() {
    if [[ -n "$AGENT_TEAM" ]]; then
        sanitize_agent_label "$AGENT_TEAM"
        return
    fi

    local session
    session=$(get_session_name)
    if [[ -n "$session" ]]; then
        sanitize_agent_label "team_${session}"
        return
    fi

    echo ""
}

store_to_memory() {
    local agent_name="$1"
    local bead_id="$2"
    local content="$3"

    if [[ -z "$agent_name" ]]; then
        return 0
    fi

    echo "$content" | python3 "$UNIFIED_SERVICE" store \
        --agent "$agent_name" \
        --bead "$bead_id" \
        --file -
}

# Store current context before restart
store_context() {
    local agent_name=$(get_agent_name)
    local team_name=$(get_team_name)
    local bead_id=$(get_current_bead)
    local pane_id=$(tmux display-message -p '#S:#I.#P' 2>/dev/null || echo "unknown")

    local context=""
    if [[ -t 0 ]]; then
        context=$(tmux capture-pane -p -S -5000 2>/dev/null || echo "No context captured")
    else
        context=$(cat)
    fi
    if [[ -z "$context" ]]; then
        context="No context captured"
    fi

    # Store in unified memory service (handles Memlayer vs fallback automatically)
    local stored=false
    if store_to_memory "$agent_name" "$bead_id" "$context"; then
        stored=true
    fi
    if [[ -n "$team_name" && "$team_name" != "$agent_name" ]]; then
        if store_to_memory "$team_name" "$bead_id" "$context"; then
            stored=true
        fi
    fi

    if [[ "$stored" != true ]]; then
        echo "Error: Failed to store context"
        return 1
    fi
    echo "Context stored successfully"

    # Also save to Agent Mail
    local project_path="/root/projects/roundtable"
    echo "Storing context for $agent_name (bead: $bead_id)"

    python3 << EOF
import sys
sys.path.insert(0, '$project_path/mcp_agent_mail/src')
try:
    from mcp_agent_mail.client import AgentMailClient
except Exception as e:
    print(f"Agent Mail unavailable: {e}")
    raise SystemExit(0)

try:
    client = AgentMailClient()
    client.send_message(
        thread_id="CONTEXT-$agent_name-$pane_id",
        subject=f"[CONTEXT] {agent_name} state saved",
        body=f"""Agent context backup:
Agent: $agent_name
Bead: $bead_id
Pane: $pane_id
Timestamp: $(date)

Last 50 lines:
$(echo "$context" | tail -50)
""",
        from_agent="context-manager",
        project_key="$project_path"
    )
    print("Context saved to Agent Mail")
except Exception as e:
    print(f"Failed to save to Agent Mail: {e}")
EOF
}

# Retrieve relevant context after restart
restore_context() {
    local agent_name=$(get_agent_name)
    local team_name=$(get_team_name)
    local bead_id=$(get_current_bead)

    echo "Restoring context for $agent_name (bead: $bead_id)..."

    # Get memories from unified memory service
    local memories
    if memories=$(python3 "$UNIFIED_SERVICE" retrieve \
        --agent "$agent_name" \
        --bead "$bead_id" \
        --query "current task decisions code changes" \
        --limit 15); then
        if [[ -n "$memories" ]]; then
            echo ""
            echo "=== RESTORED CONTEXT ==="
            echo "$memories"
            echo "=== END CONTEXT ==="
            echo ""
        fi
    else
        echo "Error: Failed to retrieve context"
    fi

    if [[ -n "$team_name" && "$team_name" != "$agent_name" ]]; then
        local team_memories
        if team_memories=$(python3 "$UNIFIED_SERVICE" retrieve \
            --agent "$team_name" \
            --bead "$bead_id" \
            --query "current task decisions code changes" \
            --limit 10); then
            if [[ -n "$team_memories" ]]; then
                echo ""
                echo "=== TEAM CONTEXT ==="
                echo "$team_memories"
                echo "=== END TEAM CONTEXT ==="
                echo ""
            fi
        fi
    fi

    # Get Agent Mail messages
    local project_path="/root/projects/roundtable"
    python3 << EOF
import sys
sys.path.insert(0, '$project_path/mcp_agent_mail/src')
try:
    from mcp_agent_mail.client import AgentMailClient
except Exception as e:
    print(f"Agent Mail unavailable: {e}")
    raise SystemExit(0)

try:
    client = AgentMailClient()
    messages = client.fetch_inbox(
        agent_name="$agent_name",
        project_key="$project_path",
        limit=5
    )

    if messages:
        print("\n=== UNREAD MESSAGES ===")
        for msg in messages:
            print(f"From: {msg.get('from_agent', 'unknown')}")
            print(f"Thread: {msg.get('thread_id', 'unknown')}")
            print(f"Subject: {msg.get('subject', 'no subject')[:100]}")
            print("---")
        print("=== END MESSAGES ===")

except Exception as e:
    print(f"Failed to fetch messages: {e}")
EOF
}

# Quick context save
save_context() {
    local content="$1"
    local agent_name=$(get_agent_name)
    local team_name=$(get_team_name)
    local bead_id=$(get_current_bead)

    local stored=false
    if store_to_memory "$agent_name" "$bead_id" "$content"; then
        stored=true
    fi
    if [[ -n "$team_name" && "$team_name" != "$agent_name" ]]; then
        if store_to_memory "$team_name" "$bead_id" "$content"; then
            stored=true
        fi
    fi

    if [[ "$stored" != true ]]; then
        echo "Error: Failed to store"
        return 1
    fi
    echo "Stored successfully"
}

# Main CLI interface
case "${1:-help}" in
    "store"|"save")
        if [[ -n "${2:-}" ]]; then
            save_context "$2"
        else
            store_context
        fi
        ;;
    "restore"|"load")
        restore_context
        ;;
    "summary")
        AGENT_NAME=$(get_agent_name)
        AGENT_TEAM=$(get_team_name)
        python3 "$UNIFIED_SERVICE" summary --agent "$AGENT_NAME"
        if [[ -n "$AGENT_TEAM" && "$AGENT_TEAM" != "$AGENT_NAME" ]]; then
            echo ""
            echo "=== TEAM SUMMARY ==="
            python3 "$UNIFIED_SERVICE" summary --agent "$AGENT_TEAM"
        fi
        ;;
    "clean")
        # Clean up old memories
        shift  # Remove 'clean' from arguments

        # Parse options
        DAYS=30
        SCOPE="age"
        DRY_RUN=""
        FORCE=""
        AGENT=""

        while [[ $# -gt 0 ]]; do
            case "$1" in
                --days)
                    DAYS="$2"
                    shift 2
                    ;;
                --scope)
                    SCOPE="$2"
                    shift 2
                    ;;
                --dry-run)
                    DRY_RUN="--dry-run"
                    shift
                    ;;
                --force)
                    FORCE="--force"
                    shift
                    ;;
                --agent)
                    AGENT="$2"
                    shift 2
                    ;;
                *)
                    echo "Unknown option: $1"
                    exit 1
                    ;;
            esac
        done

        # Use detected agent name if not specified
        if [[ -z "$AGENT" ]]; then
            AGENT=$(get_agent_name)
        fi

        echo "Cleaning old memories..."
        python3 "$UNIFIED_SERVICE" clean \
            --agent "$AGENT" \
            --days "$DAYS" \
            --scope "$SCOPE" \
            $DRY_RUN \
            $FORCE
        ;;
    "help"|*)
        echo "Usage: $0 {store|restore|summary|clean} [content]"
        echo ""
        echo "Commands:"
        echo "  store [content]  - Store context or provided content"
        echo "  restore         - Restore relevant context"
        echo "  summary         - Show agent memory summary"
        echo "  clean           - Clean old memories"
        echo ""
        echo "Clean options:"
        echo "  --days N        - Delete memories older than N days (default: 30)"
        echo "  --scope SCOPE   - Cleanup scope: age|agent|all (default: age)"
        echo "  --dry-run       - Show what would be deleted without deleting"
        echo "  --force         - Skip confirmation prompt"
        echo "  --agent NAME    - Clean memories for specific agent"
        echo ""
        echo "Environment variables:"
        echo "  AGENT_NAME      - Override agent name detection"
        echo "  AGENT_TEAM      - Override team memory name"
        ;;
esac
