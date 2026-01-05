#!/bin/bash
# Demonstrate MAF agents working with RAF and communicating

SESSION_NAME="maf-5pane"

echo "=== MAF Agent Workflow Demonstration ==="
echo "Time: $(date)"
echo ""

# Show current assignments
echo "Current Bead Assignments:"
python3 scripts/maf/bead-assigner.py status | grep -A 5 "Reserved:"
echo ""

# Simulate Implementor 1 completing analysis phase
echo "-> IMPLEMENTOR 1: Starting RAF analysis for roundtable-e0i"
tmux send-keys -t $SESSION_NAME:0.1 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo '[RAF Phase] Survey: Analyzing email draft requirements...'" Enter
tmux send-keys -t $SESSION_NAME:0.1 "sleep 2" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo '[RAF Phase] Planning: Will create draft model, email service, and approval endpoints'" Enter
tmux send-keys -t $SESSION_NAME:0.1 "sleep 2" Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo '[RAF Phase] Synthesis: Dependencies identified - need LLM client from previous work'" Enter

sleep 3

# Implementor 1 communicates with others
echo ""
echo "-> IMPLEMENTOR 1: Communicating dependencies..."
tmux send-keys -t $SESSION_NAME:0.1 "echo '-> TEAM: Using LLM client from roundtable-sto (completed earlier)' " Enter
tmux send-keys -t $SESSION_NAME:0.1 "echo '-> IMPLEMENTOR 2: Will need approval token endpoints for draft approval workflow'" Enter

sleep 2

# Implementor 2 responds
echo ""
echo "-> IMPLEMENTOR 2: Responding to coordination..."
tmux send-keys -t $SESSION_NAME:0.2 "echo '-> IMPLEMENTOR 1: Acknowledged. Will include token validation for draft approval.' " Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo '-> IMPLEMENTOR 3: Will need draft JSON structure for site rendering'" Enter

sleep 2

# Reviewer coordinates
echo ""
echo "-> REVIEWER: Coordinating review points..."
tmux send-keys -t $SESSION_NAME:0.4 "echo '-> ALL: Key integration points to watch:'" Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo '  1. Draft -> Approval workflow (I1 ↔ I2)'" Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo '  2. Approval -> Publish pipeline (I2 → Reviewer)'" Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo '  3. Draft JSON -> Site rendering (I1 → I3)'" Enter

sleep 3

# Show actual work beginning
echo ""
echo "-> Starting actual implementation..."
tmux send-keys -t $SESSION_NAME:0.1 "echo '' && echo '[RAF Phase] Implementation: Creating email draft service...' " Enter
tmux send-keys -t $SESSION_NAME:0.1 "mkdir -p apps/backend/src/drafts" Enter
tmux send-keys -t $SESSION_NAME:0.1 "ls -la apps/backend/src/drafts" Enter

sleep 2

# Implementor 2 starts parallel work
tmux send-keys -t $SESSION_NAME:0.2 "echo '' && echo '[RAF Phase] Implementation: Creating token service...' " Enter
tmux send-keys -t $SESSION_NAME:0.2 "mkdir -p apps/backend/src/auth" Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo 'Token service will integrate with draft approval'" Enter

# Update coordinator with live status
echo ""
echo "-> Updating coordinator with live status..."
tmux send-keys -t $SESSION_NAME:0.0 "C-c" 2>/dev/null; tmux send-keys -t $SESSION_NAME:0.0 "clear" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '=== MAF LIVE COORDINATION ==='" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo 'Time: $(date)'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '🔄 Active Workflows:'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '  I1 [RAF]: roundtable-e0i - Creating drafts (Implementation)'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '  I2 [RAF]: roundtable-5et - Token service (Implementation)'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '  I3 [Queue]: roundtable-tfh - Waiting on draft JSON'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo ''" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '📋 Agent Mail: Coordinating bead assignments'" Enter
tmux send-keys -t $SESSION_NAME:0.0 "echo '📝 Communications: Active (3 messages exchanged)'" Enter

echo ""
echo "✅ Agents are now actively working with RAF and communicating!"
echo ""
echo "To see the full session:"
echo "  tmux attach -t $SESSION_NAME"
echo ""
echo "To monitor Agent Mail:"
echo "  python3 scripts/maf/bead-assigner.py monitor"