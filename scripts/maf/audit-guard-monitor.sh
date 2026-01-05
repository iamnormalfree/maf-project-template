#!/bin/bash
# ABOUTME: Background monitor that runs audit-guard on active beads at intervals.
# ABOUTME: Scans agent-mail messages to discover bead ids and throttles checks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MAIL_DIR="$PROJECT_ROOT/.agent-mail/messages"
STATE_DIR="$PROJECT_ROOT/.maf/state"
STATE_FILE="$STATE_DIR/audit-guard-monitor.json"

INTERVAL_SECONDS="${AG_MONITOR_INTERVAL:-60}"
COOLDOWN_SECONDS="${AG_MONITOR_COOLDOWN:-600}"

mkdir -p "$STATE_DIR"
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

log() { echo "[audit-guard-monitor] $*"; }

discover_bead_ids() {
  # Collect bead ids from message JSON payloads (bead_id field) and subject/body grep
  local ids_json ids_grep
  ids_json=$(grep -Rsl -- "\"bead_id\"" "$MAIL_DIR" 2>/dev/null | xargs -r jq -r 'try .bead_id // empty' 2>/dev/null | grep -E '^bd-[A-Za-z0-9_-]+' || true)
  ids_grep=$(grep -RhoE --exclude-dir='.*' -- 'bd-[A-Za-z0-9_-]+' "$MAIL_DIR" 2>/dev/null | sort -u || true)
  printf "%s\n%s\n" "$ids_json" "$ids_grep" | grep -E '^bd-' | sort -u
}

should_check() {
  local bead_id="$1"
  local now_ts
  now_ts=$(date +%s)
  local last_ts
  last_ts=$(jq -r --arg id "$bead_id" '.[$id] // 0' "$STATE_FILE")
  [[ "$last_ts" == "null" ]] && last_ts=0
  local delta=$(( now_ts - last_ts ))
  if (( delta >= COOLDOWN_SECONDS )); then
    return 0
  fi
  return 1
}

record_check() {
  local bead_id="$1"
  local now_ts
  now_ts=$(date +%s)
  jq --arg id "$bead_id" --argjson t "$now_ts" '.[$id] = $t' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

log "Starting. interval=${INTERVAL_SECONDS}s cooldown=${COOLDOWN_SECONDS}s"

while true; do
  if [[ -d "$MAIL_DIR" ]]; then
    mapfile -t bead_ids < <(discover_bead_ids)
    for bid in "${bead_ids[@]:-}"; do
      [[ -z "$bid" ]] && continue
      if should_check "$bid"; then
        log "Running audit-guard for $bid"
        bash "$SCRIPT_DIR/audit-guard.sh" --bead-id "$bid" || log "audit-guard failed for $bid"
        record_check "$bid"
      fi
    done
  else
    log "Mail dir not found ($MAIL_DIR); sleeping"
  fi
  sleep "$INTERVAL_SECONDS"
done

