#!/bin/bash
# MAF Agent Prompt - The ONLY way to send prompts to tmux agents
# This script GUARANTEES Enter is pressed. Never use raw tmux send-keys.
#
# Usage:
#   prompt-agent supervisor "message"
#   prompt-agent reviewer "message"
#   prompt-agent imp1 "message"
#   prompt-agent imp2 "message"

set -e

SESSION_NAME="${MAF_TMUX_SESSION:-maf-cli}"
WINDOW_NAME="${MAF_AGENT_WINDOW:-agents}"

# Try to read from canonical topology config
TOPOLOGY_FILE="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

# Function to resolve pane from topology config
resolve_pane_from_topology() {
  local input="$1"
  local input_lower=$(echo "$input" | tr '[:upper:]' '[:lower:]')

  if [ ! -f "$TOPOLOGY_FILE" ]; then
    return 1
  fi

  # Try alias_to_pane lookup first
  local pane_index=$(jq -r ".alias_to_pane[\"$input_lower\"] // empty" "$TOPOLOGY_FILE" 2>/dev/null)
  if [ -n "$pane_index" ] && [ "$pane_index" != "null" ]; then
    echo "$pane_index"
    return 0
  fi

  # Try role_to_pane lookup
  pane_index=$(jq -r ".role_to_pane[\"$input_lower\"] // empty" "$TOPOLOGY_FILE" 2>/dev/null)
  if [ -n "$pane_index" ] && [ "$pane_index" != "null" ]; then
    echo "$pane_index"
    return 0
  fi

  return 1
}

# Fallback hardcoded mapping (used if topology config not found or lookup fails)
fallback_pane_mapping() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    supervisor|sup|greenmountain|0)
      echo "0"
      echo "Supervisor (GreenMountain)"
      ;;
    reviewer|rev|blackdog|1)
      echo "1"
      echo "Reviewer (BlackDog)"
      ;;
    implementor-1|imp1|implementor1|orangepond|2)
      echo "2"
      echo "Implementor-1 (OrangePond)"
      ;;
    implementor-2|imp2|implementor2|fuchsia-creek|fuchsia_creek|3)
      echo "3"
      echo "Implementor-2 (FuchsiaCreek)"
      ;;
    *)
      return 1
      ;;
  esac
}

# Resolve pane index and agent name
PANE_INDEX=$(resolve_pane_from_topology "$1")

if [ -z "$PANE_INDEX" ]; then
  # Fallback to hardcoded mapping
  FALLBACK_OUTPUT=$(fallback_pane_mapping "$1" || true)
  if [ -z "$FALLBACK_OUTPUT" ]; then
    echo "❌ Error: Unknown agent '$1'"
    echo ""
    echo "Usage: $0 <agent> <message>"
    echo ""
    echo "Agents: supervisor, reviewer, imp1, imp2"
    echo "  (aliases: sup, rev, imp1, imp2, 0, 1, 2, 3)"
    echo ""
    echo "Topology config: $TOPOLOGY_FILE"
    exit 1
  fi
  PANE_INDEX=$(echo "$FALLBACK_OUTPUT" | head -1)
  AGENT_NAME=$(echo "$FALLBACK_OUTPUT" | tail -1)
else
  # Get agent name from topology config
  # Use role directly (may contain hyphens) and agent_name
  role=$(jq -r ".panes[] | select(.index == $PANE_INDEX) | .role // empty" "$TOPOLOGY_FILE" 2>/dev/null)
  agent_name=$(jq -r ".panes[] | select(.index == $PANE_INDEX) | .agent_name // empty" "$TOPOLOGY_FILE" 2>/dev/null)
  if [ -n "$role" ] && [ -n "$agent_name" ]; then
    # Capitalize first letter of role
    role_titlecased=$(echo "$role" | sed 's/./\U&/')
    AGENT_NAME="${role_titlecased} (${agent_name})"
  else
    AGENT_NAME="Agent (Pane $PANE_INDEX)"
  fi
fi

PANE="${SESSION_NAME}:${WINDOW_NAME}.${PANE_INDEX}"

shift
MESSAGE="$*"

if [ -z "$MESSAGE" ]; then
  echo "❌ Error: Message is required"
  echo "Usage: $0 <agent> <message>"
  exit 1
fi

# Send prompt with GUARANTEED Enter
echo "→ Prompting $AGENT_NAME..."

# Clear any pending input
tmux send-keys -t "$PANE" C-c C-u 2>/dev/null || true
sleep 0.1

# Send message with -l (literal) flag
tmux send-keys -t "$PANE" -l " $MESSAGE"
sleep 0.2

# Send Enter as SEPARATE command (the critical step!)
tmux send-keys -t "$PANE" Enter
sleep 0.3

echo "✓ Sent to $AGENT_NAME"

# Verification (optional, can skip with --no-verify flag)
if [ "${1:-}" != "--no-verify" ]; then
  sleep 1
  # Check if prompt was submitted (no "↵ send" indicator should remain)
  # Note: This is a basic check, actual processing depends on agent state
  :
fi
