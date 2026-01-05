#!/usr/bin/env python3
"""
Assumption Detector Hook - Metacognitive Error Prevention

Purpose: Detects when AI makes assumptions without verification (catches #COMPLETION_DRIVE patterns)

Behavior:
- Orchestrator: BLOCK until verified or user asked
- Deployed Agent: WARN to tag with #COMPLETION_DRIVE

Part of the Response-Awareness Framework metacognitive hook suite.
"""

import sys
import re
import os
from typing import List, Tuple, Optional
from hook_logger import log_hook_decision

# ANSI color codes
class Colors:
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    BOLD = '\033[1m'
    END = '\033[0m'

class AssumptionDetector:
    """Detects unverified assumptions in conversation."""

    def __init__(self, conversation: str, tool_name: str):
        self.conversation = conversation
        self.tool_name = tool_name
        self.tier = self._detect_tier()
        self.is_orchestrator = self._detect_orchestrator()

    def _detect_tier(self) -> str:
        """Detect current response-awareness tier from conversation."""
        tier_patterns = [
            (r'/response-awareness-full', 'FULL'),
            (r'/response-awareness-heavy', 'HEAVY'),
            (r'/response-awareness-medium', 'MEDIUM'),
            (r'/response-awareness-light', 'LIGHT'),
            (r'/response-awareness\s+', 'AUTO'),
        ]
        for pattern, tier in tier_patterns:
            if re.search(pattern, self.conversation):
                return tier
        return 'NONE'

    def _detect_orchestrator(self) -> bool:
        """Orchestrator = NO agent deployment marker in recent context."""
        # Check last 10000 chars for agent marker
        recent = self.conversation[-10000:]
        return "<!-- RA_AGENT_CONTEXT: deployed_as=implementer" not in recent

    def _detect_assumptions(self) -> List[Tuple[str, str, int]]:
        """
        Detect assumption patterns in conversation.

        Returns:
            List of (pattern_type, assumption_text, line_context)
        """
        assumptions = []

        # Pattern 1: Explicit "I assume" statements
        assume_patterns = [
            r"I assume ([^.\n]+)",
            r"I'm assuming ([^.\n]+)",
            r"Assuming ([^.\n]+)",
            r"I'll assume ([^.\n]+)",
        ]

        for pattern in assume_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                assumption_text = match.group(1)
                assumptions.append(("explicit_assume", assumption_text, match.start()))

        # Pattern 2: "Likely" or "probably" without verification
        likelihood_patterns = [
            r"This (likely|probably) ([^.\n]+)",
            r"([^.\n]+) (is likely|is probably|likely|probably) ([^.\n]+)",
        ]

        for pattern in likelihood_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                assumption_text = match.group(0)
                assumptions.append(("likelihood", assumption_text, match.start()))

        # Pattern 3: Method/function existence without verification
        existence_patterns = [
            r"(the method|the function|method|function) ([a-zA-Z_][a-zA-Z0-9_]*)\(",
            r"([a-zA-Z_][a-zA-Z0-9_]*)\(\) (exists|should exist|must exist)",
        ]

        # Only flag if no grep/read verification found
        has_grep = bool(re.search(r'(grep|Grep|search|find)\s+["\']([a-zA-Z_][a-zA-Z0-9_]*)', self.conversation))

        if not has_grep:
            for pattern in existence_patterns:
                matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
                for match in matches:
                    if "def " not in self.conversation[max(0, match.start()-200):match.start()]:
                        # Not in a code definition context
                        assumption_text = match.group(0)
                        assumptions.append(("unverified_existence", assumption_text, match.start()))

        # Pattern 4: "Should be" or "must be" statements (declarative without verification)
        should_patterns = [
            r"([^.\n]+) (should be|must be|has to be) ([^.\n]+)",
        ]

        for pattern in should_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                assumption_text = match.group(0)
                # Check if it's a recommendation vs assumption
                if not any(word in assumption_text.lower() for word in ["recommend", "suggest", "could", "might"]):
                    assumptions.append(("declarative_assumption", assumption_text, match.start()))

        return assumptions

    def _check_verification(self, assumption: Tuple[str, str, int]) -> bool:
        """
        Check if assumption has been verified with tool usage.

        Returns:
            True if verified, False if not
        """
        pattern_type, text, position = assumption

        # Look for verification attempts after the assumption
        verification_context = self.conversation[position:position+2000]

        verification_indicators = [
            r'grep\s+["\']',
            r'Grep\(',
            r'Read\(',
            r'Glob\(',
            r'#COMPLETION_DRIVE',  # Tagged assumption (acceptable)
        ]

        for indicator in verification_indicators:
            if re.search(indicator, verification_context):
                return True

        return False

    def should_block(self) -> Tuple[bool, str, str]:
        """
        Determine if tool usage should be blocked.

        Returns:
            (should_block, severity, message)
        """
        assumptions = self._detect_assumptions()

        if not assumptions:
            return (False, 'ALLOW', '')

        # Filter to unverified assumptions
        unverified = [a for a in assumptions if not self._check_verification(a)]

        if not unverified:
            return (False, 'ALLOW', '')

        # Behavior depends on context
        if self.is_orchestrator:
            return self._orchestrator_behavior(unverified)
        else:
            return self._agent_behavior(unverified)

    def _orchestrator_behavior(self, assumptions: List[Tuple[str, str, int]]) -> Tuple[bool, str, str]:
        """Strict enforcement for orchestrators."""
        message = f"""
{Colors.RED}🛑 ASSUMPTION DETECTOR - ORCHESTRATOR MODE{Colors.END}

{Colors.BOLD}Unverified assumptions detected:{Colors.END}

"""
        for i, (pattern_type, text, _) in enumerate(assumptions[:5], 1):  # Show first 5
            message += f"{i}. {Colors.YELLOW}{text}{Colors.END}\n   Type: {pattern_type}\n\n"

        if len(assumptions) > 5:
            message += f"{Colors.CYAN}... and {len(assumptions) - 5} more assumptions{Colors.END}\n\n"

        message += f"""
{Colors.RED}❌ Violation:{Colors.END}
Orchestrators must verify assumptions BEFORE deploying agents.

{Colors.YELLOW}Required Actions (choose one):{Colors.END}

1. {Colors.BOLD}Verify with tools:{Colors.END}
   - Use Grep() to verify method existence
   - Use Read() to check actual implementation
   - Use Glob() to find relevant files

2. {Colors.BOLD}Ask user for clarification:{Colors.END}
   - Convert assumption to question
   - Get explicit confirmation before proceeding

3. {Colors.BOLD}Tag assumption (if acceptable):{Colors.END}
   - Document with #COMPLETION_DRIVE: [assumption + reasoning]
   - Only for low-risk assumptions

{Colors.CYAN}Why this matters:{Colors.END}
Agents deployed with unverified assumptions will make incorrect implementations.
Catch assumptions in planning, not during agent execution.

{Colors.RED}Tool execution BLOCKED until assumptions resolved.{Colors.END}
"""
        return (True, 'BLOCK', message)

    def _agent_behavior(self, assumptions: List[Tuple[str, str, int]]) -> Tuple[bool, str, str]:
        """Permissive guidance for deployed agents."""
        message = f"""
{Colors.YELLOW}ℹ️  ASSUMPTION DETECTOR - AGENT MODE{Colors.END}

{Colors.BOLD}Assumptions detected during implementation:{Colors.END}

"""
        for i, (pattern_type, text, _) in enumerate(assumptions[:3], 1):  # Show first 3
            message += f"{i}. {text}\n"

        message += f"""
{Colors.GREEN}✅ Autonomous work allowed{Colors.END} - Agents make best-judgment decisions

{Colors.YELLOW}Action Required:{Colors.END}
Tag assumptions in your final output:

{Colors.CYAN}Example:{Colors.END}
### Assumptions Made
- #COMPLETION_DRIVE: Assumed JWT expiry = 1 hour (industry standard)
- #COMPLETION_DRIVE: Assumed bcrypt for passwords (saw pattern in adjacent code)

{Colors.CYAN}Why tag assumptions:{Colors.END}
Orchestrator will verify during Phase 4 validation.
This prevents stopping mid-execution (preserves context).

{Colors.GREEN}Proceeding with implementation...{Colors.END}
"""
        return (False, 'WARN', message)


