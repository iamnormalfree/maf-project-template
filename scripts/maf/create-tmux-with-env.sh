#!/bin/bash
# Create tmux session with proper environment variables

set -e

SESSION_NAME="maf-5pane"
PROJECT_DIR="/root/projects/roundtable"

echo "=== Creating new tmux session with Claude settings ==="

# Kill existing session if exists
tmux kill-session -t $SESSION_NAME 2>/dev/null || true

# Create new session
tmux new-session -d -s $SESSION_NAME -c "$PROJECT_DIR"

# Split into 5 panes
tmux split-window -h -c "$PROJECT_DIR"
tmux split-window -h -c "$PROJECT_DIR"
tmux split-window -h -c "$PROJECT_DIR"
tmux select-layout even-horizontal

# Split first pane vertically
tmux select-pane -t 0
tmux split-window -v -c "$PROJECT_DIR"

# Set up environment in each pane
for i in {0..4}; do
    # Ensure we're in the project directory
    tmux send-keys -t "$SESSION_NAME:0.$i" "cd $PROJECT_DIR" Enter

    # Export Claude settings environment
    tmux send-keys -t "$SESSION_NAME:0.$i" "export CLAUDE_SETTINGS_DIR='$PROJECT_DIR/.claude'" Enter

    # Clear and show readiness
    tmux send-keys -t "$SESSION_NAME:0.$i" "clear" Enter
    tmux send-keys -t "$SESSION_NAME:0.$i" "echo 'Pane $i ready - Claude will use settings from .claude directory'" Enter
done

# Label panes
tmux select-pane -t 0 -T "Coordinator"
tmux select-pane -t 1 -T "Implementor-1"
tmux select-pane -t 2 -T "Implementor-2"
tmux select-pane -t 3 -T "Implementor-3"
tmux select-pane -t 4 -T "Reviewer"

echo "✅ Tmux session created with proper environment"
echo ""
echo "Session: $SESSION_NAME"
echo "Project directory: $PROJECT_DIR"
echo ""
echo "To attach: tmux attach -t $SESSION_NAME"
echo ""
echo "Now run: ./scripts/maf/init-claude-agents.sh"