#!/usr/bin/env python3
"""
Block git commit/push from Claude when running inside MAF agent tmux panes.

Allows commit/push outside of agent panes (e.g., manual Claude sessions).
"""

import os
import re
import sys
from hook_logger import log_hook_decision


def is_agent_pane() -> bool:
    if not os.environ.get("TMUX"):
        return False
    if os.environ.get("MAF_AGENT_ID") or os.environ.get("AGENT_ID") or os.environ.get("MAF_AGENT_TYPE"):
        return True
    return False


def main() -> None:
    tool_name = os.environ.get("TOOL_NAME", "Unknown")
    command = os.environ.get("TOOL_INPUT_command", "")

    if tool_name != "Bash":
        log_hook_decision("block-commit-tmux", "NONE", "SKIPPED", tool_name, "Not a Bash tool call")
        sys.exit(0)

    if not is_agent_pane():
        log_hook_decision("block-commit-tmux", "NONE", "SKIPPED", tool_name, "Not in agent tmux pane")
        sys.exit(0)

    if not command:
        log_hook_decision("block-commit-tmux", "NONE", "ALLOW", tool_name, "No command detected")
        sys.exit(0)

    commit_re = re.compile(r'(^|[;&|])\s*git\s+commit\b', re.IGNORECASE)
    push_re = re.compile(r'(^|[;&|])\s*git\s+push\b', re.IGNORECASE)

    if commit_re.search(command) or push_re.search(command):
        reason = "Blocked git commit/push in MAF agent tmux pane"
        log_hook_decision("block-commit-tmux", "NONE", "BLOCK", tool_name, reason)
        print("❌ Git commit/push is blocked for Claude agents in tmux panes. Ask the supervisor or run manually.")
        sys.exit(1)

    log_hook_decision("block-commit-tmux", "NONE", "ALLOW", tool_name, "Command allowed")
    sys.exit(0)


if __name__ == "__main__":
    main()