def main():
    """Main hook entry point."""
    tool_name = os.environ.get('TOOL_NAME', 'Unknown')
    conversation = sys.stdin.read()

    detector = AssumptionDetector(conversation, tool_name)

    # Skip hook if not in response-awareness mode
    if detector.tier == 'NONE':
        log_hook_decision("assumption-detector", "NONE", "SKIPPED", tool_name, "Not in response-awareness mode")
        sys.exit(0)

    # Debug mode
    if os.environ.get('DEBUG_ASSUMPTION_DETECTOR') == '1':
        print(f"\n{Colors.CYAN}=== Assumption Detector Debug ==={Colors.END}")
        print(f"Tool: {tool_name}")
        print(f"Tier: {detector.tier}")
        print(f"Is Orchestrator: {detector.is_orchestrator}")
        assumptions = detector._detect_assumptions()
        print(f"Assumptions found: {len(assumptions)}")
        for pattern_type, text, _ in assumptions[:3]:
            print(f"  - [{pattern_type}] {text[:80]}")
        print(f"{Colors.CYAN}==================================={Colors.END}\n")

    should_block, severity, message = detector.should_block()

    if severity == 'ALLOW':
        log_hook_decision("assumption-detector", detector.tier, "ALLOW", tool_name, "No unverified assumptions detected")
        sys.exit(0)
    elif severity == 'WARN':
        log_hook_decision("assumption-detector", detector.tier, "WARN", tool_name, "Assumptions detected in agent mode")
        print(message)
        sys.exit(0)
    elif severity == 'BLOCK':
        assumptions = detector._detect_assumptions()
        reason = f"Orchestrator has {len(assumptions)} unverified assumptions"
        log_hook_decision("assumption-detector", detector.tier, "BLOCK", tool_name, reason)
        print(message)
        sys.exit(1)

    log_hook_decision("assumption-detector", detector.tier, "ALLOW", tool_name, "Default allow")
    sys.exit(0)


if __name__ == '__main__':
    main()
