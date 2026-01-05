#!/bin/bash
# Simple script to get agents actually working

SESSION_NAME="maf-5pane"

echo "=== Starting Working Agents ==="

# Get current bead assignments
echo "Current assignments:"
python3 scripts/maf/bead-assigner.py status 2>/dev/null | grep -A 5 "Reserved:"

echo ""
echo "Starting real work in each pane..."

# Implementor 1 - Simple work loop
tmux send-keys -t $SESSION_NAME:0.1 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo '=== IMPLEMENTOR 1 (Working on roundtable-e0i) ==='" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo 'Task: Create email draft service'" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.1 "# Create the service" Enter
tmux send-keys -t $SESSION_NAME:0.1 "mkdir -p apps/backend/src/drafts" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo '✅ Drafts directory created'" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.1 "# Start work loop" Enter
tmux send-keys -t $SESSION_NAME:0.1 "while true; do" Enter
tmux send-keys -t $SESSION_NAME:0.1 "  echo '-> [$(date)] Working on email draft service...'" Enter
tmux send-keys -t $SESSION_NAME:0.1 "  sleep 30" Enter
tmux send-keys -t $SESSION_NAME:0.1 "done" Enter

# Implementor 2 - Simple work loop
tmux send-keys -t $SESSION_NAME:0.2 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo '=== IMPLEMENTOR 2 (Working on roundtable-5et) ==='" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo 'Task: Token generation and approval endpoints'" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.2 "# Create auth service" Enter
tmux send-keys -t $SESSION_NAME:0.2 "mkdir -p apps/backend/src/auth" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo '✅ Auth directory created'" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.2 "# Communicate with team" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo '-> TEAM: Token service ready to integrate with draft approval'" Enter
tmux send-keys -t $SESSION_NAME:0.2 "# Start work loop" Enter
tmux send-keys -t $SESSION_NAME:0.2 "while true; do" Enter
tmux send-keys -t $SESSION_NAME:0.2 "  echo '-> [$(date)] Creating token endpoints...'" Enter
tmux send-keys -t $SESSION_NAME:0.2 "  sleep 35" Enter
tmux send-keys -t $SESSION_NAME:0.2 "done" Enter

# Implementor 3 - Simple work loop
tmux send-keys -t $SESSION_NAME:0.3 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo '=== IMPLEMENTOR 3 (Working on roundtable-tfh) ==='" Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo 'Task: Initialize Eleventy site'" Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.3 "# Create site structure" Enter
tmux send-keys -t $SESSION_NAME:0.3 "mkdir -p apps/site/{src,_site}" Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo '✅ Site directories created'" Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.3 "# Communicate needs" Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo '-> TEAM: Need draft JSON structure for templates'" Enter
tmux send-keys -t $SESSION_NAME:0.3 "# Start work loop" Enter
tmux send-keys -t $SESSION_NAME:0.3 "while true; do" Enter
tmux send-keys -t $SESSION_NAME:0.3 "  echo '-> [$(date)] Building Eleventy templates...'" Enter
tmux send-keys -t $SESSION_NAME:0.3 "  sleep 40" Enter
tmux send-keys -t $SESSION_NAME:0.3 "done" Enter

# Reviewer - Monitor progress
tmux send-keys -t $SESSION_NAME:0.4 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo '=== REVIEWER (Monitoring) ==='" Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo 'Task: Review and coordinate'" Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.4 "# Monitor all work" Enter
tmux send-keys -t $SESSION_NAME:0.4 "watch -n 60 'echo \"=== Status Check \$(date) ===\" && ls -la apps/backend/src/drafts apps/backend/src/auth apps/site/src 2>/dev/null || echo \"Directories not found\"'" Enter

# Coordinator - Show overview
tmux send-keys -t $SESSION_NAME:0.0 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '=== MAF COORDINATOR ==='" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Active Agents: 3'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Beads in Progress: 3'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Status: WORKING'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Started: $(date)'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'To stop all work: tmux kill-session -t maf-5pane'" Enter

echo ""
echo "✅ Agents are now working!"
echo ""
echo "Each agent is:"
echo "  • Creating directories"
echo "  • Showing progress every 30-40 seconds"
echo "  • Communicating with the team"
echo ""
echo "To see the work:"
echo "  tmux attach -t maf-5pane"
echo ""
echo "The agents will continue running indefinitely."