#!/bin/bash

# Coordinate multiple AI agents in tmux panes for Roundtable development
# This script sends coordinated commands to all agent panes to drive synchronized work

set -e

# Get list of all panes, skipping the first 2 and last 2 (likely control/status panes)
# Using mapfile to read lines into array (bash equivalent of zsh's ${(f)"$(...)"})
mapfile -t PANES < <(tmux list-panes -a -F '#S:#I.#P' | tail -n +3 | head -n -2)

echo "Coordinating ${#PANES[@]} agent panes..."

for pane in "${PANES[@]}"; do
    echo "Sending commands to pane: $pane"

    # Command 1: Pick next ready bead and start working
    tmux send-keys -t "$pane" -l 'bd ready --json | jq -r ".[] | select(.status == \"ready\") | .id" | head -1 | xargs -I {} bd start {}'
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Command 2: Announce start in agent mail with thread_id matching bead
    tmux send-keys -t "$pane" -l 'LAST_BD=$(bd list --status in_progress --json | jq -r ".[-1].id"); send_message --thread-id "$LAST_BD" --subject "[$LAST_BD] Starting work" --body "Beginning work on this bead. Reserving files..." --ack-required true'
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Keep working commands (reduced from 4 to 3 for efficiency)
    for i in {1..3}; do
        tmux send-keys -t "$pane" -l 'continue with the current bead task; check your agent mail for any messages; progress update: working...'
        tmux send-keys -t "$pane" Enter
        sleep 0.2
    done

    # Command 3: Fresh code review
    tmux send-keys -t "$pane" -l 'carefully review all code you just wrote/modifed with fresh eyes. Look for: bugs, type errors, security issues, performance problems. Use tools: pnpm test, eslint, typecheck'
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Command 4: Check agent mail and continue systematically
    tmux send-keys -t "$pane" -l 'check_agent_mail; respond to urgent messages; continue with bead tasks; update progress in beads; avoid getting stuck in communication loops - be proactive!'
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Command 5: Review fellow agents" code
    tmux send-keys -t "$pane" -l 'review recent commits from other agents; check for: integration issues, API consistency, database migration conflicts, security vulnerabilities; fix if needed'
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    # Command 6: Complete and release
    tmux send-keys -t "$pane" -l 'CURRENT_BD=$(bd list --status in_progress --json | jq -r ".[-1].id"); bd close "$CURRENT_BD" --reason "Completed"; release_file_reservations "$(pwd)" "$AGENT_NAME" ["**/*.ts","**/*.json"]; send_message --thread-id "$CURRENT_BD" --subject "[$CURRENT_BD] Completed"'
    tmux send-keys -t "$pane" Enter
    sleep 0.5

    echo "Commands sent to $pane"
    echo "---"
done

echo "All agent panes coordinated. Monitor progress in tmux sessions."
echo "Tip: Use 'tmux attach -t session_name' to observe specific agents"
