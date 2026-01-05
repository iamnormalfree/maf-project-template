#!/bin/bash

# Context Manager v2 for TMUX Agents with Memlayer Integration
# Monitors context usage, preserves state in Memlayer + Agent Mail, and restarts agents

set -e

# Configuration
CONTEXT_THRESHOLD="${MAF_CONTEXT_THRESHOLD:-40}"  # Restart when <40% context remains
CHECK_INTERVAL=300   # Check every 5 minutes
IDLE_NUDGE_SECONDS="${MAF_IDLE_NUDGE_SECONDS:-600}"
IDLE_NUDGE_COOLDOWN="${MAF_IDLE_NUDGE_COOLDOWN:-900}"
REASONING_LEVEL_CHOICE="${MAF_REASONING_LEVEL_CHOICE:-3}"
LOG_FILE="/tmp/agent-context-manager-v2.log"
STATE_DIR="/tmp/agent-states"
AGENT_MAIL_PROJECT="/root/projects/roundtable"
AGENT_WINDOW="${MAF_AGENT_WINDOW:-agents}"
CHECK_RESPONSIVE="${MAF_CONTEXT_CHECK_RESPONSIVE:-false}"
AGENT_MAIL_FETCH_SCRIPT="/root/projects/roundtable/scripts/maf/agent-mail-fetch.sh"

# Memlayer integration
MEMORY_SCRIPT="/root/projects/roundtable/scripts/maf/agent-memory.sh"

# Create state directory
mkdir -p "$STATE_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

normalize_agent_label() {
    printf '%s' "$1" | tr '[:space:]' '_' | tr -c 'A-Za-z0-9._-' '_'
}

# Get agent name from topology config
get_agent_name_from_topology() {
    local pane_index="$1"
    local topology_file="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

    if [ ! -f "$topology_file" ]; then
        return 1
    fi

    local agent_name=$(jq -r ".panes[] | select(.index == $pane_index) | .agent_name // empty" "$topology_file" 2>/dev/null)
    if [ -n "$agent_name" ] && [ "$agent_name" != "null" ]; then
        echo "$agent_name"
        return 0
    fi
    return 1
}

# Get agent role from topology config
get_agent_role_from_topology() {
    local pane_index="$1"
    local topology_file="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

    if [ ! -f "$topology_file" ]; then
        return 1
    fi

    local role=$(jq -r ".panes[] | select(.index == $pane_index) | .role // empty" "$topology_file" 2>/dev/null)
    if [ -n "$role" ] && [ "$role" != "null" ]; then
        echo "$role"
        return 0
    fi
    return 1
}

# Get restart command from topology config or env
get_restart_command_from_topology() {
    local pane_index="$1"
    local topology_file="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

    # First try topology config (if it has start_cmd)
    if [ -f "$topology_file" ]; then
        local start_cmd=$(jq -r ".panes[] | select(.index == $pane_index) | .start_cmd // empty" "$topology_file" 2>/dev/null)
        if [ -n "$start_cmd" ] && [ "$start_cmd" != "null" ]; then
            echo "$start_cmd"
            return 0
        fi
    fi

    # Prefer explicit restart commands (for context-manager triggered restarts)
    case "$pane_index" in
        0)
            if [ -n "${MAF_SUPERVISOR_RESTART_CMD:-}" ]; then
                echo "${MAF_SUPERVISOR_RESTART_CMD}"
                return 0
            fi
            ;;
        1)
            if [ -n "${MAF_REVIEWER_RESTART_CMD:-}" ]; then
                echo "${MAF_REVIEWER_RESTART_CMD}"
                return 0
            fi
            ;;
        2)
            if [ -n "${MAF_IMPLEMENTOR_1_RESTART_CMD:-}" ]; then
                echo "${MAF_IMPLEMENTOR_1_RESTART_CMD}"
                return 0
            fi
            ;;
        3)
            if [ -n "${MAF_IMPLEMENTOR_2_RESTART_CMD:-}" ]; then
                echo "${MAF_IMPLEMENTOR_2_RESTART_CMD}"
                return 0
            fi
            ;;
    esac

    # Fallback to base commands (for initial startup or if restart cmds not set)
    case "$pane_index" in
        0) echo "${MAF_SUPERVISOR_CMD:-claude}" ;;
        1) echo "${MAF_REVIEWER_CMD:-claude}" ;;
        2|3) echo "${MAF_IMPLEMENTOR_CMD:-claude --settings /root/projects/roundtable/.claude}" ;;
        *) echo "${MAF_DEFAULT_AGENT_CMD:-claude --settings /root/projects/roundtable/.claude}" ;;
    esac
    return 0
}

