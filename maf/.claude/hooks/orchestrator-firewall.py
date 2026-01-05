#!/usr/bin/env python3
"""
Orchestrator Firewall Hook - Response-Awareness Framework Enforcement

Purpose: Prevents orchestrators from implementing directly, enforcing the
         "Once you use Task() → you are orchestrator → NEVER implement" rule

Triggers: Before Edit/Write/NotebookEdit tool usage
Detects: Current tier, phase, and orchestrator status
Actions: Warns or blocks based on tier and context

Part of the Response-Awareness Framework tier system.
"""

import sys
import re
import os
from typing import Dict, Optional, Tuple
from hook_logger import log_hook_decision

# ANSI color codes for terminal output
class Colors:
    RED = '\033[91m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'

class OrchestratorFirewall:
    """Detects and prevents orchestrator implementation violations."""

    def __init__(self, conversation: str, tool_name: str):
        self.conversation = conversation
        self.tool_name = tool_name

        # State detection
        self.tier = self._detect_tier()
        self.phase = self._detect_phase()
        self.used_task = self._detect_task_usage()
        self.is_orchestrator = self.used_task

        # Enhanced detections
        self.at_phase_transition = self._at_critical_phase_transition()
        self.unresolved_tags = self._detect_unresolved_tags()
        self.deployed_agent_count = self._count_deployed_agents()
        self.repeated_blocks = self._check_repeated_blocks()
        self.target_file = self._extract_target_file()

    def _detect_tier(self) -> str:
        """Detect current response-awareness tier from conversation."""
        # Priority order: Most recent tier command wins
        tier_patterns = [
            (r'/response-awareness-full', 'FULL'),
            (r'/response-awareness-heavy', 'HEAVY'),
            (r'/response-awareness-medium', 'MEDIUM'),
            (r'/response-awareness-light', 'LIGHT'),
            (r'/response-awareness\s+', 'AUTO'),  # Router tier
        ]

        for pattern, tier in tier_patterns:
            if re.search(pattern, self.conversation):
                return tier

        return 'NONE'  # No framework in use

    def _detect_phase(self) -> Optional[int]:
        """Detect current phase number from conversation markers."""
        # Look for phase markers like "## Phase 3: Implementation"
        phase_matches = re.findall(r'##\s*Phase\s+(\d+)[:\s]', self.conversation)
        if phase_matches:
            return int(phase_matches[-1])  # Return most recent phase
        return None

    def _detect_task_usage(self) -> bool:
        """Detect if Task() tool has been used (orchestrator indicator)."""
        # Look for Task() invocations
        task_patterns = [
            r'Task\(subagent_type=',
            r'<invoke name="Task">',
            r'invoke name="Task"',
        ]

        for pattern in task_patterns:
            if re.search(pattern, self.conversation, re.IGNORECASE):
                return True
        return False

    def _is_deployed_agent(self) -> bool:
        """
        Enhanced agent context detection with multiple heuristics.

        Checks:
        1. Explicit deployment patterns in prompts
        2. Conversation size (agents start fresh)
        3. Absence of orchestrator markers in recent context
        """
        recent = self.conversation[-5000:]

        # 1. Check for explicit agent deployment patterns
        agent_indicators = [
            r'You are implementing',
            r'You have been deployed to',
            r'Your task is to implement',
            r'Task\(.*prompt=["\'].*[Ii]mplement',
            r'subagent_type.*prompt.*Implement',
            r'You are a.*specialist.*implementing',
        ]

        for pattern in agent_indicators:
            if re.search(pattern, recent, re.IGNORECASE):
                return True

        # 2. Small conversation size suggests deployed agent (fresh context)
        if len(self.conversation) < 10000:  # Less than 10k chars
            # But verify it's not just a short orchestrator session
            # Check for Task() invocations - if present, likely orchestrator
            if not self.used_task:
                return True  # Small context + no Task() = likely agent

        # 3. Check for orchestrator markers in recent history
        # If I'm an orchestrator, I'd have coordination markers
        orchestrator_markers = [
            r'Phase\s+\d+[:\s]',
            r'Deploying.*agent',
            r'coordination\s+map',
            r'synthesize.*plans?',
            r'orchestrat(ing|or)',
            r'Deploy.*specialist',
        ]

        has_orchestrator_markers = any(
            re.search(pattern, recent, re.IGNORECASE)
            for pattern in orchestrator_markers
        )

        # If NO orchestrator markers in recent history → probably agent
        if not has_orchestrator_markers and self.used_task:
            # Task() used somewhere, but no recent orchestration → likely agent
            return True

        return False

    def _at_critical_phase_transition(self) -> bool:
        """
        Detect if at the critical Phase 2→3 transition (planning→implementation).

        This is the highest-risk moment: clear plan + implementation momentum.
        """
        recent = self.conversation[-2000:]

        # Look for synthesis/planning completion markers
        synthesis_complete = bool(re.search(
            r'(synthesis|planning|phase\s*2).*(complete|done|finished)',
            recent,
            re.IGNORECASE
        ))

        # Look for implementation intentions
        implementation_intent = bool(re.search(
            r'(now|let me|I will|I\'ll|going to)\s+(implement|edit|write|create)',
            recent,
            re.IGNORECASE
        ))

        return synthesis_complete and implementation_intent

    def _detect_unresolved_tags(self) -> list:
        """
        Detect unresolved metacognitive tags in recent conversation.

        Tags indicate concerns that should be resolved before implementing.
        """
        recent = self.conversation[-5000:]

        tag_patterns = [
            r'#COMPLETION_DRIVE',
            r'#QUESTION_SUPPRESSION',
            r'#CARGO_CULT',
            r'#SPECIFICATION_REFRAME',
            r'#COMPLEXITY_EXCEEDED',
        ]

        found_tags = []
        for pattern in tag_patterns:
            if re.search(pattern, recent):
                found_tags.append(pattern.replace('#', ''))

        return found_tags

    def _count_deployed_agents(self) -> int:
        """Count how many agents have been deployed via Task()."""
        return len(re.findall(r'Task\(subagent_type=', self.conversation))

    def _check_repeated_blocks(self) -> int:
        """
        Detect if firewall has blocked repeatedly in this session.

        Repeated blocks suggest wrong tier or persistent role confusion.
        """
        recent = self.conversation[-10000:]
        return len(re.findall(r'BLOCKED by orchestrator firewall', recent))

    def _extract_target_file(self) -> Optional[str]:
        """
        Extract the target file from recent context.

        Used for contextual recovery guidance.
        """
        recent = self.conversation[-1000:]

        # Look for file path patterns
        file_patterns = [
            r'["\']([a-zA-Z0-9_/\\.-]+\.py)["\']',
            r'file[_\s]*path[:\s]*["\']([^"\']+)["\']',
            r'([a-zA-Z0-9_/\\]+/[a-zA-Z0-9_.-]+\.py)',
        ]

        for pattern in file_patterns:
            match = re.search(pattern, recent)
            if match:
                return match.group(1)

        return None

    def should_block(self) -> Tuple[bool, str, str]:
        """
        Determine if tool usage should be blocked.

        Enhanced with cross-hook coordination and pattern detection.

        Returns:
            (should_block, severity, message)
            - should_block: True to block execution, False to warn only
            - severity: 'BLOCK', 'WARN', or 'ALLOW'
            - message: User-facing explanation
        """
        # If no framework in use, allow
        if self.tier == 'NONE':
            return (False, 'ALLOW', '')

        # If deployed agent, allow (agents implement, orchestrators don't)
        if self._is_deployed_agent():
            return (False, 'ALLOW', '')

        # Get base decision
        should_block, severity, message = self._base_blocking_decision()

        # ENHANCEMENT 1: Escalate warnings to blocks if unresolved tags present
        if severity == 'WARN' and self.unresolved_tags:
            severity = 'BLOCK'
            message = self._generate_coordinated_warning()
            should_block = True

        # ENHANCEMENT 2: Add phase transition warning
        if severity == 'BLOCK' and self.at_phase_transition:
            message = self._enhance_with_phase_transition_warning(message)

        # ENHANCEMENT 3: Add repeated block pattern detection
        if severity == 'BLOCK' and self.repeated_blocks >= 2:
            message = self._enhance_with_pattern_warning(message)

        return (should_block, severity, message)

    def _base_blocking_decision(self) -> Tuple[bool, str, str]:
        """Base tier-based blocking logic (original algorithm)."""
        # LIGHT tier: Direct implementation OK unless Task() was used
        if self.tier == 'LIGHT':
            if self.used_task:
                return (True, 'WARN', self._generate_message('LIGHT_WITH_TASK'))
            return (False, 'ALLOW', '')

        # MEDIUM tier: Block if used Task() (orchestrator mode)
        if self.tier == 'MEDIUM':
            if self.used_task:
                return (True, 'BLOCK', self._generate_message('MEDIUM_ORCHESTRATOR'))
            return (False, 'WARN', self._generate_message('MEDIUM_NO_TASK'))

        # HEAVY/FULL tier: ALWAYS block direct implementation (orchestrator-only tiers)
        if self.tier in ['HEAVY', 'FULL']:
            if self.used_task:
                return (True, 'BLOCK', self._generate_message('HEAVY_FULL_ORCHESTRATOR'))
            # Even without Task(), HEAVY/FULL should delegate
            return (True, 'BLOCK', self._generate_message('HEAVY_FULL_NO_TASK'))

        # AUTO tier (router): Check if Task() used
        if self.tier == 'AUTO':
            if self.used_task:
                return (True, 'BLOCK', self._generate_message('AUTO_ORCHESTRATOR'))
            return (False, 'ALLOW', '')

        # Default: Allow with warning
        return (False, 'WARN', 'Orchestrator firewall: Unknown state')

    def _generate_coordinated_warning(self) -> str:
        """
        Generate warning when unresolved tags are present.

        This escalates WARN to BLOCK due to cross-hook concerns.
        """
        tags_str = ', '.join(f"#{tag}" for tag in self.unresolved_tags)

        return f"""
{Colors.RED}🛑 ORCHESTRATOR FIREWALL - ENHANCED BLOCK{Colors.END}

{Colors.BOLD}CROSS-HOOK COORDINATION ALERT{Colors.END}

{Colors.CYAN}State Detected:{Colors.END}
- Tier: {Colors.BOLD}{self.tier}{Colors.END}
- Unresolved Tags: {Colors.RED}{tags_str}{Colors.END}

{Colors.RED}❌ Double Risk Detected:{Colors.END}
1. Role violation: You're orchestrator trying to implement
2. Knowledge gaps: Unresolved metacognitive tags present

{Colors.YELLOW}⚠️  Unresolved tags indicate:{Colors.END}
- {Colors.BOLD}#COMPLETION_DRIVE{Colors.END}: Filled knowledge gaps with assumptions
- {Colors.BOLD}#QUESTION_SUPPRESSION{Colors.END}: Should ask user but guessed instead
- {Colors.BOLD}#CARGO_CULT{Colors.END}: Added unrequested features by pattern-matching
- {Colors.BOLD}#COMPLEXITY_EXCEEDED{Colors.END}: Current tier insufficient for task

{Colors.YELLOW}Required Actions:{Colors.END}
1. {Colors.BOLD}Resolve tags first{Colors.END}: Ask user questions, verify assumptions
2. {Colors.BOLD}Then deploy agents{Colors.END}: With resolved context

{Colors.RED}Implementing with unresolved tags = High risk of wrong direction{Colors.END}
"""

    def _enhance_with_phase_transition_warning(self, base_message: str) -> str:
        """Add phase transition boundary warning to block message."""
        phase_warning = f"""
{Colors.YELLOW}⚠️  CRITICAL PHASE TRANSITION DETECTED{Colors.END}

You're at the Phase 2→3 boundary (Planning → Implementation).
This is the {Colors.RED}highest-risk moment{Colors.END} for the "just implement it" trap.

{Colors.CYAN}Checkpoint questions:{Colors.END}
1. Is synthesis truly complete? (All planning paths resolved?)
2. Are there unresolved decisions? (Review Phase 2 output)
3. How many files need changes? (Deploy that many agents)

{Colors.BOLD}Take a breath. Deploy agents. Maintain orchestration integrity.{Colors.END}

"""
        return phase_warning + base_message

    def _enhance_with_pattern_warning(self, base_message: str) -> str:
        """Add repeated block pattern warning to message."""
        pattern_warning = f"""
{Colors.YELLOW}🚨 PATTERN DETECTED: REPEATED BLOCKS{Colors.END}

You've been blocked {Colors.RED}{self.repeated_blocks} times{Colors.END} in this session.

{Colors.CYAN}Possible issues:{Colors.END}
1. {Colors.BOLD}Wrong tier{Colors.END}: Task may be simpler/more complex than current tier
   - Consider escalating {self.tier}→HEAVY or de-escalating {self.tier}→MEDIUM
2. {Colors.BOLD}Role confusion{Colors.END}: Forgetting orchestrator responsibilities
   - Review response-awareness framework guidance
3. {Colors.BOLD}Framework mismatch{Colors.END}: Task may not need systematic approach
   - Consider exiting framework for simpler direct implementation

{Colors.YELLOW}Recommendation:{Colors.END}
Reassess task complexity before continuing.

"""
        return pattern_warning + base_message

    def _generate_contextual_recovery(self) -> str:
        """
        Generate context-aware recovery guidance with ready-to-use templates.
        """
        if self.tool_name == 'Edit' and self.target_file:
            return f"""
{Colors.CYAN}Contextual Recovery:{Colors.END}

You were about to: {Colors.BOLD}Edit("{self.target_file}"){Colors.END}

{Colors.GREEN}Ready-to-use agent deployment:{Colors.END}

Task(
    subagent_type="general-purpose",
    description="Implement changes in {self.target_file}",
    prompt='''
You are implementing planned changes to {self.target_file}.

Your task:
- Apply the implementation plan we developed
- Maintain existing code patterns
- Test changes appropriately

Context from planning:
[Reference Phase 2 synthesis for details]
'''
)
"""
        elif self.tool_name == 'Write' and self.target_file:
            return f"""
{Colors.CYAN}Contextual Recovery:{Colors.END}

You were about to: {Colors.BOLD}Write("{self.target_file}"){Colors.END}

{Colors.GREEN}Ready-to-use agent deployment:{Colors.END}

Task(
    subagent_type="general-purpose",
    description="Create new file {self.target_file}",
    prompt='''
You are creating the new file: {self.target_file}

Your task:
- Implement the specification from our planning phase
- Follow project conventions and patterns
- Include appropriate documentation

Context from planning:
[Reference Phase 2 synthesis for file specification]
'''
)
"""
        else:
            # Generic multi-file guidance
            return f"""
{Colors.CYAN}Contextual Recovery:{Colors.END}

{Colors.YELLOW}For multi-file implementation, deploy agents in parallel:{Colors.END}

# Deploy one agent per file/module
Task(subagent_type="general-purpose",
     description="Implement changes in module A",
     prompt="...")

Task(subagent_type="general-purpose",
     description="Implement changes in module B",
     prompt="...")

{Colors.CYAN}Agents deployed: {self.deployed_agent_count}{Colors.END}
"""

    def _generate_message(self, scenario: str) -> str:
        """Generate tier and context-specific warning/block message."""

        messages = {
            'LIGHT_WITH_TASK': f"""
{Colors.YELLOW}⚠️  ORCHESTRATOR FIREWALL - LIGHT TIER WARNING{Colors.END}

You used {Colors.BOLD}Task(){Colors.END} in this conversation, which makes you an {Colors.BOLD}ORCHESTRATOR{Colors.END}.

{Colors.CYAN}LIGHT tier guideline:{Colors.END}
- Direct implementation is OK if NO Task() was used
- {Colors.RED}But you HAVE used Task(){Colors.END} → Consider delegating instead

{Colors.YELLOW}Recommendation:{Colors.END} Deploy an implementation agent to maintain orchestrator role.

{Colors.GREEN}Press Enter to proceed anyway (deviation from framework){Colors.END}
""",

            'MEDIUM_NO_TASK': f"""
{Colors.YELLOW}⚠️  ORCHESTRATOR FIREWALL - MEDIUM TIER NOTICE{Colors.END}

{Colors.CYAN}MEDIUM tier detected{Colors.END} - You haven't used Task() yet.

{Colors.GREEN}Direct implementation is OK{Colors.END} for MEDIUM tier if:
- Single straightforward change
- No Task() usage (you haven't used it)

{Colors.YELLOW}Consider delegating if:{Colors.END}
- Multi-file implementation
- Architectural changes needed

{Colors.GREEN}Proceeding is allowed{Colors.END}
""",

            'MEDIUM_ORCHESTRATOR': f"""
{Colors.RED}🛑 ORCHESTRATOR FIREWALL - BLOCKED{Colors.END}

{Colors.BOLD}MEDIUM TIER - ORCHESTRATOR MODE DETECTED{Colors.END}

{Colors.CYAN}State Detected:{Colors.END}
- Tier: {Colors.BOLD}MEDIUM{Colors.END}
- Task() usage: {Colors.RED}YES{Colors.END}
- Role: {Colors.BOLD}ORCHESTRATOR{Colors.END}

{Colors.RED}❌ Violation:{Colors.END}
You used Task() for planning/analysis → You are now an {Colors.BOLD}ORCHESTRATOR{Colors.END}
Orchestrators {Colors.BOLD}NEVER{Colors.END} implement directly.

{Colors.YELLOW}Required Action:{Colors.END}
{Colors.BOLD}Deploy implementation agent(s) instead:{Colors.END}

    Task(
        subagent_type="general-purpose",
        description="Implement [feature]",
        prompt="<implementation details>"
    )

{Colors.CYAN}Why this matters:{Colors.END}
Direct implementation DESTROYS your coordination capacity.
You lose ability to handle escalations and maintain architecture map.

{Colors.RED}This tool usage will be BLOCKED.{Colors.END}
""",

            'HEAVY_FULL_ORCHESTRATOR': f"""
{Colors.RED}🛑 ORCHESTRATOR FIREWALL - CRITICAL VIOLATION{Colors.END}

{Colors.BOLD}HEAVY/FULL TIER - ORCHESTRATOR MODE{Colors.END}

{Colors.CYAN}State Detected:{Colors.END}
- Tier: {Colors.BOLD}{self.tier}{Colors.END}
- Phase: {Colors.BOLD}{self.phase if self.phase else 'Unknown'}{Colors.END}
- Task() usage: {Colors.RED}YES{Colors.END}
- Role: {Colors.BOLD}ORCHESTRATOR{Colors.END}

{Colors.RED}❌ CRITICAL RULE VIOLATION:{Colors.END}
{Colors.BOLD}HEAVY/FULL tier orchestrators NEVER implement directly{Colors.END}

This is a {Colors.RED}cognitive necessity{Colors.END}, not just a guideline:
- Holding coordination map {Colors.RED}excludes{Colors.END} holding implementation details
- Direct implementation {Colors.RED}destroys{Colors.END} orchestration capacity
- You will {Colors.RED}lose{Colors.END} ability to handle escalations

{Colors.YELLOW}Phase Checkpoint:{Colors.END}
""" + (f"""
{Colors.CYAN}Phase {self.phase} - {"Implementation" if self.phase == 3 else "Phase " + str(self.phase)}{Colors.END}

{Colors.BOLD}Before implementing, answer:{Colors.END}
1. Do I have a clear plan? (Phase 2 complete?)
2. Am I orchestrator or implementer? → {Colors.RED}ORCHESTRATOR{Colors.END}
3. How many files need changes? → {Colors.YELLOW}Deploy N agents{Colors.END}
""" if self.phase else "") + f"""

{Colors.YELLOW}Required Action:{Colors.END}
{Colors.BOLD}Deploy implementation agents:{Colors.END}

    # For single file:
    Task(subagent_type="general-purpose",
         description="Implement X in file.py",
         prompt="...")

    # For multiple files (deploy in parallel):
    Task(...)  # Agent 1: file1.py
    Task(...)  # Agent 2: file2.py
    Task(...)  # Agent 3: file3.py

{Colors.RED}This tool usage is BLOCKED to protect orchestration integrity.{Colors.END}
""",

            'HEAVY_FULL_NO_TASK': f"""
{Colors.RED}🛑 ORCHESTRATOR FIREWALL - HEAVY/FULL TIER BLOCK{Colors.END}

{Colors.BOLD}HEAVY/FULL TIER DETECTED{Colors.END}

{Colors.CYAN}State:{Colors.END}
- Tier: {Colors.BOLD}{self.tier}{Colors.END}
- Task() usage: {Colors.YELLOW}No (yet){Colors.END}

{Colors.YELLOW}⚠️  HEAVY/FULL Tier Requirement:{Colors.END}
These tiers are {Colors.BOLD}orchestrator-only{Colors.END}. All implementation must be delegated.

{Colors.CYAN}Workflow:{Colors.END}
1. Planning Phase → Deploy planning agents
2. Synthesis Phase → Deploy synthesis agent
3. {Colors.RED}Implementation Phase → Deploy implementation agents{Colors.END}
4. Verification Phase → Deploy verification agent

{Colors.RED}Direct implementation is not allowed in HEAVY/FULL tiers.{Colors.END}

{Colors.YELLOW}Action Required:{Colors.END}
Deploy implementation agent(s) to maintain framework integrity.
""",

            'AUTO_ORCHESTRATOR': f"""
{Colors.RED}🛑 ORCHESTRATOR FIREWALL - AUTO ROUTER BLOCK{Colors.END}

{Colors.BOLD}AUTO ROUTER MODE - ORCHESTRATOR DETECTED{Colors.END}

{Colors.CYAN}State:{Colors.END}
- Mode: {Colors.BOLD}AUTO ROUTER{Colors.END}
- Task() usage: {Colors.RED}YES{Colors.END}

You used the /response-awareness router, which routed to a tier.
Since you used Task(), you are now an {Colors.BOLD}ORCHESTRATOR{Colors.END}.

{Colors.YELLOW}Action Required:{Colors.END}
Deploy implementation agents instead of implementing directly.

{Colors.RED}Tool usage BLOCKED.{Colors.END}
""",
        }

        return messages.get(scenario, f"Unknown scenario: {scenario}")

    def print_diagnostic_info(self):
        """Print diagnostic information (for debugging) - Enhanced version."""
        print(f"\n{Colors.CYAN}=== Orchestrator Firewall Enhanced Diagnostic ==={Colors.END}")
        print(f"\n{Colors.BOLD}Basic State:{Colors.END}")
        print(f"  Tool: {Colors.BOLD}{self.tool_name}{Colors.END}")
        print(f"  Tier: {Colors.BOLD}{self.tier}{Colors.END}")
        print(f"  Phase: {Colors.BOLD}{self.phase if self.phase else 'None'}{Colors.END}")
        print(f"  Task() used: {Colors.BOLD}{self.used_task}{Colors.END}")
        print(f"  Is Orchestrator: {Colors.BOLD}{self.is_orchestrator}{Colors.END}")
        print(f"  Is Deployed Agent: {Colors.BOLD}{self._is_deployed_agent()}{Colors.END}")

        print(f"\n{Colors.BOLD}Enhanced Detections:{Colors.END}")
        print(f"  At Phase Transition: {Colors.BOLD}{self.at_phase_transition}{Colors.END}")
        print(f"  Unresolved Tags: {Colors.BOLD}{', '.join(self.unresolved_tags) if self.unresolved_tags else 'None'}{Colors.END}")
        print(f"  Deployed Agent Count: {Colors.BOLD}{self.deployed_agent_count}{Colors.END}")
        print(f"  Repeated Blocks: {Colors.BOLD}{self.repeated_blocks}{Colors.END}")
        print(f"  Target File: {Colors.BOLD}{self.target_file if self.target_file else 'Not detected'}{Colors.END}")

        print(f"\n{Colors.BOLD}Conversation Context:{Colors.END}")
        print(f"  Total length: {Colors.BOLD}{len(self.conversation)}{Colors.END} chars")
        print(f"  Recent (5k): {Colors.BOLD}{len(self.conversation[-5000:])}{Colors.END} chars")

        print(f"{Colors.CYAN}============================================={Colors.END}\n")


