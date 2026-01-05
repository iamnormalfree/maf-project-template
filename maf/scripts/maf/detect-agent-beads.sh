#!/bin/bash
# Detect beads created by tmux agent self-coordination (not human-initiated)
# Trigger: Run via cron every 5 minutes or as a git pre-commit hook

set -euo pipefail

BEADS_FILE="/root/projects/roundtable/.beads/beads.jsonl"
STATE_FILE="/tmp/.agent_beads_state"
COORDINATION_LOG="/root/projects/roundtable/.maf/logs/coordination/detections.log"
TELEGRAM_BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN /root/.agent-mail/telegram.env 2>/dev/null | cut -d= -f2 || echo "")
TELEGRAM_CHAT_ID=$(grep TELEGRAM_CHAT_ID /root/.agent-mail/telegram.env 2>/dev/null | cut -d= -f2 || echo "")

# Initialize state if doesn't exist
if [ ! -f "$STATE_FILE" ]; then
    wc -l < "$BEADS_FILE" > "$STATE_FILE"
    exit 0
fi

LAST_COUNT=$(cat "$STATE_FILE")
CURRENT_COUNT=$(wc -l < "$BEADS_FILE")

if [ "$CURRENT_COUNT" -le "$LAST_COUNT" ]; then
    exit 0
fi

NEW_BEADS_COUNT=$((CURRENT_COUNT - LAST_COUNT))
NEW_BEADS=$(tail -n "$NEW_BEADS_COUNT" "$BEADS_FILE")

# Detection criteria for agent-created beads:
# 1. Created during "active agent hours" (recent Agent Mail activity)
# 2. No git commit within last 10 minutes (humans typically commit promptly)
# 3. Associated Agent Mail message exists about bead creation
# 4. Multiple beads created in quick succession (< 5 minutes apart)

AGENT_CREATED=false
COORDINATION_ID=""

# Check 1: Recent Agent Mail activity (last 10 minutes)
TEN_MIN_AGO=$(date -d '10 minutes ago' -Iseconds 2>/dev/null | cut -d'T' -f2 | head -c 4)
RECENT_ACTIVITY=$(grep -c "$(date -Iseconds | cut -d'T' -f1)T${TEN_MIN_AGO}" .agent-mail/server.log 2>/dev/null || echo "0")
if [ "$RECENT_ACTIVITY" -gt 0 ]; then
    AGENT_CREATED=true
fi

# Check 2: No recent git commits for these beads
TIMESTAMP=$(echo "$NEW_BEADS" | head -1 | jq -r '.created_at')
TIME_SINCE_EPOCH=$(date -d "$TIMESTAMP" +%s 2>/dev/null || echo "0")
NOW=$(date +%s)
AGE_MINUTES=$(( (NOW - TIME_SINCE_EPOCH) / 60 ))

# Check 3: Multiple beads with close timestamps (agent coordination signature)
if [ "$NEW_BEADS_COUNT" -ge 2 ]; then
    FIRST_TIME=$(echo "$NEW_BEADS" | head -1 | jq -r '.created_at')
    LAST_TIME=$(echo "$NEW_BEADS" | tail -1 | jq -r '.created_at')
    
    FIRST_SEC=$(date -d "$FIRST_TIME" +%s 2>/dev/null || echo "0")
    LAST_SEC=$(date -d "$LAST_TIME" +%s 2>/dev/null || echo "0")
    TIME_SPAN=$((LAST_SEC - FIRST_SEC))
    
    # If 2+ beads created within 5 minutes, likely agent coordination
    if [ "$TIME_SPAN" -lt 300 ]; then
        AGENT_CREATED=true
        COORDINATION_ID="${FIRST_TIME}_coordination"
    fi
fi

# Check 4: Look for Agent Mail message about this bead batch
if [ -n "$COORDINATION_ID" ]; then
    # Search for coordination message in server log
    PMF_MESSAGE=$(grep -c "PMF Validation Sprint\|BEAD ASSIGNMENT.*validation" .agent-mail/server.log 2>/dev/null || echo "0")
    if [ "$PMF_MESSAGE" -gt 0 ]; then
        AGENT_CREATED=true
    fi
