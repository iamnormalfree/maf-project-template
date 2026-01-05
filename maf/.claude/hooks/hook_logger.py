#!/usr/bin/env python3
"""
Centralized Hook Logging System

Purpose: Simple persistent logging for all response-awareness framework hooks
Location: .claude/hooks/execution.log
Format: [timestamp] [hook] [tier] [decision] [tool] [reason]

Usage:
    from hook_logger import log_hook_decision
    log_hook_decision(
        hook_name="orchestrator-firewall",
        tier="HEAVY",
        decision="BLOCK",
        tool_name="Edit",
        reason="Orchestrator attempted direct implementation"
    )
"""

import os
from datetime import datetime
from pathlib import Path
from typing import Optional

# Configuration
HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "execution.log"
MAX_LOG_ENTRIES = 500  # Keep last 500 entries to prevent unbounded growth
ENABLE_LOGGING = os.environ.get('DISABLE_HOOK_LOGGING', '0') != '1'  # Enable by default


def log_hook_decision(
    hook_name: str,
    tier: str,
    decision: str,
    tool_name: str,
    reason: str = ""
):
    """
    Log a hook decision to persistent log file.

    Args:
        hook_name: Name of the hook (e.g., "orchestrator-firewall")
        tier: Detected tier (e.g., "HEAVY", "NONE", "LIGHT")
        decision: Hook decision (e.g., "ALLOW", "WARN", "BLOCK", "SKIPPED")
        tool_name: Tool being used (e.g., "Edit", "Task", "Read")
        reason: Human-readable reason for decision (optional)
    """
    if not ENABLE_LOGGING:
        return

    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Format: [timestamp] [hook] [tier] [decision] [tool] reason
        log_entry = f"[{timestamp}] [{hook_name:25s}] [{tier:6s}] [{decision:7s}] [{tool_name:15s}] {reason}\n"

        # Append to log file
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry)

        # Rotate if needed (keep log file manageable)
        _rotate_log_if_needed()

    except Exception as e:
        # Silent failure - don't break hook execution if logging fails
        pass


def _rotate_log_if_needed():
    """Keep only last MAX_LOG_ENTRIES to prevent unbounded growth."""
    try:
        if not LOG_FILE.exists():
            return

        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()

        if len(lines) > MAX_LOG_ENTRIES:
            # Keep only last MAX_LOG_ENTRIES lines
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(lines[-MAX_LOG_ENTRIES:])
    except Exception:
        pass  # Silent failure


def get_recent_logs(limit: int = 50) -> str:
    """
    Get recent log entries for debugging.

    Args:
        limit: Number of recent entries to return

    Returns:
        String containing recent log entries
    """
    try:
        if not LOG_FILE.exists():
            return "No log file found"

        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()

        recent = lines[-limit:] if len(lines) > limit else lines
        return "".join(recent)
    except Exception as e:
        return f"Error reading log: {e}"


def clear_logs():
    """Clear all log entries (useful for testing)."""
    try:
        if LOG_FILE.exists():
            LOG_FILE.unlink()
    except Exception:
        pass


if __name__ == '__main__':
    # Demo usage
    print("Hook Logger Demo\n")

    # Test logging
    log_hook_decision("orchestrator-firewall", "HEAVY", "BLOCK", "Edit", "Orchestrator attempted direct implementation")
    log_hook_decision("assumption-detector", "MEDIUM", "ALLOW", "Read", "No assumptions detected")
    log_hook_decision("question-suppression", "NONE", "SKIPPED", "Task", "Not in RA mode")

    # Show recent logs
    print("Recent logs:")
    print(get_recent_logs(limit=10))