# Get worktree path for implementor pane (if worktree exists)
get_worktree_path_for_pane() {
    local pane_index="$1"
    local topology_file="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"

    if [ ! -f "$topology_file" ]; then
        return 1
    fi

    # Check if worktrees section exists and has entry for this pane
    local worktree_path=$(jq -r ".worktrees[\"$pane_index\"].path // empty" "$topology_file" 2>/dev/null)

    if [ -n "$worktree_path" ] && [ "$worktree_path" != "null" ] && [ -d "$worktree_path" ]; then
        echo "$worktree_path"
        return 0
    fi

    return 1
}

agent_name_for_pane() {
    local session_name="$1"
    local pane_id="$2"
    local pane_index
    pane_index=$(echo "$pane_id" | cut -d. -f2)
    if [[ "$session_name" == "${MAF_TMUX_SESSION:-maf-cli}" ]]; then
        # Try topology config first
        local agent_name=$(get_agent_name_from_topology "$pane_index")
        if [ -n "$agent_name" ]; then
            echo "$agent_name"
            return
        fi

        # Fallback to hardcoded mapping
        case "$pane_index" in
            0) echo "GreenMountain" ;;
            1) echo "BlackDog" ;;
            2) echo "OrangePond" ;;
            3) echo "FuchsiaCreek" ;;
            *) normalize_agent_label "${session_name}_${pane_id}" ;;
        esac
        return
    fi
    normalize_agent_label "${session_name}_${pane_id}"
}

team_name_for_session() {
    local session_name="$1"
    normalize_agent_label "team_${session_name}"
}

agent_restart_command() {
    local pane_id="$1"
    local pane_index=$(echo "$pane_id" | cut -d. -f2)

    # Try topology config first, then fallback to env vars
    get_restart_command_from_topology "$pane_index"
}

# Get all agent panes (exclude control/status)
get_agent_panes() {
    local session="${MAF_TMUX_SESSION:-maf-cli}"
    local window="$AGENT_WINDOW"
    tmux list-panes -t "${session}:${window}" -F '#S:#I.#P' 2>/dev/null || echo ""
}

# Check if agent is responding
is_agent_responsive() {
    local pane=$1
    if [[ "$CHECK_RESPONSIVE" != "true" ]]; then
        return 0
    fi
    # Try to send a simple command and check if it's processed
    tmux send-keys -t "$pane" -l 'echo "AGENT_ALIVE"'
    tmux send-keys -t "$pane" Enter

    # Give it 2 seconds to respond
    sleep 2

    # Check last line of pane buffer for our marker
    local last_line=$(tmux capture-pane -t "$pane" -p | tail -1)
    if [[ "$last_line" == *"AGENT_ALIVE"* ]]; then
        return 0
    else
        return 1
    fi
}

# Estimate context usage with better heuristics
estimate_context_usage() {
    local pane=$1
    local history_size=$(tmux display-message -t "$pane" -p '#{history_size}')

    # Rough estimate: each line ~50 tokens on average
    # Adjust based on observed behavior
    local tokens_per_line=${MAF_CONTEXT_TOKENS_PER_LINE:-30}
    local estimated_tokens=$((history_size * tokens_per_line))

    # Context window varies by model (e.g., 100k for Claude 3.5)
    # Using configurable estimate
    local max_tokens=${MAF_CONTEXT_MAX_TOKENS:-160000}
    local usage_percent=$((estimated_tokens * 100 / max_tokens))

    echo $usage_percent
}

