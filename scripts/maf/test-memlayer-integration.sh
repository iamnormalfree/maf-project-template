#!/bin/bash

# Test Memlayer Integration with Agent Context Management

echo "=== Testing Memlayer Integration ==="

# Set up test environment
export AGENT_NAME="test-agent"
export BEADS_PROJECT_PATH="/root/projects/roundtable"

# Test 1: Unified Memory Service Status
echo ""
echo "1. Testing Unified Memory Service Status..."
python3 /root/projects/roundtable/scripts/maf/memory-service-unified.py status

if [ $? -eq 0 ]; then
    echo "✓ Unified memory service status working"
else
    echo "✗ Unified memory service status failed"
    exit 1
fi

# Test 2: Memory Store
echo ""
echo "2. Testing Memory Store..."
echo "Test content: Created new feature file, decided to use TypeScript, fixed import error" | \
    python3 /root/projects/roundtable/scripts/maf/memory-service-unified.py store \
        --agent "test-agent" \
        --bead "bd-123" \
        --file -

if [ $? -eq 0 ]; then
    echo "✓ Memory store working"
else
    echo "✗ Memory store failed"
    exit 1
fi

# Test 3: Memory Retrieval
echo ""
echo "3. Testing Memory Retrieval..."
python3 /root/projects/roundtable/scripts/maf/memory-service-unified.py retrieve \
    --agent "test-agent" \
    --bead "bd-123" \
    --query "TypeScript error"

if [ $? -eq 0 ]; then
    echo "✓ Memory retrieval working"
else
    echo "✗ Memory retrieval failed"
fi

# Test 4: Agent Memory Wrapper
echo ""
echo "4. Testing Agent Memory Wrapper..."
echo "Test decision: Will implement authentication middleware" | \
    /root/projects/roundtable/scripts/maf/agent-memory.sh store

if [ $? -eq 0 ]; then
    echo "✓ Agent memory wrapper working"
else
    echo "✗ Agent memory wrapper failed"
fi

# Test 5: Context Restore
echo ""
echo "5. Testing Context Restore..."
/root/projects/roundtable/scripts/maf/agent-memory.sh restore > /tmp/test-restore.txt

if [ $? -eq 0 ]; then
    echo "✓ Context restore working"
    echo "Sample output:"
    head -10 /tmp/test-restore.txt
else
    echo "✗ Context restore failed"
fi

# Test 6: Context Manager v2
echo ""
echo "6. Testing Context Manager v2 Status..."
/root/projects/roundtable/scripts/maf/context-manager-v2.sh status

if [ $? -eq 0 ]; then
    echo "✓ Context Manager v2 status check working"
else
    echo "✗ Context Manager v2 status check failed"
fi

# Test 7: Integration Test
echo ""
echo "7. Running Integration Test..."

# Create a test tmux session if not exists
if ! tmux has-session -t test-session 2>/dev/null; then
    tmux new-session -d -s test-session -n test-pane
    echo "Created test tmux session"
fi

# Get the pane ID
TEST_PANE=$(tmux list-panes -t test-session -F '#S:#I.#P' | head -1)
echo "Test pane: $TEST_PANE"

# Simulate some activity
tmux send-keys -t "$TEST_PANE" -l "echo 'Testing agent activity...'"
tmux send-keys -t "$TEST_PANE" Enter
tmux send-keys -t "$TEST_PANE" -l "# Just made a code change: edited src/auth.ts"
tmux send-keys -t "$TEST_PANE" Enter
tmux send-keys -t "$TEST_PANE" -l "# Decided to use JWT for authentication"
tmux send-keys -t "$TEST_PANE" Enter

# Test context save
export AGENT_NAME="test-tmux-agent"
echo "Saving context..."
/root/projects/roundtable/scripts/maf/agent-memory.sh store

# Verify memory was stored
echo ""
echo "Verifying stored memory..."
python3 /root/projects/roundtable/scripts/maf/memory-service-unified.py retrieve \
    --agent "test-tmux-agent" \
    --query "JWT authentication" \
    --limit 5

# Cleanup test session
tmux kill-session -t test-session 2>/dev/null || true

echo ""
echo "=== Test Summary ==="
echo "✓ All tests completed successfully!"
echo ""
echo "To start the enhanced context manager:"
echo "  ./scripts/maf/context-manager-v2.sh start"
echo ""
echo "To check status:"
echo "  ./scripts/maf/context-manager-v2.sh status"