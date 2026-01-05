#!/bin/bash
# Quick script to give tasks to all agents

SESSION_NAME="maf-5pane"

echo "=== Giving tasks to all agents ==="

# Give task to implementor-1
tmux send-keys -t "$SESSION_NAME:0.1" "mcp__agent_mail__macro_start_session --agent-id 'implementor-1' --task 'Continue working on Circle page rendering from published JSON for the Roundtable site. Implement template that displays published posts in a circle format with proper styling.'" Enter

sleep 2

# Give task to implementor-2
tmux send-keys -t "$SESSION_NAME:0.2" "mcp__agent_mail__macro_start_session --agent-id 'implementor-2' --task 'Continue working on Room page rendering as decision memos. Create templates that display individual posts as formal decision documents with appropriate metadata.'" Enter

sleep 2

# Give task to implementor-3
tmux send-keys -t "$SESSION_NAME:0.3" "mcp__agent_mail__macro_start_session --agent-id 'implementor-3' --task 'Continue working on Eleventy site setup. Set up the basic site structure, configuration, and starter templates for the Roundtable publishing system.'" Enter

sleep 2

# Give task to reviewer
tmux send-keys -t "$SESSION_NAME:0.4" "Monitor all implementor work. Use MCP Agent Mail to check if agents are stuck. Review progress and provide guidance." Enter

echo ""
echo "✅ All agents have been given their tasks!"
echo ""
echo "To see their progress: tmux attach -t $SESSION_NAME"