is_default_prompt_text() {
    local text="$1"
    if [[ -z "$text" ]]; then
        return 1
    fi
    local lower="${text,,}"
    case "$lower" in
        "explain this codebase"|\
        "find and fix a bug in @filename"|\
        "write tests for @filename"|\
        "improve documentation in @filename"|\
        "summarize recent commits"|\
        "implement {feature}"|\
        "review the restored context above and continue"*)
            return 0
            ;;
    esac
    if [[ "$lower" == *"@filename"* ]]; then
        return 0
    fi
    if [[ "$lower" == *"{feature}"* ]]; then
        return 0
    fi
    if [[ "$lower" == try\ \"*\" ]]; then
        if [[ "$lower" == *"<"* && "$lower" == *">"* ]]; then
            return 0
        fi
    fi
    return 1
}

auto_select_reasoning_level() {
    local pane=$1
    local choice="${2:-3}"
    local snapshot
    snapshot=$(tmux capture-pane -t "$pane" -p -S -40 | tail -n 40)
    if echo "$snapshot" | grep -qi "Select Reasoning Level"; then
        tmux send-keys -t "$pane" "$choice"
        tmux send-keys -t "$pane" Enter
        sleep 0.6
    fi
}

get_prompt_input_text() {
    local pane=$1
    local prompt_line
    prompt_line=$(tmux capture-pane -t "$pane" -p -S -30 | awk '/^[[:space:]]*[>›]/ {line=$0} END {print line}')
    prompt_line=$(echo "$prompt_line" | sed -E $'s/\x1B\\[[0-9;?]*[ -/]*[@-~]//g; s/\xC2\xA0/ /g')
    if [[ -z "$prompt_line" ]]; then
        echo ""
        return
    fi

    # Strip trailing "send" helper text if present.
    local stripped
    stripped=$(echo "$prompt_line" | sed -E 's/[[:space:]]+↵[[:space:]]*send[[:space:]]*$//; s/[[:space:]]+send[[:space:]]*$//')

    # Extract text after prompt symbol.
    local prompt_text
    prompt_text=$(echo "$stripped" | sed -E 's/^[[:space:]]*[>›][[:space:]]*//')
    prompt_text=$(echo "$prompt_text" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    if [[ -z "$prompt_text" ]]; then
        echo ""
        return
    fi
    if [[ "$prompt_text" != "$stripped" ]]; then
        if is_default_prompt_text "$prompt_text"; then
            echo ""
            return
        fi
        echo "$prompt_text"
        return
    fi

    echo ""
}

# Check if agent is busy based on MAF_STATUS marker
# Returns: "busy" if recent MAF_STATUS with safe_to_interrupt=0, "idle" otherwise
# Also exports: MAF_STATUS_ROLE, MAF_STATUS_BEAD, MAF_STATUS_PHASE, MAF_STATUS_SAFE
check_agent_maf_status() {
    local pane=$1
    local lookback_lines=100  # Check last 100 lines for status marker

    # Capture pane history and look for MAF_STATUS
    local history
    history=$(tmux capture-pane -t "$pane" -p -S -"$lookback_lines")

    # Get most recent MAF_STATUS line
    local latest_status=$(echo "$history" | grep -oE "MAF_STATUS.*" | tail -1)

    # Parse MAF_STATUS components for monitoring/dashboard
    if [[ -n "$latest_status" ]]; then
        # Extract role (e.g., "role=supervisor")
        local role=$(echo "$latest_status" | grep -oP 'role=\K[^ ]+' || echo "unknown")
        # Extract bead (e.g., "bead=roundtable-xxx" or "bead=none")
        local bead=$(echo "$latest_status" | grep -oP 'bead=\K[^ ]+' || echo "none")
        # Extract phase (e.g., "phase=reading")
        local phase=$(echo "$latest_status" | grep -oP 'phase=\K[^ ]+' || echo "unknown")
        # Extract safe flag (0 or 1)
        local safe=$(echo "$latest_status" | grep -oP 'safe_to_interrupt=\K[01]' || echo "1")

        # Export for use in monitoring/dashboard
        export MAF_STATUS_ROLE="$role"
        export MAF_STATUS_BEAD="$bead"
        export MAF_STATUS_PHASE="$phase"
        export MAF_STATUS_SAFE="$safe"

        # Check if busy (safe_to_interrupt=0)
        if [[ "$safe" == "0" ]]; then
            echo "busy"
            return
        fi
    fi

    # Clear exports if no status found
    export MAF_STATUS_ROLE="unknown"
    export MAF_STATUS_BEAD="none"
    export MAF_STATUS_PHASE="unknown"
    export MAF_STATUS_SAFE="1"

    echo "idle"
}

get_pane_idle_age() {
    local pane=$1
    local pane_id
    pane_id=$(echo "$pane" | cut -d: -f2 | tr '.:' '__')
    local now_ts
    now_ts=$(date +%s)

    local snapshot
    snapshot=$(tmux capture-pane -t "$pane" -p -S -60 | tail -n 20)
    local hash_cmd
    if command -v sha1sum >/dev/null 2>&1; then
        hash_cmd="sha1sum"
    elif command -v md5sum >/dev/null 2>&1; then
        hash_cmd="md5sum"
    else
        hash_cmd="cksum"
    fi
    local hash
    hash=$(printf "%s" "$snapshot" | $hash_cmd | awk '{print $1}')

    local state_file="/tmp/maf-pane-${pane_id}.state"
    if [[ -f "$state_file" ]]; then
        local last_hash last_ts
        read -r last_hash last_ts < "$state_file" || true
        if [[ "$hash" != "$last_hash" ]]; then
            echo "$hash $now_ts" > "$state_file"
            echo 0
            return
        fi
        if [[ "$last_ts" =~ ^[0-9]+$ ]]; then
            echo $((now_ts - last_ts))
            return
        fi
    fi

    echo "$hash $now_ts" > "$state_file"
    echo 0
}

should_nudge_again() {
    local pane_id="$1"
    local now_ts
    now_ts=$(date +%s)
    local state_file="/tmp/maf-idle-nudge-${pane_id//[:\/]/_}.ts"
    if [[ -f "$state_file" ]]; then
        local last_ts
        last_ts=$(cat "$state_file" 2>/dev/null || echo 0)
        if [[ "$last_ts" =~ ^[0-9]+$ ]]; then
            local elapsed=$((now_ts - last_ts))
            if [[ $elapsed -lt $IDLE_NUDGE_COOLDOWN ]]; then
                return 1
            fi
        fi
    fi
    echo "$now_ts" > "$state_file"
    return 0
}

build_idle_nudge_prompt() {
    local pane_id="$1"
    local pane_index
    pane_index=$(echo "$pane_id" | cut -d. -f2)

    local agent_name="agent"
    local agent_role="unknown"

    # Try to get role and name from topology config
    local topology_file="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"
    if [ -f "$topology_file" ]; then
        local topology_name=$(jq -r ".panes[] | select(.index == $pane_index) | .agent_name // empty" "$topology_file" 2>/dev/null)
        local topology_role=$(jq -r ".panes[] | select(.index == $pane_index) | .role // empty" "$topology_file" 2>/dev/null)
        if [ -n "$topology_name" ] && [ "$topology_name" != "null" ]; then
            agent_name="$topology_name"
        fi
        if [ -n "$topology_role" ] && [ "$topology_role" != "null" ]; then
            agent_role="$topology_role"
        fi
    fi

    # Fallback to hardcoded mapping if topology not available
    if [ "$agent_name" == "agent" ]; then
        case "$pane_index" in
            0) agent_name="GreenMountain"; agent_role="supervisor" ;;
            1) agent_name="BlackDog"; agent_role="reviewer" ;;
            2) agent_name="OrangePond"; agent_role="implementor" ;;
            3) agent_name="FuchsiaCreek"; agent_role="implementor" ;;
        esac
    fi

    local base_prompt="Idle check: run mcp__mcp_agent_mail__fetch_inbox (agent_name=${agent_name}), then "

    case "$agent_role" in
        supervisor)
            echo "${base_prompt}check for plans to implement. Use /plan-to-beads docs/plans/<plan>.md to convert plans to beads, then bd ready or check Agent Mail. For complex analysis or decisions, use ultrathink."
            ;;
        reviewer)
            echo "${base_prompt}bd ready or check Agent Mail. For complex analysis or decisions, use ultrathink."
            ;;
        implementor|implementor-1|implementor-2)
            echo "${base_prompt}bd ready. CRITICAL: When you pick a bead, ALWAYS start with: /response-awareness \"Implement bead [id]: [title from bd show]\""
            ;;
        *)
            echo "${base_prompt}bd ready."
            ;;
    esac
}

