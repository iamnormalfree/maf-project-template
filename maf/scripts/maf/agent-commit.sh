#!/bin/bash
# Agent-aware git commit wrapper
# Adds agent attribution to commit messages
# Reads agent identity from canonical topology config
#
# Usage: agent-commit.sh "commit message"
#
# This script should be used by all MAF agents when making commits.

set -e

# Topology config path
TOPOLOGY_FILE="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

# Function to get current pane index
get_pane_index() {
    # Method 1: Check TMUX_PANE environment variable (set by tmux)
    if [ -n "${TMUX_PANE:-}" ]; then
        # TMUX_PANE format is usually just the pane index like "%0"
        echo "$TMUX_PANE" | tr -d '%'
        return 0
    fi

    # Method 2: Extract from TMUX environment variable
    # TMUX format: /tmp/tmux-XXX/default,paneNN
    if [ -n "$TMUX" ]; then
        local pane_index=$(echo "$TMUX" | grep -o 'pane[0-9]*' | sed 's/pane//')
        if [ -n "$pane_index" ]; then
            echo "$pane_index"
            return 0
        fi
    fi

    # Method 3: Use tmux display-message as fallback
    tmux display-message -p '#P' 2>/dev/null
}

# Get agent info from topology config
get_agent_info_from_topology() {
    local pane_index="$1"

    if [ ! -f "$TOPOLOGY_FILE" ]; then
        return 1
    fi

    local role=$(jq -r ".panes[] | select(.index == $pane_index) | .role // empty" "$TOPOLOGY_FILE" 2>/dev/null)
    local agent_name=$(jq -r ".panes[] | select(.index == $pane_index) | .agent_name // empty" "$TOPOLOGY_FILE" 2>/dev/null)

    if [ -n "$role" ] && [ -n "$agent_name" ]; then
        # Capitalize first letter of role
        local role_titlecased=$(echo "$role" | sed 's/\b\(.\)/\u\1/g')
        echo "${role_titlecased}|${agent_name}"
        return 0
    fi
    return 1
}

# Get pane info
PANE_INDEX=$(get_pane_index)
WINDOW_NAME=$(tmux display-message -p '#W' 2>/dev/null || echo "unknown")
SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")

# Map pane indices to agent roles (maf-cli:agents window)
if [ -n "$PANE_INDEX" ]; then
    # Try topology config first
    AGENT_INFO=$(get_agent_info_from_topology "$PANE_INDEX")
    if [ -n "$AGENT_INFO" ]; then
        AGENT_ROLE=$(echo "$AGENT_INFO" | cut -d'|' -f1)
        AGENT_NAME=$(echo "$AGENT_INFO" | cut -d'|' -f2)
    else
        # Fallback to hardcoded mapping
        case "$PANE_INDEX" in
            0)
                AGENT_ROLE="Supervisor"
                AGENT_NAME="GreenMountain"
                ;;
            1)
                AGENT_ROLE="Reviewer"
                AGENT_NAME="BlackDog"
                ;;
            2)
                AGENT_ROLE="Implementor-1"
                AGENT_NAME="OrangePond"
                ;;
            3)
                AGENT_ROLE="Implementor-2"
                AGENT_NAME="FuchsiaCreek"
                ;;
            *)
                AGENT_ROLE="Unknown"
                AGENT_NAME="Agent-$PANE_INDEX"
                ;;
        esac
    fi
else
    AGENT_ROLE="CLI"
    AGENT_NAME="${USER:-unknown}"
fi

# Create commit message with attribution
COMMIT_MSG="$1"
COMMIT_FILE="/tmp/git-commit-msg-$$"

# Write commit message
echo "$COMMIT_MSG" > "$COMMIT_FILE"
echo "" >> "$COMMIT_FILE"
echo "---" >> "$COMMIT_FILE"
echo "Agent: $AGENT_NAME ($AGENT_ROLE)" >> "$COMMIT_FILE"
if [ -n "$PANE_INDEX" ]; then
    echo "Pane: $PANE_INDEX | Session: ${SESSION_NAME}:${WINDOW_NAME}" >> "$COMMIT_FILE"
fi
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$COMMIT_FILE"

# Run git commit with the message file
git commit -F "$COMMIT_FILE" "${@:2}"

# Clean up
rm -f "$COMMIT_FILE"
