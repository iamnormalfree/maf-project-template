#!/usr/bin/env bash
# Enhanced tmux agent monitor with detailed feedback
# Reads pane configuration from canonical topology config

set -euo pipefail

SESSION_NAME="${MAF_TMUX_SESSION:-maf-cli}"
WINDOW_NAME="${MAF_AGENT_WINDOW:-agents}"
TOPOLOGY_FILE="${MAF_TOPOLOGY_FILE:-/root/projects/roundtable/.maf/config/agent-topology.json}"
LOG_DIR="/root/projects/roundtable/.agent-mail"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MONITOR_LOG="${LOG_DIR}/tmux-monitor-${TIMESTAMP}.log"
OUTPUT_FORMAT="terminal"
PROMPT_PATTERN="Supervisor:|Reviewer:|Implementor|check Agent Mail|Claim bead|Resume bead|Reserve relevant paths|Suggested picks"
BACKTICK=$'\x60'
CODE_FENCE='```'
SINGLE_QUOTE="'"

# Read topology config and build pane arrays
build_pane_arrays() {
  local panes=()
  local pane_names=()

  # Try to read from topology config
  if [ -f "$TOPOLOGY_FILE" ]; then
    # Read panes from topology config, sorted by index
    local pane_count=$(jq '.panes | length' "$TOPOLOGY_FILE" 2>/dev/null)
    if [ -n "$pane_count" ] && [ "$pane_count" != "0" ]; then
      for ((i=0; i<pane_count; i++)); do
        local pane_index=$(jq -r ".panes[$i].index" "$TOPOLOGY_FILE" 2>/dev/null)
        local role=$(jq -r ".panes[$i].role // empty" "$TOPOLOGY_FILE" 2>/dev/null)
        local agent_name=$(jq -r ".panes[$i].agent_name // empty" "$TOPOLOGY_FILE" 2>/dev/null)

        if [ -n "$pane_index" ]; then
          panes+=("0.${pane_index}")
          # Build display name from role and agent_name
          if [ -n "$role" ] && [ -n "$agent_name" ]; then
            # Capitalize first letter of role and add agent name
            local role_display=$(echo "$role" | sed 's/\b\(.\)/\u\1/g')
            pane_names+=("${role_display} (${agent_name})")
          else
            pane_names+=("Agent ${pane_index}")
          fi
        fi
      done
    fi
  fi

  # Fallback to hardcoded defaults if topology config not found or empty
  if [ ${#panes[@]} -eq 0 ]; then
    panes=("0.0" "0.1" "0.2" "0.3")
    pane_names=("Supervisor (GreenMountain)" "Reviewer (BlackDog)" "Implementor-1 (OrangePond)" "Implementor-2 (FuchsiaCreek)")
  fi

  # Export arrays for use in functions
  printf '%s\n' "${panes[@]}"
  printf '%s\n' "${pane_names[@]}"
}

# Build pane arrays (call once at script start)
PANE_ARRAY_OUTPUT=$(build_pane_arrays)
PANE_LINES=$(echo "$PANE_ARRAY_OUTPUT" | head -4)
PANE_NAME_LINES=$(echo "$PANE_ARRAY_OUTPUT" | tail -4)

# Convert to arrays for use in functions
get_pane_array() {
  echo "$PANE_LINES"
}

get_pane_names_array() {
  echo "$PANE_NAME_LINES"
}

is_placeholder_line() {
    local line="$1"
    case "$line" in
        *"Find and fix a bug in @filename"*|\
        *"Explain this codebase"*|\
        *"Improve documentation in @filename"*|\
        *"Summarize recent commits"*|\
        *"Implement {feature}"*|\
        *"Review the restored context above and continue"*|\
        *"Try \"refactor <filepath>\""*|\
        *"Try \"how does <filepath> work?\""*|\
        *"Try \"write a test for <filepath>\""*|\
        *"Try \"create a util "*|\
        *"Try \""*"<"*">"* ) return 0 ;;
    esac
    return 1
}

is_noise_line() {
    local line="$1"
    case "$line" in
        Tip:*|\
        /model\ to\ *|\
        model:*|\
        directory:*|\
        *"context left"*|\
        *"OpenAI Codex"*|\
        *"Claude Code v"*|\
        *"API Usage Billing"*|\
        *"~/projects/roundtable"*|\
        slash-commands#* ) return 0 ;;
    esac

    if [[ "$line" =~ ^[[:space:]]*\"[A-Za-z0-9_-]+\"[[:space:]]*: ]]; then
        return 0
    fi

    if [[ "$line" =~ ^[[:space:]]*[\{\}\[\],]+[[:space:]]*$ ]]; then
        return 0
    fi

    if [[ "$line" =~ ^[[:space:]]*[╭╰│].* ]]; then
        return 0
    fi

    if [[ "$line" =~ ^[─-]{5,}$ ]]; then
        return 0
    fi

    local compact
    compact=$(echo "$line" | tr -d '[:space:]')
    if [[ "$compact" == ">" || "$compact" == "›" ]]; then
        return 0
    fi

    return 1
}

sanitize_line() {
    local line="$1"
    # Strip ANSI escape sequences and carriage returns.
    line=$(echo "$line" | sed -E $'s/\x1B\\[[0-9;?]*[ -/]*[@-~]//g')
    # Strip non-breaking spaces that show up in tmux prompt placeholders.
    line=$(echo "$line" | sed -E $'s/\xC2\xA0//g')
    line=$(echo "$line" | tr -d '\r')
    echo "$line"
}

get_recent_activity_lines() {
    local history="$1"
    local count="$2"
    local lines=()

    while IFS= read -r line; do
        local trimmed_line
        line=$(sanitize_line "$line")
        trimmed_line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ -z "$trimmed_line" ]]; then
            continue
        fi
        if is_noise_line "$trimmed_line" || is_placeholder_line "$trimmed_line"; then
            continue
        fi
        lines+=("$trimmed_line")
    done <<< "$history"

    local total=${#lines[@]}
    if (( total == 0 )); then
        echo ""
        return 0
    fi

    local start=$(( total > count ? total - count : 0 ))
    for (( i=start; i<total; i++ )); do
        echo "${lines[$i]}"
    done
}

get_last_non_placeholder_line() {
    local history="$1"
    local line
    while IFS= read -r line; do
        local trimmed_line
        line=$(sanitize_line "$line")
        trimmed_line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ -z "$trimmed_line" ]]; then
            continue
        fi
        if is_noise_line "$trimmed_line" || is_placeholder_line "$trimmed_line"; then
            continue
        fi
        echo "$trimmed_line"
        return 0
    done < <(echo "$history" | tac)

    echo "(idle)"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Check for MAF_STATUS marker in history
# Returns: "busy" if recent MAF_STATUS with safe_to_interrupt=0, "idle" otherwise
check_maf_status() {
    local history="$1"
    local lookback_lines=50  # Check last 50 lines for status marker

    # Extract last N lines and look for MAF_STATUS
    local status_line=$(echo "$history" | tail -"$lookback_lines" | grep -E "MAF_STATUS.*safe_to_interrupt=0" | tail -1)

    if [[ -n "$status_line" ]]; then
        echo "busy"
    else
        echo "idle"
    fi
}

# Ensure log directory exists
mkdir -p "$LOG_DIR"

log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $level: $message" >> "$MONITOR_LOG"
}

