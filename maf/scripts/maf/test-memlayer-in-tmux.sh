#!/bin/bash

# Test Memlayer functionality in a tmux pane
# This script creates a test pane and demonstrates memory storage/retrieval

set -e

echo "=== Memlayer Test in TMUX ==="
echo ""

# Configuration
TEST_SESSION="memlayer-test"
TEST_PANE_NAME="test-agent"
VENV_PATH="/root/projects/roundtable/venv_memlayer"
MEMORY_SCRIPT="/root/projects/roundtable/scripts/maf/agent-memory.sh"
UNIFIED_SERVICE="/root/projects/roundtable/scripts/maf/memory-service-unified.py"

# Check if unified service exists
if [[ ! -f "$UNIFIED_SERVICE" ]]; then
    echo "❌ ERROR: memory-service-unified.py not found!"
    echo "   Make sure the Response Awareness agent completed successfully"
    exit 1
fi

# Source Python environment
if [[ -d "$VENV_PATH" ]]; then
    echo "✅ Found Python virtual environment"
    source "$VENV_PATH/bin/activate"
else
    echo "⚠️  WARNING: No virtual environment found"
fi

# Create test session
echo ""
echo "1. Creating test tmux session..."
if tmux has-session -t "$TEST_SESSION" 2>/dev/null; then
    echo "   Session already exists, killing it..."
    tmux kill-session -t "$TEST_SESSION"
fi

tmux new-session -d -s "$TEST_SESSION" -n "$TEST_PANE_NAME"
TEST_PANE="$TEST_SESSION:0.0"
echo "   Created session: $TEST_PANE"

# Test 1: Direct memory service test
echo ""
echo "2. Testing memory service directly..."
echo "   Storing test memory..."

test_content="Test decision: Will use Memlayer for context management
Test code change: Created memory-service-unified.py
Test error: Fixed import issues with OpenAIWrapper
Test context: Working on bead bd-test-123"

# Try to store using unified service
if echo "$test_content" | python3 "$UNIFIED_SERVICE" store \
    --agent "test-agent" \
    --bead "bd-test-123" \
    --file -; then
    echo "   ✅ Memory stored successfully"

    # Try to retrieve
    echo "   Retrieving stored memory..."
    if retrieved=$(python3 "$UNIFIED_SERVICE" retrieve \
        --agent "test-agent" \
        --bead "bd-test-123" \
        --query "Memlayer" \
        --limit 5); then
        echo "   ✅ Memory retrieved successfully:"
        echo "$retrieved" | head -10
    else
        echo "   ❌ Failed to retrieve memory"
    fi
else
    echo "   ❌ Failed to store memory (will use fallback)"
fi

# Test 2: Test through tmux pane
echo ""
echo "3. Testing through tmux pane..."

# Set up agent name
export AGENT_NAME="test-tmux-agent"

# Send test commands to the pane
tmux send-keys -t "$TEST_PANE" -l "echo '=== Testing Memlayer in TMUX Pane ==='"
tmux send-keys -t "$TEST_PANE" Enter
sleep 0.5

# Show current directory and files
tmux send-keys -t "$TEST_PANE" -l "pwd && ls -la scripts/maf/memory*"
tmux send-keys -t "$TEST_PANE" Enter
sleep 1

# Test agent memory script
tmux send-keys -t "$TEST_PANE" -l "echo 'Testing agent-memory.sh store command...'"
tmux send-keys -t "$TEST_PANE" Enter
sleep 0.5

tmux send-keys -t "$TEST_PANE" -l "$MEMORY_SCRIPT store 'TMUX test: Decided to use TypeScript for type safety'"
tmux send-keys -t "$TEST_PANE" Enter
sleep 1

# Test restore
tmux send-keys -t "$TEST_PANE" -l "echo 'Testing restore command...'"
tmux send-keys -t "$TEST_PANE" Enter
sleep 0.5

tmux send-keys -t "$TEST_PANE" -l "$MEMORY_SCRIPT restore"
tmux send-keys -t "$TEST_PANE" Enter
sleep 1

# Test summary
tmux send-keys -t "$TEST_PANE" -l "echo 'Getting memory summary...'"
tmux send-keys -t "$TEST_PANE" Enter
sleep 0.5

tmux send-keys -t "$TEST_PANE" -l "$MEMORY_SCRIPT summary"
tmux send-keys -t "$TEST_PANE" Enter
sleep 1

# Test 3: Check what backend is being used
echo ""
echo "4. Checking which backend is active..."
echo "   Checking for OpenAI API key..."

if [[ -n "$OPENAI_API_KEY" ]]; then
    echo "   ✅ OPENAI_API_KEY is set - Memlayer should work"
else
    echo "   ⚠️  OPENAI_API_KEY not set - using fallback"
fi

# Check if memlayer is importable
echo "   Checking Memlayer import..."
if python3 -c "from memlayer import Memory; print('✅ Memlayer importable')" 2>/dev/null; then
    echo "   ✅ Memlayer can be imported"
else
    echo "   ❌ Memlayer import failed - will use fallback"
fi

# Test 4: Show results
echo ""
echo "5. Test Results:"
echo "   To see the test output, attach to the session:"
echo "   tmux attach -t $TEST_SESSION"
echo ""
echo "   To check what was stored:"
echo "   ls -la /root/projects/roundtable/.maf/state/memory 2>/dev/null || echo 'No memories directory'"
echo ""
echo "   To check logs:"
echo "   tail -f /tmp/agent-context-manager.log 2>/dev/null || echo 'No log file yet'"

# Final instructions
echo ""
echo "=== Test Complete ==="
echo ""
echo "Next steps:"
echo "1. Attach to see results: tmux attach -t $TEST_SESSION"
echo "2. In the pane, check if memories were stored/retrieved"
echo "3. Type 'exit' to detach from the session"
echo "4. To clean up: tmux kill-session -t $TEST_SESSION"
echo ""
echo "Expected behavior:"
echo "- If OPENAI_API_KEY is set: Should use Memlayer"
echo "- If not: Should gracefully fallback to file storage"
echo "- Either way, memories should store and retrieve"
