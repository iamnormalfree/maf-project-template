#!/bin/bash
# Analyze agent coordination events for quality assessment
# Usage: ./analyze-coordination-quality.sh [event_id]

COORDINATION_LOG_DIR="/root/projects/roundtable/.maf/logs/coordination"

# If event_id provided, analyze specific event
if [ -n "${1:-}" ]; then
    EVENT_DIR="$COORDINATION_LOG_DIR/$1"
    if [ ! -d "$EVENT_DIR" ]; then
        echo "Event not found: $1"
        echo "Available events:"
        ls -1 "$COORDINATION_LOG_DIR" | grep -v index.txt
        exit 1
    fi

    echo "=== ANALYZING EVENT: $1 ==="
    echo ""
    echo "Summary:"
    cat "$EVENT_DIR/summary.json" | jq '.'
    echo ""
    echo "Beads Created:"
    cat "$EVENT_DIR/beads_created.txt"
    echo ""
    echo "Decision Context (first 50 lines):"
    head -50 "$EVENT_DIR/decision_context.txt"
    echo ""

    # Quality assessment questions
    echo "=== QUALITY ASSESSMENT ==="
    echo ""
    echo "1. Was the problem statement clear?"
    grep -i "problem\|issue\|challenge" "$EVENT_DIR/decision_context.txt" | head -5
    echo ""
    echo "2. What was the reasoning behind this initiative?"
    grep -A 10 "PMF\|validation\|sprint" "$EVENT_DIR/decision_context.txt" | head -20
    echo ""
    echo "3. Were alternative approaches considered?"
    grep -i "alternative\|option\|versus\|instead" "$EVENT_DIR/decision_context.txt" | head -5
    echo ""
    echo "4. Was there consensus or did one agent decide?"
    grep -E "sender_id.*6|from.*FuchsiaCreek" "$EVENT_DIR/decision_context.txt" | wc -l
    echo "FuchsiaCreek messages found (above)"
    echo ""
    echo "5. What was the outcome?"
    cat "$EVENT_DIR/summary.json" | jq -r '.beads_created_count' | xargs -I {} echo "{} beads created"

else
    # List all events and provide overview
    echo "=== AGENT COORDINATION EVENTS ==="
    echo ""
    echo "Total events logged: $(ls -1 "$COORDINATION_LOG_DIR" | grep "event_" | wc -l)"
    echo ""
    echo "Recent events:"
    cat "$COORDINATION_LOG_DIR/index.txt" | tail -20
    echo ""
    echo "To analyze a specific event:"
    echo "  $0 <event_id>"
    echo ""
    echo "Available events:"
    ls -1t "$COORDINATION_LOG_DIR" | grep "event_" | head -10
fi
