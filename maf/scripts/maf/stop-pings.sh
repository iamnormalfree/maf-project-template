#!/bin/bash
# Stop all ping injection processes and clean tmux session

echo "=== STOPPING ALL PING PROCESSES ==="

# Kill any agent communication processes
pkill -f "agent-communication" 2>/dev/null
pkill -f "active-agents" 2>/dev/null
pkill -f "simple-agent-work" 2>/dev/null
pkill -f "really-work" 2>/dev/null
pkill -f "agent-monitor" 2>/dev/null

# Kill any tmux send-keys processes
pkill -f "tmux.*send-keys.*echo.*implementor" 2>/dev/null
pkill -f "tmux.*send-keys.*echo.*reviewer" 2>/dev/null

echo "✅ All ping processes killed"

# Clear and reset tmux session if it exists
if tmux has-session -t maf-5pane 2>/dev/null; then
    echo "Clearing tmux session maf-5pane..."

    # Clear all panes
    for i in {0..4}; do
        tmux send-keys -t "maf-5pane:0.$i" "C-c" "C-c" "C-c" "clear" Enter 2>/dev/null
    done

    echo "✅ Tmux session cleared"
fi

echo ""
echo "=== DONE ==="
echo "Pings should be stopped. Check with: tmux attach -t maf-5pane"