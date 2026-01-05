#!/bin/bash
# Start agents with bead-assigned tasks and proper context

SESSION_NAME="maf-5pane"

echo "=== Starting Agents with Bead Tasks ==="

# Get current bead assignments
echo "Current bead assignments:"
python3 /root/projects/roundtable/scripts/maf/bead-assigner.py status 2>/dev/null | grep -A 10 "Reserved:" || echo "Could not fetch assignments"

echo ""
echo "Starting agents with their assigned beads..."

# Implementor-1 - Check for assigned beads
echo "Configuring Implementor-1..."
tmux send-keys -t "$SESSION_NAME:0.1" "C-c" "clear" Enter
sleep 1
tmux send-keys -t "$SESSION_NAME:0.1" "echo '=== IMPLEMENTOR-1 (BEAD ASSIGNED) ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.1" "echo 'You are working on beads from the MAF system'" Enter
tmux send-keys -t "$SESSION_NAME:0.1" "echo 'Each bead represents a task unit in the workflow'" Enter
tmux send-keys -t "$SESSION_NAME:0.1" "mcp__agent_mail__macro_start_session --agent-id 'implementor-1' --task 'You are assigned to work on Circle page rendering from published JSON (Bead: roundtable-vf5). This is a bead-assigned task - create a template that displays published posts in a circle format. The bead tracking system will monitor your progress. When complete, mark the bead as done so you can get the next assignment.' --bead-id 'roundtable-vf5'" Enter

sleep 3

# Implementor-2
echo "Configuring Implementor-2..."
tmux send-keys -t "$SESSION_NAME:0.2" "C-c" "clear" Enter
sleep 1
tmux send-keys -t "$SESSION_NAME:0.2" "echo '=== IMPLEMENTOR-2 (BEAD ASSIGNED) ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.2" "echo 'You are part of the MAF bead workflow system'" Enter
tmux send-keys -t "$SESSION_NAME:0.2" "mcp__agent_mail__macro_start_session --agent-id 'implementor-2' --task 'You are assigned to work on Room page rendering as decision memos (Bead: roundtable-dsg). This is a bead-assigned task - create templates that display individual posts as formal decision documents with appropriate metadata. The bead system tracks your work completion. Use MCP Agent Mail to communicate if you encounter blockers.' --bead-id 'roundtable-dsg'" Enter

sleep 3

# Implementor-3
echo "Configuring Implementor-3..."
tmux send-keys -t "$SESSION_NAME:0.3" "C-c" "clear" Enter
sleep 1
tmux send-keys -t "$SESSION_NAME:0.3" "echo '=== IMPLEMENTOR-3 (BEAD ASSIGNED) ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.3" "echo 'Working in the MAF bead allocation system'" Enter
tmux send-keys -t "$SESSION_NAME:0.3" "mcp__agent_mail__macro_start_session --agent-id 'implementor-3' --task 'You are assigned to work on Eleventy site setup with templates (Bead: roundtable-tfh). This is a bead-assigned task - set up the basic site structure, configuration, and starter templates for the Roundtable publishing system. The bead system will assign you more tasks when this is complete. Coordinate with other implementors via MCP Agent Mail.' --bead-id 'roundtable-tfh'" Enter

sleep 3

# Reviewer/Coordinator
echo "Configuring Reviewer..."
tmux send-keys -t "$SESSION_NAME:0.4" "C-c" "clear" Enter
sleep 1
tmux send-keys -t "$SESSION_NAME:0.4" "echo '=== REVIEWER (BEAD COORDINATOR) ==='" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Monitoring MAF bead workflow progress'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Track implementor bead completions'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "echo 'Use MCP Agent Mail: http://127.0.0.1:8765/mail'" Enter
tmux send-keys -t "$SESSION_NAME:0.4" "python3 /root/projects/roundtable/scripts/maf/bead-assigner.py status | grep -A 5 'Reserved:'" Enter

echo ""
echo "✅ Agents configured with bead context!"
echo ""
echo "Agents understand:"
echo "- They are working on bead-assigned tasks"
echo "- Bead system tracks their progress"
echo "- MCP Agent Mail for real communication"
echo ""
echo "To monitor: tmux attach -t $SESSION_NAME"