prompt_contains_text() {
    local pane=$1
    local needle="$2"
    tmux capture-pane -t "$pane" -p -S -30 | awk '/^[[:space:]]*[>›]/ {print}' | grep -Fq "$needle"
}

send_prompt_with_retry() {
    local pane=$1
    local message="$2"

    tmux send-keys -t "$pane" -l "$message"
    sleep 0.8
    tmux send-keys -t "$pane" C-m
    sleep 0.8

    local pending
    pending=$(get_prompt_input_text "$pane")
    if [[ -n "$pending" && "$pending" == *"$message"* ]] || prompt_contains_text "$pane" "Idle check:"; then
        tmux send-keys -t "$pane" C-m
        sleep 0.6
        pending=$(get_prompt_input_text "$pane")
        if [[ -n "$pending" ]]; then
            tmux send-keys -t "$pane" C-u
        fi
    fi
}

# Enhanced save using both Memlayer and Agent Mail
save_agent_state() {
    local pane=$1
    local session_name=$(echo "$pane" | cut -d: -f1)
    local pane_id=$(echo "$pane" | cut -d: -f2)

    log "Saving state for agent $pane using Memlayer + Agent Mail"

    # Extract agent name from session or environment
    local agent_name
    local agent_team
    agent_name=$(agent_name_for_pane "$session_name" "$pane_id")
    agent_team=$(team_name_for_session "$session_name")

    # Set AGENT_NAME for memory script
    export AGENT_NAME="$agent_name"
    export AGENT_TEAM="$agent_team"

    local current_task="none"
    current_task=$(bd list --status in_progress --json 2>/dev/null | jq -r '.[-1].id // "none"' 2>/dev/null || echo "none")

    # Capture pane context once (used for memory + fallback file storage)
    local context
    context=$(tmux capture-pane -t "$pane" -p -S -2000 2>/dev/null || echo "")
    if [[ -z "$context" ]]; then
        context="No context captured"
    fi

    # 1. Save to Memlayer via agent-memory script (with 30s timeout to prevent blocking)
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        log "Storing context via memory service (Memlayer + fallback)..."
        if ! printf '%s' "$context" | timeout 30s "$MEMORY_SCRIPT" store >/dev/null 2>&1; then
            log "Warning: Failed or timeout storing context in Memlayer (continuing restart)"
        fi

        # Store a summary message (with 10s timeout)
        if ! timeout 10s $MEMORY_SCRIPT store "Agent $agent_name context saved at $(date) - session: $session_name, pane: $pane_id" 2>/dev/null; then
            log "Warning: Failed or timeout storing Memlayer summary for $agent_name"
        fi

        local beads_started=""
        local beads_ready=""
        beads_started=$(bd list --status in_progress --json 2>/dev/null | head -c 4000 || true)
        beads_ready=$(bd ready --json 2>/dev/null | head -c 4000 || true)

        if [[ -n "$beads_started$beads_ready" ]]; then
            if ! timeout 10s $MEMORY_SCRIPT store "Beads snapshot at $(date):\nCurrent task: $current_task\nStarted: $beads_started\nReady: $beads_ready" 2>/dev/null; then
                log "Warning: Failed or timeout storing Beads snapshot for $agent_name"
            fi
        fi

        if command -v bv >/dev/null 2>&1; then
            local bv_snapshot=""
            bv_snapshot=$(bv --robot-triage 2>/dev/null | head -c 4000 || true)
            if [[ -n "$bv_snapshot" ]]; then
                if ! timeout 10s $MEMORY_SCRIPT store "Beads viewer triage snapshot (bv --robot-triage):\n$bv_snapshot" 2>/dev/null; then
                    log "Warning: Failed or timeout storing Beads viewer snapshot for $agent_name"
                fi
            fi
        fi
    else
        log "Warning: agent-memory script not found, using fallback method"
    fi

    # 2. Fallback file storage (always)
    echo "$context" > "$STATE_DIR/${session_name}_${pane_id}_context.txt"
    echo "$current_task" > "$STATE_DIR/${session_name}_${pane_id}_task.txt"
}

