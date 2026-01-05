#!/bin/bash
# Logger for agent communications in MAF

SESSION_NAME="maf-5pane"
LOG_DIR=".agent-mail/logs"
COMM_LOG="$LOG_DIR/communications.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Function to log a message
log_comm() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$COMM_LOG"
}

# Function to capture pane activity
capture_pane_comm() {
    local pane_num=$1
    local agent_name=$2
    local last_content="/tmp/last_pane_${pane_num}.txt"
    local current_content="/tmp/curr_pane_${pane_num}.txt"

    # Capture current pane content
    tmux capture-pane -t "$SESSION_NAME:0.$pane_num" > "$current_content"

    # Check if content changed (new message)
    if [ -f "$last_content" ]; then
        # Look for new lines that contain communication markers
        diff "$last_content" "$current_content" | grep "^>" | grep -E "(->|TEAM|ALL)" | while read line; do
            # Extract the message (remove "> " prefix)
            message=$(echo "$line" | sed 's/^> //')
            log_comm "$agent_name: $message"
        done
    fi

    # Save current content for next comparison
    mv "$current_content" "$last_content"
}

# Monitor mode
if [ "$1" = "--monitor" ]; then
    log_comm "=== Starting Agent Communication Monitor ==="

    while true; do
        capture_pane_comm 1 "Implementor-1"
        capture_pane_comm 2 "Implementor-2"
        capture_pane_comm 3 "Implementor-3"
        capture_pane_comm 4 "Reviewer"
        sleep 5
    done
fi

# Show recent communications
if [ "$1" = "--show" ]; then
    echo "=== Recent Agent Communications ==="
    if [ -f "$COMM_LOG" ]; then
        tail -50 "$COMM_LOG"
    else
        echo "No communications logged yet"
    fi
fi

# Search communications
if [ "$1" = "--search" ] && [ -n "$2" ]; then
    echo "=== Searching for: $2 ==="
    if [ -f "$COMM_LOG" ]; then
        grep -n "$2" "$COMM_LOG" | tail -20
    else
        echo "No communications logged yet"
    fi
fi

# Live follow mode
if [ "$1" = "--follow" ]; then
    echo "=== Following Agent Communications (Ctrl+C to stop) ==="
    tail -f "$COMM_LOG"
fi

# Count communications by agent
if [ "$1" = "--stats" ]; then
    echo "=== Communication Statistics ==="
    if [ -f "$COMM_LOG" ]; then
        echo "Total messages: $(wc -l < "$COMM_LOG")"
        echo ""
        echo "By agent:"
        grep -o '^[^:]*:' "$COMM_LOG" | sort | uniq -c | sort -nr
    else
        echo "No communications logged yet"
    fi
fi

# Usage
if [ -z "$1" ]; then
    echo "Agent Communication Logger"
    echo ""
    echo "Usage: $0 {--monitor|--show|--follow|--search TEXT|--stats}"
    echo ""
    echo "Commands:"
    echo "  --monitor    Start monitoring agent communications"
    echo "  --show       Show recent communications"
    echo "  --follow     Follow live communications"
    echo "  --search     Search for specific text"
    echo "  --stats      Show communication statistics"
    echo ""
    echo "Examples:"
    echo "  $0 --monitor &                    # Start in background"
    echo "  $0 --show                         # View recent messages"
    echo "  $0 --search "roundtable-e0i"       # Search for bead mentions"
    echo "  $0 --follow                       # Live view"
fi