# Check if session exists
check_session() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        print_status $RED "❌ No tmux session '$SESSION_NAME' found"
        log_message "ERROR" "Session $SESSION_NAME not found"
        return 1
    fi
    log_message "INFO" "Session $SESSION_NAME found"
    return 0
}

# Get pane information
get_pane_info() {
    local output=""
    local panes=$(tmux list-panes -t "${SESSION_NAME}:${WINDOW_NAME}" -F "#{pane_index} #{pane_current_command} #{pane_id} #{pane_width}x#{pane_height}")

    output+="📊 **Tmux Session Information**\n"
    output+="Session: $SESSION_NAME\n"
    output+="Window: $WINDOW_NAME\n"
    output+="Created: $(tmux display-message -t "${SESSION_NAME}:${WINDOW_NAME}" -p '#{session_created}')\n\n"

    output+="**Active Panes:**\n"

    # Get pane names from topology config
    local pane_names_array=()
    while IFS= read -r name; do
      pane_names_array+=("$name")
    done < <(get_pane_names_array)

    while IFS=' ' read -r pane_index pane_command pane_id pane_size; do
        local width="${pane_size%x*}"
        local height="${pane_size#*x}"
        local pane_name="${pane_names_array[$pane_index]:-Unknown}"

        output+="${GREEN}▸ ${pane_name} (pane ${pane_index})${NC}\n"
        output+="  Command: $pane_command\n"
        output+="  Size: ${width}x${height}\n"
        output+="  ID: $pane_id\n\n"

        log_message "INFO" "Pane ${pane_index} (${pane_name}): command=$pane_command, size=${width}x${height}"
    done <<< "$panes"

    echo -e "$output"
}

