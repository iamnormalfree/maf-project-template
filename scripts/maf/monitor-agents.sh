#!/bin/bash
# Monitor agent activity and communication

echo "=== Agent Communication Monitor ==="
echo ""

# Check 1: Bead status changes
echo "1. Checking bead activity..."
python3 scripts/maf/bead-assigner.py status
echo ""

# Check 2: Recent git activity (if agents commit work)
echo "2. Checking recent git activity..."
cd /root/projects/roundtable
git log --oneline -10 2>/dev/null || echo "No git activity yet"
echo ""

# Check 3: File changes in project
echo "3. Checking for recent file changes..."
find . -type f -mtime -1 -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.claude/*" | head -10
echo ""

# Check 4: MCP Agent Mail (if accessible)
echo "4. Checking MCP Agent Mail..."
if curl -s http://127.0.0.1:8765/mail > /dev/null 2>&1; then
    echo "✅ MCP Agent Mail is running at http://127.0.0.1:8765/mail"
    echo "   Visit to see agent messages"
else
    echo "❌ MCP Agent Mail not accessible"
fi
echo ""

# Check 5: Agent process activity
echo "5. Checking tmux session status..."
if tmux has-session -t maf-5pane 2>/dev/null; then
    echo "✅ maf-5pane session is active"
    if tmux list-panes -t maf-5pane | grep -q "active"; then
        echo "   Session is attached (you're watching it)"
    else
        echo "   Session running but not attached"
    fi
else
    echo "❌ No maf-5pane session found"
fi

echo ""
echo "=== Monitoring Tips ==="
echo ""
echo "To see agent communication:"
echo "1. Web UI: http://127.0.0.1:8765/mail (primary method)"
echo "2. Watch beads: watch -n 10 'python3 scripts/maf/bead-assigner.py status'"
echo "3. Watch files: inotifywait -r -m . --exclude='.git|node_modules' 2>/dev/null"
echo ""
echo "Agents will message when they:"
echo "- Complete a bead"
echo "- Get stuck on a task"
echo "- Need coordination"
echo "- Have questions"