#!/usr/bin/env bash
# Send a command to a tmux pane, optionally issuing Ctrl+C first to exit any running UI.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: send-pane-cmd.sh [-n] <session> <pane> <command...>

  -n    Do NOT send Ctrl+C before the command (default: send Ctrl+C)

Examples:
  send-pane-cmd.sh maf-cli 0.1 "echo hello"
  send-pane-cmd.sh -n maf-cli 0.0 "ls -la"
EOF
}

send_ctrl_c=true
while getopts ":n" opt; do
    case "$opt" in
        n) send_ctrl_c=false ;;
        *) usage; exit 1 ;;
    esac
done
shift $((OPTIND - 1))

if [[ $# -lt 3 ]]; then
    usage
    exit 1
fi

session="$1"
pane="$2"
shift 2
cmd="$*"

target="${session}:${pane}"

# Ensure tmux is available and target exists
if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux not found on PATH" >&2
    exit 1
fi
if ! tmux list-panes -t "$session" >/dev/null 2>&1; then
    echo "tmux session '$session' not found" >&2
    exit 1
fi

# Send Ctrl+C to break out of a running TUI unless suppressed
if "$send_ctrl_c"; then
    tmux send-keys -t "$target" C-c
fi

# Send the command followed by Enter
tmux send-keys -t "$target" "$cmd" Enter

echo "Sent to $target: $cmd"
