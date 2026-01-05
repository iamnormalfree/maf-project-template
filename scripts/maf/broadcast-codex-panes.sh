#!/usr/bin/env bash
# Broadcast a single prompt to tmux panes running Codex (identified by pane_current_command == node).
# Note: this only works when the pane is at a prompt that submits on Enter (e.g., shell or Codex input box).
set -euo pipefail

# Find panes whose current command is "node" (Codex)
SLEEP=0.2
PANES=$(tmux list-panes -a -F '#S:#I.#P #{pane_current_command}' | awk '$2=="node"{print $1}')

for pane in $PANES; do
  echo "Sending to $pane"
  sleep "$SLEEP"
  tmux send-keys -t "$pane" -l "pick the next bead you can actually do usefully now and start coding on it immediately; communicate what you're doing to the other agents via agent mail."
  sleep "$SLEEP"
  tmux send-keys -t "$pane" Enter
done
