#!/usr/bin/env python3
"""
Test script for enhanced orchestrator firewall.

Tests all new features:
1. Enhanced agent context detection
2. Phase transition detection
3. Cross-hook tag coordination
4. Contextual recovery guidance
5. Pattern detection
"""

import sys
import os

# Add hooks directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Import the firewall module by executing it
import importlib.util
spec = importlib.util.spec_from_file_location("orchestrator_firewall",
                                               os.path.join(os.path.dirname(__file__), "orchestrator-firewall.py"))
orchestrator_firewall = importlib.util.module_from_spec(spec)
spec.loader.exec_module(orchestrator_firewall)
OrchestratorFirewall = orchestrator_firewall.OrchestratorFirewall

def test_agent_context_detection():
    """Test enhanced agent detection with multiple heuristics."""
    print("\n=== Test 1: Enhanced Agent Context Detection ===")

    # Test 1a: Explicit agent deployment
    conv1 = """
    /response-awareness-heavy "Add feature X"
    Task(subagent_type="general-purpose", prompt="You are implementing feature X in file.py")
    """
    fw1 = OrchestratorFirewall(conv1, "Edit")
    print(f"Test 1a - Explicit agent: Is Agent = {fw1._is_deployed_agent()} (expect True)")

    # Test 1b: Small context without Task()
    conv2 = "This is a small conversation without Task() usage"
    fw2 = OrchestratorFirewall(conv2, "Edit")
    print(f"Test 1b - Small context: Is Agent = {fw2._is_deployed_agent()} (expect True)")

    # Test 1c: Orchestrator markers present
    conv3 = """
    /response-awareness-heavy "Complex task"
    Task(subagent_type="plan-synthesis-agent", ...)
    Phase 1: Planning
    Phase 2: Synthesis complete
    Now deploying implementation agents...
    """
    fw3 = OrchestratorFirewall(conv3, "Edit")
    print(f"Test 1c - Orchestrator markers: Is Agent = {fw3._is_deployed_agent()} (expect False)")

def test_phase_transition_detection():
    """Test critical phase boundary detection."""
    print("\n=== Test 2: Phase Transition Detection ===")

    # Test 2a: At Phase 2→3 transition
    conv1 = """
    Phase 2: Synthesis complete
    Planning is done and finalized.
    Now I will implement the changes to the system.
    """
    fw1 = OrchestratorFirewall(conv1, "Edit")
    print(f"Test 2a - At transition: {fw1.at_phase_transition} (expect True)")

    # Test 2b: Not at transition
    conv2 = """
    Phase 1: Still analyzing requirements
    Need to gather more information
    """
    fw2 = OrchestratorFirewall(conv2, "Edit")
    print(f"Test 2b - Not at transition: {fw2.at_phase_transition} (expect False)")

def test_tag_detection():
    """Test unresolved tag detection."""
    print("\n=== Test 3: Unresolved Tag Detection ===")

    conv = """
    Recent conversation with concerns:
    #COMPLETION_DRIVE: Assuming method exists based on naming
    #QUESTION_SUPPRESSION: Not sure if user wants X or Y, assuming X
    Some more text here
    #CARGO_CULT: Adding error handling because pattern usually has it
    """
    fw = OrchestratorFirewall(conv, "Edit")
    print(f"Test 3 - Tags found: {fw.unresolved_tags}")
    print(f"         Expected: ['COMPLETION_DRIVE', 'QUESTION_SUPPRESSION', 'CARGO_CULT']")

def test_agent_counting():
    """Test deployed agent counting."""
    print("\n=== Test 4: Agent Deployment Counting ===")

    conv = """
    Task(subagent_type="data-architect", ...)
    Task(subagent_type="integration-specialist", ...)
    Task(subagent_type="general-purpose", ...)
    """
    fw = OrchestratorFirewall(conv, "Edit")
    print(f"Test 4 - Agents deployed: {fw.deployed_agent_count} (expect 3)")

