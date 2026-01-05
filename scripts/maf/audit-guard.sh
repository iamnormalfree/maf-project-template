#!/bin/bash
# ABOUTME: Lightweight guard to mitigate Codex audit context drift via dossier size.
# ABOUTME: Monitors agent-mail message footprint and suggests (or spawns) a fresh reviewer.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BEAD_ID=""
MAX_KB=5
SESSION_NAME="maf-session"

print_usage() {
  cat << 'EOF'
MAF Audit Guard
===============

Monitors agent-mail message footprint for a bead to reduce late-stage audit
context drift. If total message bytes matching the bead exceed a threshold,
it suggests (or spawns) a fresh Codex reviewer with a clean context.

USAGE:
  audit-guard.sh --bead-id ID [--max-kb 5] [--session maf-session]

ENV:
  AUTO_SPAWN_FRESH_REVIEWER=true  # actually create a new reviewer agent

EXAMPLE:
  ./audit-guard.sh --bead-id bd-123 --max-kb 6
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --bead-id) BEAD_ID="$2"; shift 2 ;;
    --max-kb) MAX_KB="$2"; shift 2 ;;
    --session) SESSION_NAME="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown argument: $1"; print_usage; exit 1 ;;
  esac
done

if [[ -z "$BEAD_ID" ]]; then
  echo "Error: --bead-id is required" >&2
  exit 1
fi

MAIL_DIR="$PROJECT_ROOT/.agent-mail/messages"
if [[ ! -d "$MAIL_DIR" ]]; then
  echo "Info: No agent-mail messages directory present ($MAIL_DIR). Nothing to scan."
  exit 0
fi

# Sum sizes of files that mention the bead id (subject/body); ignore binary failures
TOTAL_BYTES=$(grep -Rsl --exclude-dir='.*' -- "$BEAD_ID" "$MAIL_DIR" 2>/dev/null | xargs -r stat -c %s 2>/dev/null | awk '{s+=$1} END {print s+0}')
MAX_BYTES=$(( MAX_KB * 1024 ))

echo "🧪 Audit Guard: bead=$BEAD_ID size=${TOTAL_BYTES}B (limit=${MAX_BYTES}B)"

if (( TOTAL_BYTES > MAX_BYTES )); then
  echo "⚠️  Message footprint exceeds threshold. Suggesting fresh Codex reviewer."
  if [[ "${AUTO_SPAWN_FRESH_REVIEWER:-false}" == "true" ]]; then
    NEW_ID="reviewer-fresh-$(date +%s)"
    echo "🚀 Spawning fresh reviewer: $NEW_ID in session $SESSION_NAME"
    bash "$SCRIPT_DIR/init-agents.sh" --agent-type codex-reviewer --agent-id "$NEW_ID" --session "$SESSION_NAME" || {
      echo "Failed to spawn fresh reviewer via init-agents.sh" >&2
      exit 1
    }
  else
    echo "Hint: AUTO_SPAWN_FRESH_REVIEWER=true $0 --bead-id $BEAD_ID --max-kb $MAX_KB --session $SESSION_NAME"
  fi
else
  echo "✅ Within threshold; no action needed."
fi

exit 0

