#!/bin/bash
# ABOUTME: Tracks review cycles per bead and triggers escalation at threshold.
# ABOUTME: Supports escalation to Codex-senior or Minimax using escalate-loop.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

STATE_DIR="$PROJECT_ROOT/.maf/state"
STATE_FILE="$STATE_DIR/review-cycles.json"

THRESHOLD=3
BEAD_ID=""
AGENT_ID=""
TARGET=""

print_usage() {
  cat << 'EOF'
MAF Review Cycles Tracker
=========================

Tracks the number of Codex review cycles for a bead and triggers escalation
when the threshold is reached. Escalates to either Codex-senior or Minimax.

USAGE:
  review-cycles.sh --bead-id ID --agent-id AGENT [--threshold 3] [--target codex-senior|minimax-debug-1]

EXAMPLES:
  # Increment cycle count; escalate to Codex-senior at 3
  ./review-cycles.sh --bead-id bd-123 --agent-id codex-reviewer-1 --threshold 3 --target codex-senior

  # Increment cycle count; default target Minimax at 3
  ./review-cycles.sh --bead-id bd-123 --agent-id glm-worker-1
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --bead-id)
      BEAD_ID="$2"; shift 2 ;;
    --agent-id)
      AGENT_ID="$2"; shift 2 ;;
    --threshold)
      THRESHOLD="$2"; shift 2 ;;
    --target)
      TARGET="$2"; shift 2 ;;
    -h|--help)
      print_usage; exit 0 ;;
    *)
      echo "Unknown argument: $1"; print_usage; exit 1 ;;
  esac
done

if [[ -z "$BEAD_ID" || -z "$AGENT_ID" ]]; then
  echo "Error: --bead-id and --agent-id are required" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

# Increment cycle counter for bead
CURRENT=$(jq -r --arg id "$BEAD_ID" '.[$id] // 0' "$STATE_FILE")
if [[ "$CURRENT" == "null" || -z "$CURRENT" ]]; then CURRENT=0; fi
NEXT=$((CURRENT + 1))
jq --arg id "$BEAD_ID" --argjson val "$NEXT" '.[$id] = $val' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

echo "🔁 Review cycle for $BEAD_ID incremented: $CURRENT -> $NEXT (threshold: $THRESHOLD)"

if (( NEXT >= THRESHOLD )); then
  echo "🚨 Threshold reached for $BEAD_ID. Initiating escalation..."
  # Default to Minimax target if none provided
  TARGET_ARG=( )
  if [[ -n "$TARGET" ]]; then
    TARGET_ARG=( --target "$TARGET" )
  fi
  bash "$SCRIPT_DIR/escalate-loop.sh" --agent-id "$AGENT_ID" --error-context "review_cycles_threshold_reached:$NEXT" --bead-id "$BEAD_ID" "${TARGET_ARG[@]}"
fi

exit 0