# Enhanced restore with Memlayer
restart_agent() {
    local pane=$1
    local session_name=$(echo "$pane" | cut -d: -f1)
    local pane_id=$(echo "$pane" | cut -d: -f2)
    local restart_cmd
    restart_cmd=$(agent_restart_command "$pane_id")

    log "Restarting agent $pane with Memlayer restore"

    # Respawn in the same pane to preserve layout
    tmux respawn-pane -t "$pane" -k "bash"
    sleep 0.5

    # Extract agent name for memory restore
    local agent_name
    local agent_team
    agent_name=$(agent_name_for_pane "$session_name" "$pane_id")
    agent_team=$(team_name_for_session "$session_name")
    export AGENT_NAME="$agent_name"
    export AGENT_TEAM="$agent_team"

    # Send restoration sequence
    tmux send-keys -t "$pane" -l "echo '=== AGENT RESTARTED WITH MEMLAYER RESTORE ==='"
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Restore from Memlayer if available
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        log "Restoring context from Memlayer..."
        tmux send-keys -t "$pane" -l "$MEMORY_SCRIPT restore"
        tmux send-keys -t "$pane" Enter
        sleep 1
    fi

    # Check and display current task
    if [[ -f "$STATE_DIR/${session_name}_${pane_id}_task.txt" ]]; then
        local task=$(cat "$STATE_DIR/${session_name}_${pane_id}_task.txt" 2>/dev/null || echo "none")
        tmux send-keys -t "$pane" -l "echo 'Previous task: $task'"
        tmux send-keys -t "$pane" Enter
    fi

    # Fetch unread messages from Agent Mail (non-interactive)
    if [[ -x "$AGENT_MAIL_FETCH_SCRIPT" ]]; then
        tmux send-keys -t "$pane" -l "$AGENT_MAIL_FETCH_SCRIPT '$agent_name'"
        tmux send-keys -t "$pane" Enter
        sleep 0.8
    fi

    # Get ready work
    tmux send-keys -t "$pane" -l "bd ready --json | head -5"
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Change to worktree directory if applicable (implementors only)
    local pane_index=$(echo "$pane_id" | cut -d. -f2)
    local worktree_path=$(get_worktree_path_for_pane "$pane_index")

    if [[ -n "$worktree_path" ]]; then
        log "Changing to worktree for pane $pane_index: $worktree_path"
        tmux send-keys -t "$pane" -l "cd '$worktree_path' && pwd"
        tmux send-keys -t "$pane" Enter
        sleep 0.5
    fi

    # Start agent command
    if [[ -n "$restart_cmd" ]]; then
        # If in worktree, prepend cd to worktree before restart command
        if [[ -n "$worktree_path" ]]; then
            tmux send-keys -t "$pane" -l "cd '$worktree_path' && $restart_cmd"
        else
            tmux send-keys -t "$pane" -l "$restart_cmd"
        fi
        tmux send-keys -t "$pane" Enter
        sleep 1
        auto_select_reasoning_level "$pane" "$REASONING_LEVEL_CHOICE"
    fi

    # Resume prompt for agent interface
    log "Agent $agent_name restarted with context restoration"
}