def test_repeated_blocks():
    """Test repeated block detection."""
    print("\n=== Test 5: Repeated Block Pattern Detection ===")

    conv = """
    Previous attempts:
    BLOCKED by orchestrator firewall
    Later attempt:
    BLOCKED by orchestrator firewall
    Another try:
    BLOCKED by orchestrator firewall
    """
    fw = OrchestratorFirewall(conv, "Edit")
    print(f"Test 5 - Repeated blocks: {fw.repeated_blocks} (expect 3)")

def test_file_extraction():
    """Test target file extraction."""
    print("\n=== Test 6: Target File Extraction ===")

    # Test 6a: Python file in quotes
    conv1 = 'Going to edit "systems/combat_system.py" next'
    fw1 = OrchestratorFirewall(conv1, "Edit")
    print(f"Test 6a - File extracted: {fw1.target_file} (expect systems/combat_system.py)")

    # Test 6b: File path parameter
    conv2 = 'file_path: "ui/screens/character_screen.py"'
    fw2 = OrchestratorFirewall(conv2, "Edit")
    print(f"Test 6b - File extracted: {fw2.target_file} (expect ui/screens/character_screen.py)")

def test_cross_hook_coordination():
    """Test escalation of WARN→BLOCK when tags present."""
    print("\n=== Test 7: Cross-Hook Coordination ===")

    # MEDIUM tier without Task() normally gives WARN
    # But with unresolved tags, should escalate to BLOCK
    # Need longer conversation to avoid agent detection heuristic
    conv = """
    /response-awareness-medium "Fix bug in the shop system"

    User conversation and context goes here with lots of discussion
    about what needs to be fixed and why this is important.
    More context to make this conversation longer than 10k chars would
    normally require, but for testing we'll add orchestrator markers.

    Phase 1: Analysis
    We're analyzing the shop system bugs...

    Recent tags detected:
    #COMPLETION_DRIVE: Assuming this API method exists based on naming
    #QUESTION_SUPPRESSION: Not asking user about exact approach

    More content to ensure this isn't detected as agent context...
    """ * 100  # Repeat to get over 10k chars
    fw = OrchestratorFirewall(conv, "Edit")
    should_block, severity, message = fw.should_block()

    print(f"Test 7 - With tags in MEDIUM (no Task): severity = {severity}")
    print(f"         Expected: BLOCK (escalated from WARN due to tags)")
    print(f"         Should block: {should_block}")
    print(f"         Is agent: {fw._is_deployed_agent()} (should be False)")

def test_contextual_recovery():
    """Test contextual recovery message generation."""
    print("\n=== Test 8: Contextual Recovery Guidance ===")

    conv = """
    /response-awareness-heavy "Update system"
    Task(subagent_type="general-purpose", ...)
    About to edit "systems/shop_manager.py"
    """
    fw = OrchestratorFirewall(conv, "Edit")
    recovery = fw._generate_contextual_recovery()

    print(f"Test 8 - Recovery guidance generated:")
    print(f"         Contains target file: {'shop_manager.py' in recovery}")
    print(f"         Contains Task() template: {'Task(' in recovery}")
    print(f"         Length: {len(recovery)} chars")

def run_all_tests():
    """Run all enhancement tests."""
    print("\n" + "="*60)
    print("ORCHESTRATOR FIREWALL ENHANCEMENT TESTS")
    print("="*60)

    test_agent_context_detection()
    test_phase_transition_detection()
    test_tag_detection()
    test_agent_counting()
    test_repeated_blocks()
    test_file_extraction()
    test_cross_hook_coordination()
    test_contextual_recovery()

    print("\n" + "="*60)
    print("TESTS COMPLETE")
    print("="*60)
    print("\nReview results above. All detections should match expected values.")
    print("If any tests show unexpected behavior, check the implementation.\n")

if __name__ == '__main__':
    run_all_tests()