fi

if [ "$AGENT_CREATED" = true ]; then
    # Extract bead details and check for proposal_id
    BEAD_DETAILS=$(echo "$NEW_BEADS" | jq -r '"[\(.created_at)] \(.id) - \(.title)"')

    # Check if beads have proposal_id (from approved proposals)
    BEADS_WITH_PROPOSAL=$(echo "$NEW_BEADS" | jq -r 'select(.proposal_id != null) | .id' | wc -l)
    BEADS_WITHOUT_PROPOSAL=$((NEW_BEADS_COUNT - BEADS_WITH_PROPOSAL))

    # Classify beads without proposal_id to check if they're strategic work
    UNAPPROVED_STRATEGIC=0
    if [ "$BEADS_WITHOUT_PROPOSAL" -gt 0 ]; then
        # Check each bead without proposal_id for strategic indicators
        while IFS= read -r bead; do
            HAS_PROPOSAL=$(echo "$bead" | jq -r '.proposal_id // "none"')
            if [ "$HAS_PROPOSAL" = "null" ] || [ "$HAS_PROPOSAL" = "none" ]; then
                LABELS=$(echo "$bead" | jq -r '.labels // ""' | tr ',' ' ')
                ISSUE_TYPE=$(echo "$bead" | jq -r '.issue_type // ""')

                # Check for strategic labels
                if echo "$LABELS" | grep -qiE "pmf|architecture|strategic|multi-epic"; then
                    UNAPPROVED_STRATEGIC=1
                fi

                # Check for strategic issue types
                if echo "$ISSUE_TYPE" | grep -qiE "epic"; then
                    UNAPPROVED_STRATEGIC=1
                fi
            fi
        done < <(echo "$NEW_BEADS" | jq -c '.')
    fi

    # Log to coordination log
    {
        echo "=== $(date -Iseconds) ==="
        echo "DETECTION: Agent-created beads detected"
        echo "COUNT: $NEW_BEADS_COUNT"
        echo "WITH_PROPOSAL: $BEADS_WITH_PROPOSAL"
        echo "WITHOUT_PROPOSAL: $BEADS_WITHOUT_PROPOSAL"
        echo "UNAPPROVED_STRATEGIC: $UNAPPROVED_STRATEGIC"
        echo "COORDINATION_ID: $COORDINATION_ID"
        echo "BEADS:"
        echo "$BEAD_DETAILS"
        echo ""
    } >> "$COORDINATION_LOG"

    # Determine alert type
    if [ "$UNAPPROVED_STRATEGIC" -eq 1 ]; then
        # Escalate unapproved strategic work
        ALERT_TYPE="🚨 GOVERNANCE ALERT: UNAPPROVED STRATEGIC WORK"
        ALERT_CONTEXT="Agents created strategic work WITHOUT proposal approval.
This may violate governance rules. Supervisor review required."
    elif [ "$BEADS_WITHOUT_PROPOSAL" -eq 0 ]; then
        # All beads from approved proposals - no alert needed
        exit 0
    else
        # Normal agent coordination
        ALERT_TYPE="🤖 AGENT COORDINATION DETECTED"
        ALERT_CONTEXT="Agents self-coordinated to create beads"
    fi

    # Send Telegram alert
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        if [ "$UNAPPROVED_STRATEGIC" -eq 1 ] || [ "$BEADS_WITHOUT_PROPOSAL" -gt 0 ]; then
            ALERT_MSG="**$ALERT_TYPE**

$NEW_BEADS_COUNT bead(s) created
- From approved proposals: $BEADS_WITH_PROPOSAL
- Without proposal: $BEADS_WITHOUT_PROPOSAL

$ALERT_CONTEXT

$BEAD_DETAILS

Context: Check Agent Mail logs for decision process
Timestamp: $TIMESTAMP"

            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d chat_id="$TELEGRAM_CHAT_ID" \
                -d text="$ALERT_MSG" \
                -d parse_mode="Markdown" >/dev/null 2>&1 || true
        fi
    fi
fi

# Update state
echo "$CURRENT_COUNT" > "$STATE_FILE"
