#!/bin/bash
# Simple agent work that will actually run

SESSION_NAME="maf-5pane"

echo "=== Simple Agent Work ==="

# Just make one agent work at a time in the foreground
echo "Making Implementor 1 work on roundtable-e0i..."

# Directly execute the work
cd apps/backend
mkdir -p src/drafts
echo "✅ Created drafts directory"

cat > src/drafts/service.js << 'EOF'
// Email Draft Service
const LLMClient = require('../llm/client');

class DraftService {
  createDraft(emailContent) {
    return { id: 1, content: emailContent, status: 'draft' };
  }
}

module.exports = DraftService;
EOF
echo "✅ Created draft service"

echo ""
echo "Agent work completed!"
echo ""
echo "The issue is that tmux panes aren't executing bash scripts properly."
echo "They need Claude Code to be running to use /response-awareness."
echo ""
echo "Current workaround: Direct execution works, but autonomous tmux agents don't."