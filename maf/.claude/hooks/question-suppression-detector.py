#!/usr/bin/env python3
"""
Question Suppression Detector Hook - Prevents Wrong-Direction Work

Purpose: Detects when AI should ask user for clarification but chooses assumptions instead

Behavior:
- Orchestrator: BLOCK - must ask user BEFORE deploying agents (Phase 1 requirement)
- Deployed Agent: WARN - tag with #QUESTION_SUPPRESSION, proceed with best judgment

Part of the Response-Awareness Framework metacognitive hook suite.
"""

import sys
import re
import os
from typing import List, Tuple, Optional, Dict
from hook_logger import log_hook_decision

# ANSI color codes
class Colors:
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    BOLD = '\033[1m'
    END = '\033[0m'

class QuestionSuppressionDetector:
    """Detects ambiguous requirements that need user clarification."""

    def __init__(self, conversation: str, tool_name: str):
        self.conversation = conversation
        self.tool_name = tool_name
        self.tier = self._detect_tier()
        self.is_orchestrator = self._detect_orchestrator()
        self.in_phase_1 = self._detect_phase_1()

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
        """Orchestrator = NO agent deployment marker."""
        recent = self.conversation[-10000:]
        return "<!-- RA_AGENT_CONTEXT: deployed_as=implementer" not in recent

    def _detect_phase_1(self) -> bool:
        """Check if in Phase 1 (Planning)."""
        # Look for Phase 1 markers
        phase_markers = re.findall(r'##\s*Phase\s+(\d+)', self.conversation)
        if phase_markers:
            latest_phase = int(phase_markers[-1])
            return latest_phase == 1
        return False  # No phase markers = could be Phase 1

    def _detect_ambiguities(self) -> List[Tuple[str, str, List[str]]]:
        """
        Detect ambiguous requirements in user messages and AI responses.

        Returns:
            List of (ambiguity_type, ambiguous_text, clarifying_questions)
        """
        ambiguities = []

        # Pattern 1: Flexible/vague requirement words
        vague_patterns = [
            (r'(flexible|simple|basic|standard|typical|usual|normal|generic) (approach|implementation|design|solution)',
             "flexible_requirement",
             ["Which specific approach? (option A, B, or C)", "What defines 'standard' in this context?"]),

            (r'add (some|a|an) ([a-z]+)',
             "vague_feature",
             ["What specific functionality for {feature}?", "What are the requirements for {feature}?"]),

            (r'(maybe|possibly|optionally|perhaps|could) ([^.\n]+)',
             "optional_feature",
             ["Should this be included? Y/N", "What's the priority for this feature?"]),
        ]

        for pattern, ambiguity_type, question_templates in vague_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                ambiguous_text = match.group(0)
                # Check if already clarified
                if not self._is_clarified(ambiguous_text, match.end()):
                    ambiguities.append((ambiguity_type, ambiguous_text, question_templates))

        # Pattern 2: Multiple conditional branches planned without user input
        conditional_patterns = [
            r'(if|depending on|based on) ([^,\n]+), (then|do|implement) ([^.\n]+)',
        ]

        for pattern in conditional_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                ambiguous_text = match.group(0)
                condition = match.group(2)
                questions = [f"Should I {match.group(4)} or not?", f"What determines {condition}?"]
                if not self._is_clarified(ambiguous_text, match.end()):
                    ambiguities.append(("conditional_logic", ambiguous_text, questions))

        # Pattern 3: User request with ambiguous scope
        ambiguous_scope_patterns = [
            (r'add (validation|authentication|security|logging|error handling)',
             "ambiguous_scope",
             ["What type of validation?", "Client-side, server-side, or both?", "What fields/rules?"]),

            (r'improve (performance|security|ux|ui)',
             "improvement_vague",
             ["What specific metrics to improve?", "What's the target/goal?", "What's the priority?"]),

            (r'refactor ([a-z_]+)',
             "refactor_unclear",
             ["What's the goal of refactoring?", "What patterns to apply?", "What should improve?"]),
        ]

        for pattern, ambiguity_type, question_templates in ambiguous_scope_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                ambiguous_text = match.group(0)
                if not self._is_clarified(ambiguous_text, match.end()):
                    ambiguities.append((ambiguity_type, ambiguous_text, question_templates))

        # Pattern 4: Multiple design choices without user preference
        design_choice_patterns = [
            r'(could use|options include|approaches are) ([^.\n]+) (or|and) ([^.\n]+)',
        ]

        for pattern in design_choice_patterns:
            matches = re.finditer(pattern, self.conversation, re.IGNORECASE)
            for match in matches:
                ambiguous_text = match.group(0)
                option_a = match.group(2)
                option_b = match.group(4)
                questions = [f"Prefer {option_a} or {option_b}?", "Which approach fits your needs better?"]
                if not self._is_clarified(ambiguous_text, match.end()):
                    ambiguities.append(("design_choice", ambiguous_text, questions))

        return ambiguities

    def _is_clarified(self, ambiguous_text: str, position: int) -> bool:
        """
        Check if ambiguity has been clarified (user answered or AI asked question).

        Args:
            ambiguous_text: The ambiguous statement
            position: Character position in conversation

        Returns:
            True if clarified, False if not
        """
        # Look for clarification attempts after the ambiguity
        clarification_context = self.conversation[position:position+3000]

        clarification_indicators = [
            r'(Could you clarify|Can you specify|Which|What specific|Do you want)',  # AI asking
            r'User:.*\?',  # User providing answer
            r'#QUESTION_SUPPRESSION',  # Tagged (acceptable if agent)
        ]

        for indicator in clarification_indicators:
            if re.search(indicator, clarification_context, re.IGNORECASE):
                return True

        return False

    def _extract_user_request(self) -> Optional[str]:
        """Extract the most recent user request."""
        # Find last "User:" message
        user_messages = list(re.finditer(r'User:\s*([^\n]+(?:\n(?!User:|Assistant:)[^\n]+)*)', self.conversation))
        if user_messages:
            return user_messages[-1].group(1).strip()
        return None

    def should_block(self) -> Tuple[bool, str, str]:
        """
        Determine if tool usage should be blocked.

        Returns:
            (should_block, severity, message)
        """
        ambiguities = self._detect_ambiguities()

        if not ambiguities:
            return (False, 'ALLOW', '')

        # Orchestrator in Phase 1: Must resolve ALL ambiguities before synthesis
        if self.is_orchestrator and self.in_phase_1:
            return self._orchestrator_phase1_behavior(ambiguities)

        # Orchestrator deploying agents: Should have resolved ambiguities
        if self.is_orchestrator and self.tool_name == "Task":
            return self._orchestrator_deployment_behavior(ambiguities)

        # Deployed agent: Permissive (allow with guidance)
        if not self.is_orchestrator:
            return self._agent_behavior(ambiguities)

        # Default: Allow with warning
        return (False, 'ALLOW', '')

    def _orchestrator_phase1_behavior(self, ambiguities: List[Tuple[str, str, List[str]]]) -> Tuple[bool, str, str]:
        """Phase 1: BLOCK - orchestrator must enumerate ALL questions before synthesis."""
        user_request = self._extract_user_request()

        message = f"""
{Colors.RED}🛑 QUESTION SUPPRESSION DETECTOR - PHASE 1{Colors.END}

{Colors.BOLD}Ambiguous requirements detected{Colors.END}

{Colors.CYAN}User Request:{Colors.END}
"{user_request}"

{Colors.YELLOW}Ambiguities requiring clarification:{Colors.END}

"""
        for i, (ambiguity_type, text, questions) in enumerate(ambiguities[:5], 1):
            message += f"{i}. {Colors.BOLD}{text}{Colors.END}\n"
            message += f"   Type: {ambiguity_type}\n"
            message += f"   {Colors.CYAN}Clarifying questions:{Colors.END}\n"
            for q in questions[:2]:
                message += f"      - {q}\n"
            message += "\n"

        if len(ambiguities) > 5:
            message += f"{Colors.CYAN}... and {len(ambiguities) - 5} more ambiguities{Colors.END}\n\n"

        message += f"""
{Colors.RED}❌ Phase 1 Requirement Violation:{Colors.END}
ALL ambiguities must be resolved BEFORE proceeding to synthesis.

{Colors.YELLOW}Required Action:{Colors.END}
{Colors.BOLD}Ask user for clarification:{Colors.END}

Example response:
"Before proceeding to synthesis, I need clarification:

1. [Ambiguity 1] - [Question A or Question B?]
2. [Ambiguity 2] - [What specific approach?]
3. [Ambiguity 3] - [Should I include X?]

Please answer 1-3 above, and I'll proceed to Phase 2."

{Colors.CYAN}Why this matters:{Colors.END}
Ambiguous requirements → Agents deployed with unclear instructions →
Wrong implementation → Context wasted → Restart from scratch

{Colors.GREEN}Resolve ambiguities NOW to save time later.{Colors.END}

{Colors.RED}Tool execution BLOCKED until questions asked.{Colors.END}
"""
        return (True, 'BLOCK', message)

    def _orchestrator_deployment_behavior(self, ambiguities: List[Tuple[str, str, List[str]]]) -> Tuple[bool, str, str]:
        """Orchestrator deploying agents with unresolved ambiguities."""
        message = f"""
{Colors.RED}🛑 QUESTION SUPPRESSION DETECTOR - AGENT DEPLOYMENT{Colors.END}

{Colors.BOLD}Deploying agents with unresolved ambiguities{Colors.END}

{Colors.YELLOW}Ambiguous requirements:{Colors.END}

"""
        for i, (ambiguity_type, text, _) in enumerate(ambiguities[:3], 1):
            message += f"{i}. {text}\n"

        message += f"""
{Colors.RED}❌ Violation:{Colors.END}
Agents need clear, unambiguous instructions.

{Colors.YELLOW}Required Action:{Colors.END}
1. Return to Phase 1 and ask user for clarification, OR
2. Make explicit decision and document in agent prompt

{Colors.CYAN}Example - Explicit Decision:{Colors.END}
Task(
    prompt='''
    Implement authentication.

    CLARIFICATIONS (orchestrator decisions):
    - Authentication method: JWT tokens (chose over sessions)
    - Session duration: 1 hour (standard practice)
    - Password reset: NOT included (out of scope)

    If you need other decisions, make best judgment and tag with:
    #QUESTION_SUPPRESSION: Chose X because Y
    '''
)

{Colors.RED}Agent deployment BLOCKED until ambiguities resolved.{Colors.END}
"""
        return (True, 'BLOCK', message)

    def _agent_behavior(self, ambiguities: List[Tuple[str, str, List[str]]]) -> Tuple[bool, str, str]:
        """Deployed agent: WARN - proceed with best judgment and tag."""
        message = f"""
{Colors.YELLOW}ℹ️  QUESTION SUPPRESSION DETECTOR - AGENT MODE{Colors.END}

{Colors.BOLD}Ambiguities encountered during implementation:{Colors.END}

"""
        for i, (ambiguity_type, text, _) in enumerate(ambiguities[:2], 1):
            message += f"{i}. {text}\n"

        message += f"""
{Colors.GREEN}✅ Autonomous work allowed{Colors.END} - Make best judgment decisions

{Colors.YELLOW}Action Required:{Colors.END}
Tag decisions in final output:

{Colors.CYAN}Example:{Colors.END}
### Decisions Made (Verification Needed)
- #QUESTION_SUPPRESSION: Chose client-side validation (assumed faster UX)
- #QUESTION_SUPPRESSION: Implemented 8-char min password (common standard)

{Colors.CYAN}Reasoning template:{Colors.END}
#QUESTION_SUPPRESSION: Chose [option X] over [option Y] because [reasoning]

{Colors.CYAN}Why tag decisions:{Colors.END}
Orchestrator validates in Phase 4. User can approve/reject choices.
This prevents stopping mid-implementation (preserves context).

{Colors.GREEN}Proceeding with implementation...{Colors.END}
"""
        return (False, 'WARN', message)