# Monitor agent with enhanced checks
monitor_agent() {
    local pane=$1

    # Check if responsive
    if ! is_agent_responsive "$pane"; then
        log "Agent $pane not responsive, restarting with memory preservation..."
        save_agent_state "$pane"
        restart_agent "$pane"
        return
    fi

    # Check context usage
    local usage=$(estimate_context_usage "$pane")
    if [[ $usage -gt $((100 - CONTEXT_THRESHOLD)) ]]; then
        local threshold=$((100 - CONTEXT_THRESHOLD))
        log "Agent $pane context usage: ${usage}% (> ${threshold}%), restarting with memory preservation..."
        save_agent_state "$pane"
        restart_agent "$pane"
        return
    fi

    # Check if idle (hash-based fallback to avoid tmux format gaps)
    local activity_age
    activity_age=$(get_pane_idle_age "$pane")

    if [[ $activity_age -gt $IDLE_NUDGE_SECONDS ]]; then  # default 10 minutes idle
        log "Agent $pane idle for ${activity_age}s, checking for messages..."

        # Check MAF_STATUS to avoid interrupting busy agents
        local maf_status
        maf_status=$(check_agent_maf_status "$pane")
        if [[ "$maf_status" == "busy" ]]; then
            log "Skipping idle nudge for $pane (MAF_STATUS: safe_to_interrupt=0)"
            return
        fi

        local pending_input
        pending_input=$(get_prompt_input_text "$pane")
        if [[ -n "$pending_input" ]]; then
            tmux send-keys -t "$pane" Enter
            sleep 0.5
            pending_input=$(get_prompt_input_text "$pane")
            if [[ -n "$pending_input" ]]; then
                tmux send-keys -t "$pane" C-u
            fi
            log "Skipping idle nudge for $pane (pending input detected)"
            return
        fi

        if ! should_nudge_again "$pane"; then
            log "Skipping idle nudge for $pane (cooldown active)"
            return
        fi

        # Nudge with memory check
        local session_name=$(echo "$pane" | cut -d: -f1)
        local pane_id=$(echo "$pane" | cut -d: -f2)
        local agent_name
        local agent_team
        agent_name=$(agent_name_for_pane "$session_name" "$pane_id")
        agent_team=$(team_name_for_session "$session_name")
        export AGENT_NAME="$agent_name"
        export AGENT_TEAM="$agent_team"

        log "Idle auto-fetch: Agent Mail + bd ready for $agent_name"
        if [[ -x "$AGENT_MAIL_FETCH_SCRIPT" ]]; then
            tmux send-keys -t "$pane" -l "$AGENT_MAIL_FETCH_SCRIPT '$agent_name'"
            tmux send-keys -t "$pane" Enter
            sleep 0.8
        fi
        tmux send-keys -t "$pane" -l "bd ready | head -20"
        tmux send-keys -t "$pane" Enter
    fi
}

