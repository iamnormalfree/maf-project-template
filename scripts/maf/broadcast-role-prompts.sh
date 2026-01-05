#!/usr/bin/env bash
# Broadcast role-specific prompts to the live tmux panes.
# Reads pane targets from canonical topology config.
#
# Usage:
#   broadcast-role-prompts.sh [--dry-run]
set -euo pipefail

SLEEP=0.2
DRY_RUN=false

# Parse arguments
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  shift
fi

SESSION_NAME="${MAF_TMUX_SESSION:-maf-cli}"
WINDOW_NAME="${MAF_AGENT_WINDOW:-${MAF_TMUX_WINDOW:-agents}}"
TOPOLOGY_FILE="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

# Function to get pane index from topology config
get_pane_index() {
  local role="$1"
  local input_lower=$(echo "$role" | tr '[:upper:]' '[:lower:]')

  if [ ! -f "$TOPOLOGY_FILE" ]; then
    echo "Warning: Topology config not found at $TOPOLOGY_FILE" >&2
    return 1
  fi

  # Try role_to_pane lookup
  local pane_index=$(jq -r ".role_to_pane[\"$input_lower\"] // empty" "$TOPOLOGY_FILE" 2>/dev/null)
  if [ -n "$pane_index" ] && [ "$pane_index" != "null" ]; then
    echo "$pane_index"
    return 0
  fi

  return 1
}

# Function to get pane target (session:window.index)
get_pane_target() {
  local role="$1"
  local pane_index=$(get_pane_index "$role")

  if [ -z "$pane_index" ]; then
    # Fallback to hardcoded defaults
    case "$role" in
      supervisor) pane_index=0 ;;
      reviewer) pane_index=1 ;;
      implementor-1) pane_index=2 ;;
      implementor-2) pane_index=3 ;;
      *) echo "Error: Unknown role '$role'" >&2; return 1 ;;
    esac
  fi

  echo "${SESSION_NAME}:${WINDOW_NAME}.${pane_index}"
}

# Get pane targets from topology config
SUP=$(get_pane_target "supervisor")
REV=$(get_pane_target "reviewer")
IMP1=$(get_pane_target "implementor-1")
IMP2=$(get_pane_target "implementor-2")

send_prompt() {
  local pane="$1"
  local msg="$2"
  echo "Sending to $pane"
  sleep "$SLEEP"
  tmux send-keys -t "$pane" -l "$msg"
  sleep "$SLEEP"
  tmux send-keys -t "$pane" Enter
}

send_prompt "$SUP"  'Supervisor: Check Agent Mail and bd ready for new work. Route tasks to implementors based on labels and domain expertise. Keep team coordinated. For complex decisions or epic-level analysis, use ultrathink. If you have a new plan to implement, use /plan-to-beads docs/plans/<plan>.md to convert it to beads first.'

send_prompt "$REV"  'Reviewer: Check Agent Mail for review requests. Validate completed work with tests. Approve or reopen with concrete diffs. For complex analysis or security reviews, use ultrathink.'

send_prompt "$IMP1" 'Implementor-1: Check bd ready for frontend/site tasks. CRITICAL: When implementing, ALWAYS start with /response-awareness "Implement bead [id]: [title]" - this enables metacognitive orchestration. Reserve files before editing. Work TDD-first. Close beads when done and notify reviewer.'

send_prompt "$IMP2" 'Implementor-2: Check bd ready for backend/api tasks. CRITICAL: When implementing, ALWAYS start with /response-awareness "Implement bead [id]: [title]" - this enables metacognitive orchestration. Reserve files before editing. Work TDD-first. Close beads when done and notify reviewer.'
