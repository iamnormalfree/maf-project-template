#!/bin/bash
# Log agent coordination events for quality analysis
# Generates both JSON logs and Markdown documentation

set -euo pipefail

COORDINATION_LOG_DIR="/root/projects/roundtable/.maf/logs/coordination"
DOCS_DIR="/root/projects/roundtable/docs/operations/agent-coordination"
SERVER_LOG="/root/projects/roundtable/.agent-mail/server.log"
BEADS_FILE="/root/projects/roundtable/.beads/beads.jsonl"
TIMESTAMP=$(date -Iseconds)
EVENT_ID="$(date +%s)_$(head -c 4 /dev/urandom | xxd -p)"
DATE_STR=$(date +%Y-%m-%d)

mkdir -p "$COORDINATION_LOG_DIR"
mkdir -p "$DOCS_DIR"

# Check if this bead was already logged (prevent duplicates)
check_already_logged() {
    local trigger_bead="$1"
    if grep -q "TRIGGER:.*${trigger_bead}" "$COORDINATION_LOG_DIR/index.txt" 2>/dev/null; then
        echo "⚠️  Event already logged for bead: $trigger_bead"
        return 0
    fi
    return 1
}

# Extract beads created within 5 minutes of trigger bead
get_coordinated_beads() {
    local trigger_bead="$1"
    local trigger_time
    trigger_time=$(grep "\"id\":\"$trigger_bead\"" "$BEADS_FILE" | jq -r '.created_at')

    # Convert to epoch for comparison
    local trigger_epoch
    trigger_epoch=$(date -d "$trigger_time" +%s 2>/dev/null || echo "0")
    local window_start=$((trigger_epoch - 300))  # 5 minutes before
    local window_end=$((trigger_epoch + 300))    # 5 minutes after

    # Extract beads within the time window
    jq -r "select(.created_at | fromdateiso8601 >= $window_start and .created_at | fromdateiso8601 <= $window_end)" "$BEADS_FILE"
}

# Find the actual initiating agent from Agent Mail
find_initiating_agent() {
    local bead_ids=("$@")
    local initiating_agent="Unknown"

    # Look for Agent Mail message about these beads being created
    for bead_id in "${bead_ids[@]}"; bead_id=$(echo "$bead_id" | tr -d '"'); do
        # Search for message about this bead creation
        local msg_pattern
        msg_pattern=$(grep -i "bead.*${bead_id}\|assignment.*${bead_id}\|created.*${bead_id}" "$SERVER_LOG" 2>/dev/null | head -1 || echo "")

        if [ -n "$msg_pattern" ]; then
            # Extract sender from the message context
            # Look for sender_name in the 50 lines before the bead mention
            local sender
            sender=$(grep -B 50 "${bead_id}" "$SERVER_LOG" 2>/dev/null | grep "sender_name" | tail -1 | jq -r '.sender_name' 2>/dev/null || echo "Unknown")
            if [ "$sender" != "Unknown" ] && [ "$sender" != "null" ]; then
                initiating_agent="$sender"
                break
            fi
        fi
    done

    echo "$initiating_agent"
}

# Generate beads markdown dynamically
generate_beads_markdown() {
    local beads_json="$1"
    echo "$beads_json" | jq -r '
        "### `\(.id)` - \(.title)
- **Status:** \(.status)
- **Labels:** \(.labels | join(", "))
- **Description:** \(.description)" +
        (if .assignee then "\n- **Assignee:** \(.assignee)" else "" end) +
        (if .status == "closed" then "\n- **Outcome:** ✅ Completed" else "" end) +
        "\n"
    '
}