# Get recent activity from each pane
get_pane_activity() {
    local output=""
    output+="\n📝 **Recent Agent Activity (last 5 lines per pane):**\n\n"

    local tail_lines=5

    if [[ "$OUTPUT_FORMAT" == "telegram" ]]; then
        tail_lines=3
        output="\n📝 **Recent Agent Activity (last ${tail_lines} lines per pane):**\n\n"
    fi

    # Read panes and names from topology config
    local panes_array=()
    local pane_names_array=()

    while IFS= read -r pane; do
      panes_array+=("$pane")
    done < <(get_pane_array)

    while IFS= read -r name; do
      pane_names_array+=("$name")
    done < <(get_pane_names_array)

    for i in "${!panes_array[@]}"; do
        local pane="${panes_array[$i]}"
        local name="${pane_names_array[$i]}"

        output+="${YELLOW}▸ ${name} (${SESSION_NAME}:${pane}):${NC}\n"

        local history=$(tmux capture-pane -t "${SESSION_NAME}:${pane}" -p)
        local activity=$(get_recent_activity_lines "$history" "$tail_lines")
        local prompt_recent=false
        local prompt_any=false
        local maf_status=$(check_maf_status "$history")

        if echo "$activity" | grep -q -E "$PROMPT_PATTERN"; then
            prompt_recent=true
        fi

        if echo "$history" | grep -q -E "$PROMPT_PATTERN"; then
            prompt_any=true
        fi

        if [[ -n "$activity" ]]; then
            # Check MAF_STATUS first (most accurate), then prompts
            if [[ "$maf_status" == "busy" ]]; then
                output+="${RED}🔴 Busy (MAF_STATUS: safe_to_interrupt=0)${NC}\n"
            elif [[ "$prompt_recent" == true ]]; then
                output+="${GREEN}🟢 Prompted (recent)${NC}\n"
            elif [[ "$prompt_any" == true ]]; then
                output+="${YELLOW}🟠 Prompted (earlier)${NC}\n"
            else
                output+="${YELLOW}🟡 Idle - No recent prompts${NC}\n"
            fi

            output+="${CODE_FENCE}\n${activity}\n${CODE_FENCE}\n"
        else
            output+="${YELLOW}🟡 Idle - No recent prompts${NC}\n"
            output+="${CODE_FENCE}\n(idle)\n${CODE_FENCE}\n"
        fi

        output+="\n"

        # Log activity for monitoring
        echo "Activity for ${name} at $(date):" >> "${LOG_DIR}/pane-${pane}-activity.log"
        echo "$activity" >> "${LOG_DIR}/pane-${pane}-activity.log"
        echo "---" >> "${LOG_DIR}/pane-${pane}-activity.log"
    done

    echo -e "$output"
}

