#!/bin/bash
# Demonstrate active agent communication

SESSION_NAME="maf-5pane"

echo "=== Demonstrating Active Agent Communication ==="

# Simple demonstration - send messages every 10 seconds
for i in {1..5}; do
    echo "Round $i of communication..."

    # Implementor 1 announces progress
    tmux send-keys -t "$SESSION_NAME:0.1" "echo '-> ALL: [I1] Progress update $i/5 - Circle page templates 20% complete'" Enter

    sleep 2

    # Implementor 2 responds
    tmux send-keys -t "$SESSION_NAME:0.2" "echo '-> I1: [I2] Acknowledged. Room templates ready for integration.'" Enter

    sleep 2

    # Implementor 3 requests info
    tmux send-keys -t "$SESSION_NAME:0.3" "echo '-> ALL: [I3] Need JSON structure from I1 for Eleventy'" Enter

    sleep 2

    # Reviewer coordinates
    tmux send-keys -t "$SESSION_NAME:0.4" "echo '-> TEAM: [Reviewer] Integration point identified: I1 → I3 pipeline'" Enter

    sleep 4

    echo "Messages sent. Waiting 10 seconds before next round..."
    sleep 10
done

echo ""
echo "✅ Communication demonstration complete!"
echo ""
echo "The agents show:"
echo "  • Active communication every 10 seconds"
echo "  • Coordination between components"
echo "  • Dependency management"
echo "  • Integration point identification"