# Main monitoring loop with Memlayer status
main() {
    log "Starting Agent Context Manager v2 with Memlayer integration"

    # Check if Memlayer is available
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        log "Memlayer integration: ENABLED"
    else
        log "Memlayer integration: DISABLED (script not found)"
    fi

    while true; do
        log "Checking agent states..."

        local agent_count=0
        local restart_count=0

        for pane in $(get_agent_panes); do
            agent_count=$((agent_count + 1))

            # Check if agent needs restart
            local usage=$(estimate_context_usage "$pane")
            local responsive=true

            if ! is_agent_responsive "$pane"; then
                responsive=false
            fi

            if [[ "$responsive" == false ]] || [[ $usage -gt $((100 - CONTEXT_THRESHOLD)) ]]; then
                restart_count=$((restart_count + 1))
            fi

            monitor_agent "$pane"
        done

        log "Checked $agent_count agents, restarted $restart_count"

        # Cleanup old state files
        find "$STATE_DIR" -name "*.txt" -mtime +1 -delete 2>/dev/null || true

        log "Sleeping for $CHECK_INTERVAL seconds..."
        sleep $CHECK_INTERVAL
    done
}

# Start monitoring in background
start_monitor() {
    if [[ -f /tmp/context-manager-v2.pid ]]; then
        local pid=$(cat /tmp/context-manager-v2.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "Context manager v2 already running (PID $pid)"
            exit 1
        fi
        rm -f /tmp/context-manager-v2.pid
    fi

    if pgrep -f "context-manager-v2.sh monitor" > /dev/null; then
        echo "Context manager v2 already running"
        exit 1
    fi

    echo "Starting context manager v2 daemon with Memlayer..."
    nohup "$0" monitor > /dev/null 2>&1 &
    echo $! > /tmp/context-manager-v2.pid
    echo "Started with PID $(cat /tmp/context-manager-v2.pid)"
}

# Stop monitoring
stop_monitor() {
    if [[ -f /tmp/context-manager-v2.pid ]]; then
        local pid=$(cat /tmp/context-manager-v2.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "Stopped context manager v2 (PID $pid)"
        fi
        rm -f /tmp/context-manager-v2.pid
    fi
}

# Status check with Memlayer info
status_check() {
    echo "=== Agent Context Manager v2 Status ==="
    local detailed="${MAF_CONTEXT_STATUS_DETAILED:-false}"
    local service_name="roundtable-maf-context-manager"
    local systemd_active="false"

    if command -v systemctl >/dev/null 2>&1; then
        if systemctl is-active --quiet "$service_name"; then
            systemd_active="true"
        fi
    fi

    if [[ -f /tmp/context-manager-v2.pid ]]; then
        local pid=$(cat /tmp/context-manager-v2.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "Status: RUNNING (PID $pid)"
            echo "Last check: $(tail -1 "$LOG_FILE" 2>/dev/null || echo 'Never')"
        else
            if [[ "$systemd_active" == "true" ]]; then
                echo "Status: RUNNING (systemd)"
                echo "Last check: $(tail -1 "$LOG_FILE" 2>/dev/null || echo 'Never')"
            else
                echo "Status: NOT RUNNING (stale PID file)"
            fi
        fi
    else
        if [[ "$systemd_active" == "true" ]]; then
            echo "Status: RUNNING (systemd)"
            echo "Last check: $(tail -1 "$LOG_FILE" 2>/dev/null || echo 'Never')"
        else
            echo "Status: NOT RUNNING"
        fi
    fi

    echo ""
    echo "Memlayer Status:"
    if [[ -x "$MEMORY_SCRIPT" ]]; then
        echo "  Integration: ENABLED"
        echo "  Memory script: $MEMORY_SCRIPT"
    else
        echo "  Integration: DISABLED"
    fi

    echo ""
    echo "Active agent panes:"
    get_agent_panes | while read pane; do
        local usage=$(estimate_context_usage "$pane")
        local responsive="UNKNOWN"
        if [[ "$detailed" == "true" ]]; then
            responsive="YES"
            if ! is_agent_responsive "$pane"; then
                responsive="NO"
            fi
        fi

        # Get pane index and lookup role/name from topology
        local pane_index=$(echo "$pane" | cut -d. -f2)
        local agent_name=$(get_agent_name_from_topology "$pane_index" 2>/dev/null || echo "Unknown")
        local agent_role=$(get_agent_role_from_topology "$pane_index" 2>/dev/null || echo "unknown")

        echo "  $pane - ${agent_role} (${agent_name}) - Context: ${usage}% - Responsive: $responsive"
    done
}

# CLI argument handling
case "${1:-}" in
    "monitor")
        main
        ;;
    "start")
        start_monitor
        ;;
    "stop")
        stop_monitor
        ;;
    "status")
        status_check
        ;;
    "check-now")
        for pane in $(get_agent_panes); do
            monitor_agent "$pane"
        done
        ;;
    *)
        echo "Usage: $0 {start|stop|status|monitor|check-now}"
        echo "  start     - Start monitoring daemon with Memlayer"
        echo "  stop      - Stop monitoring daemon"
        echo "  status    - Show status with Memlayer info"
        echo "  monitor   - Run monitoring in foreground"
        echo "  check-now - Check all agents immediately"
        exit 1
        ;;
esac