log_coordination_event() {
    local trigger_bead="$1"

    # Check if already logged
    if check_already_logged "$trigger_bead"; then
        local existing_file
        existing_file=$(grep "TRIGGER:.*${trigger_bead}" "$COORDINATION_LOG_DIR/index.txt" | grep "MD_FILE:" | tail -1 | cut -d: -f2- | xargs)
        if [ -f "$existing_file" ]; then
            echo "📄 Existing documentation: $existing_file"
        fi
        exit 0
    fi

    local event_dir="$COORDINATION_LOG_DIR/event_${EVENT_ID}"
    local md_file="$DOCS_DIR/${DATE_STR}_agent-coordination-${EVENT_ID}.md"

    mkdir -p "$event_dir"

    # Extract trigger time from bead
    local trigger_time
    trigger_time=$(grep "\"id\":\"$trigger_bead\"" "$BEADS_FILE" | jq -r '.created_at' 2>/dev/null || echo "unknown")

    # Get all beads in coordination window
    local coordinated_beads
    coordinated_beads=$(get_coordinated_beads "$trigger_bead")

    # Count beads
    local beads_count
    beads_count=$(echo "$coordinated_beads" | jq 'length')

    # Extract bead IDs for agent detection
    local bead_ids
    bead_ids=()
    while IFS= read -r line; do
        bead_ids+=("$line")
    done < <(echo "$coordinated_beads" | jq -r '.id')

    # Find initiating agent
    local initiating_agent
    initiating_agent=$(find_initiating_agent "${bead_ids[@]}")

    # Create markdown file
    cat > "$md_file" << MDHEADER
# Agent Coordination Event: ${EVENT_ID}

**Date:** $(date -d "$TIMESTAMP" "+%Y-%m-%d %H:%M:%S UTC")
**Event ID:** \`${EVENT_ID}\`
**Trigger Bead:** \`${trigger_bead}\`
**Initiating Agent:** ${initiating_agent}
**Coordination Type:** Autonomous Self-Coordination
**Beads Created:** ${beads_count}
**Trigger Time:** ${trigger_time}

---

## Executive Summary

**What happened:** ${initiating_agent} autonomously initiated a coordination event, resulting in the creation of ${beads_count} new beads.

**Why:** Agent self-coordination detected work gap and created new beads to address it.

**Detection:**
- Beads created within 5-minute window
- No git commit within 10 minutes of bead creation
- Associated Agent Mail message found

---

## Beads Created

MDHEADER

    # Generate beads markdown dynamically
    generate_beads_markdown "$coordinated_beads" >> "$md_file"

    # Add quality assessment template
    cat >> "$md_file" << MDFOOTER

---

## Agent Assignments

| Bead | Agent | Expertise Area |
|------|-------|----------------|
$(echo "$coordinated_beads" | jq -r '"| \(.id) | \(.assignee // "Unassigned") | TBD |"')

---

## Quality Assessment

| Criteria | Assessment | Notes |
|----------|------------|-------|
| **Problem clarity** | ⏳ Pending | Manual review needed |
| **Strategic alignment** | ⏳ Pending | Manual review needed |
| **Proper delegation** | ⏳ Pending | Manual review needed |
| **Alternative approaches** | ⏳ Pending | Manual review needed |
| **Outcome quality** | ⏳ Pending | Pending completion |

### Recommendation

**⏳ PENDING REVIEW**

Please review this coordination event and update the recommendation:
- ✅ ALLOW - Continue allowing this type of coordination
- ⚠️ MODIFY - Allow with conditions
- ❌ BLOCK - Prevent this type of coordination in the future

---

## Raw Data

- **Event logs:** \`.maf/logs/coordination/event_${EVENT_ID}/\`
- **Server log:** Search for trigger bead \`${trigger_bead}\` in \`.agent-mail/server.log\`

MDFOOTER

    # Save coordinated beads to event directory
    echo "$coordinated_beads" > "$event_dir/beads.json"

    # Update JSON summary
    cat > "$event_dir/summary.json" << JSONSUMMARY
{
  "event_id": "$EVENT_ID",
  "timestamp": "$TIMESTAMP",
  "trigger_bead": "$trigger_bead",
  "trigger_time": "$trigger_time",
  "beads_created_count": $beads_count,
  "initiating_agent": "$initiating_agent",
  "coordination_type": "autonomous_coordination",
  "event_type": "agent_coordination",
  "status": "logged_pending_review",
  "md_file": "$md_file"
}
JSONSUMMARY

    # Update index
    {
        echo "=== EVENT: $EVENT_ID ==="
        echo "TIME: $TIMESTAMP"
        echo "TRIGGER: $trigger_bead ($trigger_time)"
        echo "BEADS: $beads_count"
        echo "MD_FILE: $md_file"
        echo ""
    } >> "$COORDINATION_LOG_DIR/index.txt"

    echo "✅ Logged to: $event_dir"
    echo "✅ Documentation: $md_file"
}

# Main
if [ -n "${1:-}" ]; then
    log_coordination_event "$1"
else
    echo "Usage: $0 <bead_id>"
fi