get_agent_summary() {
    local output=""
    output+="📌 **Agent Summary**\n"

    # Read panes and names from topology config
    local panes_array=()
    local pane_names_array=()

    while IFS= read -r pane; do
      panes_array+=("$pane")
    done < <(get_pane_array)

    while IFS= read -r name; do
      pane_names_array+=("$name")
    done < <(get_pane_names_array)

    for i in "${!panes_array[@]}"; do
        local pane="${panes_array[$i]}"
        local name="${pane_names_array[$i]}"
        local history=$(tmux capture-pane -t "${SESSION_NAME}:${pane}" -p)
        local trimmed_line=$(get_last_non_placeholder_line "$history")
        local prompt_recent=false
        local prompt_any=false
        local maf_status=$(check_maf_status "$history")

        if echo "$history" | tail -5 | grep -q -E "$PROMPT_PATTERN"; then
            prompt_recent=true
        fi

        if echo "$history" | grep -q -E "$PROMPT_PATTERN"; then
            prompt_any=true
        fi

        local status="Idle"
        if [[ -z "$history" ]]; then
            status="No output"
        elif [[ "$maf_status" == "busy" ]]; then
            status="Busy (MAF_STATUS)"
        elif [[ "$prompt_recent" == true ]]; then
            status="Prompted (recent)"
        elif [[ "$prompt_any" == true ]]; then
            status="Prompted (earlier)"
        fi

        trimmed_line="${trimmed_line//$BACKTICK/$SINGLE_QUOTE}"
        if [[ ${#trimmed_line} -gt 90 ]]; then
            trimmed_line="${trimmed_line:0:87}..."
        fi

        output+="- ${name}: ${status}. Last: ${trimmed_line}\n"
    done

    output+="\n"
    echo -e "$output"
}

# Check for recent broadcast prompts
check_broadcast_activity() {
    local output=""
    output+="\n📡 **Broadcast Activity Check:**\n"

    # Check if broadcast was run recently (last 10 minutes)
    local recent_broadcasts=$(find "$LOG_DIR" -name "tmux-monitor-*.log" -newermt "10 minutes ago" | wc -l)

    if [[ "$recent_broadcasts" -gt 0 ]]; then
        output+="${GREEN}✅ Recent monitoring activity detected${NC}\n"
    else
        output+="${YELLOW}⚠️  No monitoring activity in last 10 minutes${NC}\n"
    fi

    # Check for broadcast script execution evidence in pane history
    local broadcast_found=false

    # Read panes from topology config
    while IFS= read -r pane; do
        local history=$(tmux capture-pane -t "${SESSION_NAME}:${pane}" -p | grep -E "$PROMPT_PATTERN" || true)
        if [[ -n "$history" ]]; then
            output+="${GREEN}🎯 Prompt evidence found in pane ${pane}${NC}\n"
            broadcast_found=true
        fi
    done < <(get_pane_array)

    if [[ "$broadcast_found" = false ]]; then
        output+="${RED}❌ No recent broadcast prompts found${NC}\n"
    fi

    echo -e "$output"
}

# Get system status
get_system_status() {
    local output=""
    output+="\n🖥️ **System Status:**\n"

    # Tmux server status
    if tmux list-sessions >/dev/null 2>&1; then
        output+="${GREEN}✅ Tmux server running${NC}\n"
    else
        output+="${RED}❌ Tmux server not running${NC}\n"
    fi

    # Session details
    local session_count=0
    local window_count=0
    local pane_count=0

    if tmux list-sessions >/dev/null 2>&1; then
        session_count=$(tmux list-sessions | wc -l | tr -d ' ')
    fi

    local full_target="${SESSION_NAME}:${WINDOW_NAME}"
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null && tmux list-windows -t "$SESSION_NAME" -F "#{window_name}" | grep -q "^${WINDOW_NAME}$"; then
        window_count=$(tmux list-windows -t "$SESSION_NAME" -F "#{window_name}" | grep -c .)
        pane_count=$(tmux list-panes -t "$full_target" 2>/dev/null | wc -l | tr -d ' ')
    fi

    output+="Active sessions: ${session_count}\n"
    output+="Target window: ${WINDOW_NAME} (${window_count} total windows in session)\n"
    output+="Panes in ${full_target}: ${pane_count}\n"

    # Memory usage
    local tmux_memory=$(ps aux | grep '[t]mux' | awk '{sum+=$6} END {print int(sum/1024)"MB"}')
    output+="Tmux memory usage: $tmux_memory\n"

    echo -e "$output"
}

# Generate full report
generate_report() {
    local report=""
    if [[ "$OUTPUT_FORMAT" == "telegram" ]]; then
        report+="# 🔍 Roundtable MAF Agent Monitor\n"
        report+="Generated: $(date '+%Y-%m-%d %H:%M:%S')\n"
        report+="Session: $SESSION_NAME\n\n"
    else
        report+="# 🔍 Roundtable MAF Agent Monitor Report\n"
        report+="Generated: $(date '+%Y-%m-%d %H:%M:%S')\n"
        report+="Log: $MONITOR_LOG\n\n"
    fi

    if check_session; then
        if [[ "$OUTPUT_FORMAT" != "telegram" ]]; then
            report+=$(get_pane_info)
        fi
        if [[ "$OUTPUT_FORMAT" == "telegram" ]]; then
            report+=$(get_agent_summary)
        fi
        report+=$(get_pane_activity)
        report+=$(check_broadcast_activity)
    fi

    report+=$(get_system_status)

    echo -e "$report"
}

# Extract role from agent name (e.g., "Supervisor (GreenMountain)" -> "supervisor")
extract_role() {
    local agent_name="$1"
    if [[ "$agent_name" =~ ^Supervisor ]]; then
        echo "supervisor"
    elif [[ "$agent_name" =~ ^Reviewer ]]; then
        echo "reviewer"
    elif [[ "$agent_name" =~ ^Implementor-1 ]]; then
        echo "implementor-1"
    elif [[ "$agent_name" =~ ^Implementor-2 ]]; then
        echo "implementor-2"
    else
        echo "unknown"
    fi
}

# Parse MAF_STATUS marker from history to get current bead and phase
parse_maf_status() {
    local history="$1"
    local lookback_lines=50

    # Look for MAF_STATUS line with bead_id and phase
    local status_line=$(echo "$history" | tail -"$lookback_lines" | grep -E "MAF_STATUS" | tail -1)

    local current_bead=""
    local phase=""

    if [[ -n "$status_line" ]]; then
        # Extract bead_id: MAF_STATUS ... bead_id=roundtable-abc
        if [[ "$status_line" =~ bead_id=([a-zA-Z0-9_-]+) ]]; then
            current_bead="${BASH_REMATCH[1]}"
        fi

        # Extract phase: MAF_STATUS ... phase=implementation
        if [[ "$status_line" =~ phase=([a-zA-Z0-9_-]+) ]]; then
            phase="${BASH_REMATCH[1]}"
        fi
    fi

    echo "${current_bead}|${phase}"
}

# Collect detailed JSON data for all agents
collect_detailed_json() {
    local timestamp=$(date -Iseconds)
    local session="$SESSION_NAME"

    # Build agents JSON array
    local agents_json=""

    # Read panes and names from topology config
    local panes_array=()
    local pane_names_array=()

    while IFS= read -r pane; do
        panes_array+=("$pane")
    done < <(get_pane_array)

    while IFS= read -r name; do
        pane_names_array+=("$name")
    done < <(get_pane_names_array)

    for i in "${!panes_array[@]}"; do
        local pane="${panes_array[$i]}"
        local agent_name="${pane_names_array[$i]}"
        local pane_index="${pane#*.}"  # Extract pane index from "0.0"

        # Capture pane history
        local history=$(tmux capture-pane -t "${SESSION_NAME}:${pane}" -p)

        # Parse MAF_STATUS for bead and phase
        local maf_status_parts=$(parse_maf_status "$history")
        local current_bead=$(echo "$maf_status_parts" | cut -d'|' -f1)
        local phase=$(echo "$maf_status_parts" | cut -d'|' -f2)

        # Check if safe to interrupt
        local maf_status=$(check_maf_status "$history")
        local safe_to_interrupt="true"
        if [[ "$maf_status" == "busy" ]]; then
            safe_to_interrupt="false"
        fi

        # Detect prompts
        local prompt_detected="false"
        if echo "$history" | grep -q -E "$PROMPT_PATTERN"; then
            prompt_detected="true"
        fi

        # Get recent activity (last 5 lines)
        local activity_lines=()
        while IFS= read -r line; do
            if [[ -n "$line" ]]; then
                # Escape for JSON: quotes, backslashes, newlines
                local escaped=$(echo "$line" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\n' | sed 's/\r//g')
                activity_lines+=("$escaped")
            fi
        done < <(get_recent_activity_lines "$history" 5)

        # Build recent_activity JSON array
        local recent_activity_json="["
        local first=true
        for line in "${activity_lines[@]}"; do
            if [[ "$first" == true ]]; then
                first=false
            else
                recent_activity_json+=","
            fi
            recent_activity_json+="\"${line}\""
        done
        recent_activity_json+="]"

        # Get last activity line
        local last_activity=$(get_last_non_placeholder_line "$history")
        # Escape for JSON
        last_activity=$(echo "$last_activity" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\n' | sed 's/\r//g')

        # Get role
        local role=$(extract_role "$agent_name")

        # Build agent JSON object
        local agent_json="{"
        agent_json+="\"pane_index\":${pane_index},"
        agent_json+="\"agent_name\":\"${agent_name}\","
        agent_json+="\"role\":\"${role}\","
        agent_json+="\"current_bead\":\"${current_bead}\","
        agent_json+="\"phase\":\"${phase}\","
        agent_json+="\"safe_to_interrupt\":${safe_to_interrupt},"
        agent_json+="\"prompt_detected\":${prompt_detected},"
        agent_json+="\"recent_activity\":${recent_activity_json},"
        agent_json+="\"last_activity_line\":\"${last_activity}\""
        agent_json+="}"

        # Append to agents array
        if [[ -n "$agents_json" ]]; then
            agents_json+=","
        fi
        agents_json+="${agent_json}"
    done

    # Get system metrics
    local tmux_memory_mb=$(ps aux | grep '[t]mux' | awk '{sum+=$6} END {print int(sum/1024)}')
    local session_count=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
    local pane_count=$(tmux list-panes -t "${SESSION_NAME}:${WINDOW_NAME}" 2>/dev/null | wc -l | tr -d ' ')

    # Build complete JSON structure using jq for proper formatting
    local json_payload="{"
    json_payload+="\"timestamp\":\"${timestamp}\","
    json_payload+="\"session\":\"${session}\","
    json_payload+="\"agents\":[${agents_json}],"
    json_payload+="\"system\":{"
    json_payload+="\"tmux_memory_mb\":${tmux_memory_mb},"
    json_payload+="\"session_count\":${session_count},"
    json_payload+="\"pane_count\":${pane_count}"
    json_payload+="}"
    json_payload+="}"

    # Use jq to validate and format the JSON
    echo "$json_payload" | jq '.'
}

# Telegram formatting helper
format_for_telegram() {
    local content="$1"
    echo "$content"
}

# Main execution
main() {
    OUTPUT_FORMAT="${1:-terminal}"

    if [[ "$OUTPUT_FORMAT" == "telegram" ]]; then
        RED=''
        GREEN=''
        YELLOW=''
        BLUE=''
        NC=''
    fi

    log_message "INFO" "Starting tmux agent monitor"

    case "$OUTPUT_FORMAT" in
        "telegram")
            format_for_telegram "$(generate_report)"
            ;;
        "json")
            # JSON output for programmatic use
            echo '{"timestamp": "'$(date -Iseconds)'", "session": "'$SESSION_NAME'", "status": "active"}'
            ;;
        "json-detailed")
            # Detailed JSON output with agents array and system metrics
            collect_detailed_json
            ;;
        *)
            generate_report
            ;;
    esac

    log_message "INFO" "Monitor report generated"
}

# Show help
if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0 [format]"
    echo ""
    echo "Formats:"
    echo "  terminal       - Human-readable output (default)"
    echo "  telegram       - Telegram-formatted markdown"
    echo "  json           - Simple JSON status output"
    echo "  json-detailed  - Detailed JSON with agents array and system metrics"
    echo ""
    echo "Examples:"
    echo "  $0                    # Show terminal report"
    echo "  $0 telegram           # Telegram formatted"
    echo "  $0 json               # Simple JSON output"
    echo "  $0 json-detailed      # Detailed JSON output"
    exit 0
fi

# Run the monitor
main "$@"
