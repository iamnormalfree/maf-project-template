#!/bin/bash

# Quick nudge to all agent panes to continue working
# Lightweight version for rapid coordination

set -e

# Get all agent panes (adjust filtering as needed)
mapfile -t PANES < <(tmux list-panes -a -F '#S:#I.#P' | grep -v "control\|status\|main")

echo "Nudging ${#PANES[@]} agents..."

# Send a single nudge command to all panes
for pane in "${PANES[@]}"; do
    tmux send-keys -t "$pane" -l 'bd ready; check agent mail; continue with highest priority ready bead; communicate progress!'
    tmux send-keys -t "$pane" Enter
done

echo "Nudged all agents. Status: ACTIVE"