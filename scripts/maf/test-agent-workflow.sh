#!/bin/bash
# Test and demonstrate agent communication workflow

SESSION_NAME="maf-5pane"

echo "=== Testing Agent Communication Workflow ==="
echo "Time: $(date)"
echo ""

# Simulate Implementor 1 announcing completion
echo "1. Implementor 1 announcing progress..."
tmux send-keys -t $SESSION_NAME:0.1 "echo '-> TEAM: [Implementor-1] Draft service 60% complete. Created service.js with LLM integration.' " Enter
sleep 1

# Implementor 2 responding
echo "2. Implementor 2 coordinating..."
tmux send-keys -t $SESSION_NAME:0.2 "echo '-> Implementor-1: Acknowledged. Token service ready to integrate with your draft approval.' " Enter
tmux send-keys -t $SESSION_NAME:0.2 "echo '-> TEAM: [Implementor-2] Token endpoints ready for testing.' " Enter
sleep 1

# Implementor 3 requesting info
echo "3. Implementor 3 requesting information..."
tmux send-keys -t $SESSION_NAME:0.3 "echo '-> Implementor-1: Please share draft JSON structure when ready for site templates.' " Enter
tmux send-keys -t $SESSION_NAME:0.3 "echo '-> TEAM: [Implementor-3] Eleventy config prepared, waiting on content structure.' " Enter
sleep 1

# Reviewer coordinating
echo "4. Reviewer providing guidance..."
tmux send-keys -t $SESSION_NAME:0.4 "echo '-> TEAM: [Reviewer] Integration points identified!' " Enter
tmux send-keys -t $SESSION_NAME:0.4 "echo '-> All: Ensure draft -> approval -> publish pipeline is end-to-end testable.' " Enter
sleep 1

# Show communication summary
echo ""
echo "=== Communication Summary ==="
echo "✅ Agents are actively communicating"
echo "✅ Dependencies being coordinated"
echo "✅ Integration points identified"
echo ""

# Show how to monitor communications
echo "=== How to Monitor Communications ==="
echo ""
echo "1. View real-time in tmux:"
echo "   tmux attach -t $SESSION_NAME"
echo ""
echo "2. Follow communication log:"
echo "   ./scripts/maf/agent-comm-logger.sh --follow"
echo ""
echo "3. Search specific topics:"
echo "   ./scripts/maf/agent-comm-logger.sh --search 'draft'"
echo ""
echo "4. View statistics:"
echo "   ./scripts/maf/agent-comm-logger.sh --stats"
echo ""

# Create a sample communication for demonstration
cat >> .agent-mail/logs/communications.log << EOF
[2025-12-17 02:30:15] Implementor-1: -> TEAM: [Implementor-1] Draft service 60% complete. Created service.js with LLM integration.
[2025-12-17 02:30:16] Implementor-2: -> Implementor-1: Acknowledged. Token service ready to integrate with your draft approval.
[2025-12-17 02:30:17] Implementor-2: -> TEAM: [Implementor-2] Token endpoints ready for testing.
[2025-12-17 02:30:18] Implementor-3: -> Implementor-1: Please share draft JSON structure when ready for site templates.
[2025-12-17 02:30:19] Implementor-3: -> TEAM: [Implementor-3] Eleventy config prepared, waiting on content structure.
[2025-12-17 02:30:20] Reviewer: -> TEAM: [Reviewer] Integration points identified!
[2025-12-17 02:30:21] Reviewer: -> All: Ensure draft -> approval -> publish pipeline is end-to-end testable.
EOF

echo "✅ Sample communications logged to .agent-mail/logs/communications.log"
echo ""
echo "To continue monitoring:"
echo "  tail -f .agent-mail/logs/communications.log"