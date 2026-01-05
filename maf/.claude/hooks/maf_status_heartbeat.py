#!/usr/bin/env python3
"""
MAF_STATUS Heartbeat Hook

Purpose: Emits MAF_STATUS heartbeat lines that monitoring scripts can detect reliably.

Format: MAF_STATUS role=<role> bead=<bead-id|none> phase=<phase> safe_to_interrupt=<0|1>

Triggers: Before every tool use (PreToolUse)
Detects: Role from environment, bead from conversation, phase from tool type
Emits: Single-line MAF_STATUS to stderr (captured in tmux buffer)

Part of the MAF monitoring heartbeat convention.
"""

import sys
import os
import re
import json
from typing import Optional, Tuple


class MAFStatusHeartbeat:
    """Generates MAF_STATUS heartbeat lines for monitoring."""

    # Tool-to-phase mapping (based on synthesis blueprint)
    PHASE_MAP = {
        # Reading operations (safe)
        'Read': 'reading',
        'Grep': 'reading',
        'Glob': 'reading',
        'LSP': 'reading',

        # Modifying operations (critical - not interruptible)
        'Edit': 'modifying',
        'Write': 'modifying',
        'NotebookEdit': 'modifying',

        # Executing operations (context-dependent)
        'Bash': 'executing',

        # Orchestrating operations (critical - not interruptible)
        'Task': 'orchestrating',
        'Skill': 'orchestrating',
    }

    # Tools that are NOT safe to interrupt
    CRITICAL_TOOLS = {
        'Edit', 'Write', 'NotebookEdit',  # File modifications
        'Task', 'Skill',  # Orchestration
    }

    # Bash commands that are NOT safe to interrupt (git operations)
    CRITICAL_BASH_PATTERNS = [
        r'\bgit\s+(commit|push|pull|rebase|merge)\b',
        r'\bdp\s+(install|remove)\b',
        r'\bpnpm\s+(install|remove)\b',
        r'\bbd\s+(close|complete|update)\b',
    ]

    def __init__(self, conversation: str, tool_name: str):
        self.conversation = conversation
        self.tool_name = tool_name

        # Detect state
        self.role = self._detect_role()
        self.bead = self._detect_bead()
        self.phase = self._detect_phase()
        self.safe_to_interrupt = self._determine_safety()

    def _detect_role(self) -> str:
        """
        Detect agent role from environment variable.

        Environment variable is set by pane startup scripts.
        Fallback to 'unknown' if not set.
        """
        # Primary: Environment variable (set per pane)
        role = os.environ.get('MAF_AGENT_ROLE', '').strip()
        if role:
            return role

        # Secondary: Try to detect from topology config if pane index available
        pane_index = os.environ.get('MAF_PANE_INDEX', '').strip()
        if pane_index and pane_index.isdigit():
            topology_file = '/root/projects/roundtable/.maf/config/agent-topology.json'
            try:
                with open(topology_file, 'r') as f:
                    topology = json.load(f)
                    for pane in topology.get('panes', []):
                        if pane.get('index') == int(pane_index):
                            return pane.get('role', 'unknown')
            except (FileNotFoundError, json.JSONDecodeError, ValueError):
                pass

        # Tertiary: Fallback to hardcoded mapping
        # This shouldn't happen in production, but provides safe fallback
        role_map = {
            '0': 'supervisor',
            '1': 'reviewer',
            '2': 'implementor-1',
            '3': 'implementor-2',
        }
        if pane_index in role_map:
            return role_map[pane_index]

        return 'unknown'

    def _detect_bead(self) -> str:
        """
        Detect current bead ID from conversation.

        Looks for patterns like:
        - "Implement bead roundtable-xxx"
        - "bd start roundtable-xxx"
        - "Bead roundtable-xxx:"
        """
        # Pattern 1: "Implement bead [id]"
        match = re.search(r'[Ii]mplement\s+bead\s+([a-zA-Z0-9_-]+)', self.conversation)
        if match:
            return match.group(1)

        # Pattern 2: "Bead [id]:"
        match = re.search(r'[Bb]ead\s+([a-zA-Z0-9_-]+)\s*:', self.conversation)
        if match:
            return match.group(1)

        # Pattern 3: "bd start [id]" or "bd update [id]"
        match = re.search(r'\b bd\s+(start|update|close)\s+([a-zA-Z0-9_-]+)', self.conversation, re.IGNORECASE)
        if match:
            return match.group(2)

        # Pattern 4: "bead roundtable-" in recent context
        recent = self.conversation[-2000:]
        match = re.search(r'bead\s+([a-zA-Z0-9_-]+)', recent, re.IGNORECASE)
        if match:
            return match.group(1)

        return 'none'

    def _detect_phase(self) -> str:
        """
        Detect phase from tool name.

        Maps tool names to phases using PHASE_MAP.
        """
        return self.PHASE_MAP.get(self.tool_name, 'unknown')

    def _determine_safety(self) -> int:
        """
        Determine if safe to interrupt (0 = not safe, 1 = safe).

        Rules:
        - Reading operations: safe (1)
        - Modifying operations: not safe (0)
        - Orchestrating operations: not safe (0)
        - Bash: context-dependent (check command)
        - Unknown: safe by default (1)
        """
        # Reading is always safe
        if self.tool_name in ['Read', 'Grep', 'Glob', 'LSP']:
            return 1

        # Modifying/orchestrating is not safe
        if self.tool_name in self.CRITICAL_TOOLS:
            return 0

        # Bash: check command content
        if self.tool_name == 'Bash':
            # Extract recent bash command from conversation
            # Look for patterns like <parameter name="command">value</parameter>
            bash_matches = re.findall(
                r'<parameter name="command">([^<]+)</parameter>',
                self.conversation[-5000:]
            )
            if bash_matches:
                recent_command = bash_matches[-1]
                # Check if it's a critical pattern
                for pattern in self.CRITICAL_BASH_PATTERNS:
                    if re.search(pattern, recent_command, re.IGNORECASE):
                        return 0  # Critical operation, not safe

        # Default: safe
        return 1

    def generate_status(self) -> str:
        """
        Generate MAF_STATUS heartbeat line.

        Format: MAF_STATUS role=<role> bead=<bead-id|none> phase=<phase> safe_to_interrupt=<0|1>
        """
        return (
            f"MAF_STATUS "
            f"role={self.role} "
            f"bead={self.bead} "
            f"phase={self.phase} "
            f"safe_to_interrupt={self.safe_to_interrupt}"
        )


def main():
    """Main hook entry point."""

    # Get tool name from environment (Claude Code provides this)
    tool_name = os.environ.get('TOOL_NAME', 'Unknown')

    # Read conversation from stdin (Claude Code provides this)
    conversation = sys.stdin.read()

    # Generate heartbeat
    heartbeat = MAFStatusHeartbeat(conversation, tool_name)
    status_line = heartbeat.generate_status()

    # Emit to stderr (captured in tmux buffer, visible in monitoring)
    # Using stderr with exit code 0 ensures it doesn't block execution
    print(status_line, file=sys.stderr)

    # Exit with 0 to allow tool execution
    sys.exit(0)


if __name__ == '__main__':
    main()