def main():
    """Main hook entry point."""
    tool_name = os.environ.get('TOOL_NAME', 'Unknown')
    conversation = sys.stdin.read()

    detector = QuestionSuppressionDetector(conversation, tool_name)

    # Skip hook if not in response-awareness mode
    if detector.tier == 'NONE':
        log_hook_decision("question-suppression", "NONE", "SKIPPED", tool_name, "Not in response-awareness mode")
        sys.exit(0)

    # Debug mode
    if os.environ.get('DEBUG_QUESTION_DETECTOR') == '1':
        print(f"\n{Colors.CYAN}=== Question Suppression Detector Debug ==={Colors.END}")
        print(f"Tool: {tool_name}")
        print(f"Tier: {detector.tier}")
        print(f"Is Orchestrator: {detector.is_orchestrator}")
        print(f"In Phase 1: {detector.in_phase_1}")
        ambiguities = detector._detect_ambiguities()
        print(f"Ambiguities found: {len(ambiguities)}")
        for ambiguity_type, text, _ in ambiguities[:3]:
            print(f"  - [{ambiguity_type}] {text[:60]}")
        print(f"{Colors.CYAN}==========================================={Colors.END}\n")

    should_block, severity, message = detector.should_block()

    if severity == 'ALLOW':
        log_hook_decision("question-suppression", detector.tier, "ALLOW", tool_name, "No ambiguities detected")
        sys.exit(0)
    elif severity == 'WARN':
        log_hook_decision("question-suppression", detector.tier, "WARN", tool_name, "Ambiguities detected in agent mode")
        print(message)
        sys.exit(0)
    elif severity == 'BLOCK':
        ambiguities = detector._detect_ambiguities()
        reason = f"Orchestrator has {len(ambiguities)} unresolved ambiguities (Phase {'1' if detector.in_phase_1 else 'deployment'})"
        log_hook_decision("question-suppression", detector.tier, "BLOCK", tool_name, reason)
        print(message)
        sys.exit(1)

    log_hook_decision("question-suppression", detector.tier, "ALLOW", tool_name, "Default allow")
    sys.exit(0)


if __name__ == '__main__':
    main()