def main():
    """Main hook entry point."""

    # Get tool name from environment (Claude Code provides this)
    tool_name = os.environ.get('TOOL_NAME', 'Unknown')

    # Read conversation from stdin (Claude Code provides this)
    conversation = sys.stdin.read()

    # Create firewall instance
    firewall = OrchestratorFirewall(conversation, tool_name)

    # Debug mode (set DEBUG_FIREWALL=1 environment variable)
    if os.environ.get('DEBUG_FIREWALL') == '1':
        firewall.print_diagnostic_info()

    # Skip hook if not in response-awareness mode
    if firewall.tier == 'NONE':
        log_hook_decision("orchestrator-firewall", "NONE", "SKIPPED", tool_name, "Not in response-awareness mode")
        sys.exit(0)

    # Check if should block
    should_block, severity, message = firewall.should_block()

    if severity == 'ALLOW':
        log_hook_decision("orchestrator-firewall", firewall.tier, "ALLOW", tool_name, "Agent implementation or direct work allowed")
        sys.exit(0)

    elif severity == 'WARN':
        # Print warning but allow execution
        log_hook_decision("orchestrator-firewall", firewall.tier, "WARN", tool_name, "Warning issued but allowed")
        print(message)
        print(f"{Colors.GREEN}Proceeding with tool execution...{Colors.END}\n")
        sys.exit(0)

    elif severity == 'BLOCK':
        # Print block message and prevent execution
        reason = f"Orchestrator attempted direct implementation (Phase {firewall.phase})" if firewall.phase else "Orchestrator attempted direct implementation"

        # Add tag context to log if present
        if firewall.unresolved_tags:
            reason += f" | Unresolved tags: {', '.join(firewall.unresolved_tags)}"

        log_hook_decision("orchestrator-firewall", firewall.tier, "BLOCK", tool_name, reason)
        print(message)
        print(f"\n{Colors.RED}❌ Tool execution BLOCKED by orchestrator firewall{Colors.END}")

        # Show contextual recovery guidance
        print(firewall._generate_contextual_recovery())

        print(f"\n{Colors.CYAN}Alternative recovery options:{Colors.END}")
        print(f"1. Switch to appropriate tier for direct implementation")
        print(f"2. Acknowledge deviation and override (edit hook settings)")
        print(f"3. Exit response-awareness framework if task is simpler than expected\n")
        sys.exit(1)  # Non-zero exit code blocks tool execution

    # Default: Allow with diagnostic
    log_hook_decision("orchestrator-firewall", firewall.tier, "ALLOW", tool_name, "Default allow")
    sys.exit(0)


if __name__ == '__main__':
    main()
