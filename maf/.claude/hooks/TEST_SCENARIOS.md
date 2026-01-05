# Orchestrator Firewall - Test Scenarios

## Overview

This document provides comprehensive test scenarios for the Orchestrator Firewall hook, demonstrating when it triggers and what messages appear.

---

## Test Scenario Matrix

| # | Tier | Task() Used | Tool | Expected | Severity | Message Type |
|---|------|-------------|------|----------|----------|--------------|
| 1 | NONE | No | Edit | ✅ Allow | ALLOW | Silent |
| 2 | NONE | Yes | Edit | ✅ Allow | ALLOW | Silent |
| 3 | LIGHT | No | Edit | ✅ Allow | ALLOW | Silent |
| 4 | LIGHT | Yes | Edit | ⚠️ Warn | WARN | Light with Task |
| 5 | MEDIUM | No | Edit | ⚠️ Warn | WARN | Medium no Task |
| 6 | MEDIUM | Yes | Edit | 🛑 Block | BLOCK | Medium orchestrator |
| 7 | HEAVY | No | Edit | 🛑 Block | BLOCK | Heavy no Task |
| 8 | HEAVY | Yes | Edit | 🛑 Block | BLOCK | Heavy orchestrator |
| 9 | FULL | Any | Edit | 🛑 Block | BLOCK | Full orchestrator |
| 10 | HEAVY | Yes (agent) | Edit | ✅ Allow | ALLOW | Deployed agent |

---

## Detailed Test Scenarios

### Scenario 1: No Framework in Use ✅

**Context**:
```
User: "Fix the typo in README.md"
Assistant: [About to use Edit()]
```

**Firewall State**:
- Tier: NONE
- Task() used: No
- Is orchestrator: No

**Result**: ✅ **ALLOW** (silent)

**Reason**: No response-awareness framework in use, firewall doesn't interfere

---

### Scenario 2: LIGHT Tier - No Task() ✅

**Context**:
```
User: "/response-awareness-light Fix the login button color"
Assistant: [About to use Edit()]
```

**Firewall State**:
- Tier: LIGHT
- Task() used: No
- Is orchestrator: No

**Result**: ✅ **ALLOW** (silent)

**Reason**: LIGHT tier allows direct implementation when no Task() was used

---

### Scenario 3: LIGHT Tier - With Task() ⚠️

**Context**:
```
User: "/response-awareness-light Add user validation"
Assistant: Let me investigate...
[Uses Task() to analyze requirements]
[Task returns with analysis]
Assistant: [About to use Edit() to implement]
```

**Firewall State**:
- Tier: LIGHT
- Task() used: Yes
- Is orchestrator: Yes

**Result**: ⚠️ **WARN** (allow with warning)

**Message**:
```
⚠️  ORCHESTRATOR FIREWALL - LIGHT TIER WARNING

You used Task() in this conversation, which makes you an ORCHESTRATOR.

LIGHT tier guideline:
- Direct implementation is OK if NO Task() was used
- But you HAVE used Task() → Consider delegating instead

Recommendation: Deploy an implementation agent to maintain orchestrator role.

Press Enter to proceed anyway (deviation from framework)
```

---

### Scenario 4: MEDIUM Tier - No Task() ⚠️

**Context**:
```
User: "/response-awareness-medium Add API endpoint"
Assistant: [About to use Edit() directly without using Task()]
```

**Firewall State**:
- Tier: MEDIUM
- Task() used: No
- Is orchestrator: No

**Result**: ⚠️ **WARN** (allow with notice)

**Message**:
```
⚠️  ORCHESTRATOR FIREWALL - MEDIUM TIER NOTICE

MEDIUM tier detected - You haven't used Task() yet.

Direct implementation is OK for MEDIUM tier if:
- Single straightforward change
- No Task() usage (you haven't used it)

Consider delegating if:
- Multi-file implementation
- Architectural changes needed

Proceeding is allowed
```

---

### Scenario 5: MEDIUM Tier - With Task() 🛑

**Context**:
```
User: "/response-awareness-medium Refactor authentication system"
Assistant: Let me plan this...
[Uses Task() to explore approaches]
[Planning complete]
Assistant: [About to use Edit() to implement]
```

**Firewall State**:
- Tier: MEDIUM
- Task() used: Yes
- Is orchestrator: Yes

**Result**: 🛑 **BLOCK**

**Message**:
```
🛑 ORCHESTRATOR FIREWALL - BLOCKED

MEDIUM TIER - ORCHESTRATOR MODE DETECTED

State Detected:
- Tier: MEDIUM
- Task() usage: YES
- Role: ORCHESTRATOR

❌ Violation:
You used Task() for planning/analysis → You are now an ORCHESTRATOR
Orchestrators NEVER implement directly.

Required Action:
Deploy implementation agent(s) instead:

    Task(
        subagent_type="general-purpose",
        description="Implement [feature]",
        prompt="<implementation details>"
    )

Why this matters:
Direct implementation DESTROYS your coordination capacity.
You lose ability to handle escalations and maintain architecture map.

❌ This tool usage will be BLOCKED.
```

---

### Scenario 6: HEAVY Tier - Phase 3 Transition 🛑

**Context**:
```
User: "/response-awareness-heavy Implement character image system"
Assistant: ## Phase 1: Planning
[Deploys planning agents with Task()]
## Phase 2: Synthesis
[Synthesizes approaches]
## Phase 3: Implementation
[About to use Edit() to implement]
```

**Firewall State**:
- Tier: HEAVY
- Phase: 3
- Task() used: Yes
- Is orchestrator: Yes

**Result**: 🛑 **BLOCK**

**Message**:
```
🛑 ORCHESTRATOR FIREWALL - CRITICAL VIOLATION

HEAVY/FULL TIER - ORCHESTRATOR MODE

State Detected:
- Tier: HEAVY
- Phase: 3
- Task() usage: YES
- Role: ORCHESTRATOR

❌ CRITICAL RULE VIOLATION:
HEAVY/FULL tier orchestrators NEVER implement directly

This is a cognitive necessity, not just a guideline:
- Holding coordination map excludes holding implementation details
- Direct implementation destroys orchestration capacity
- You will lose ability to handle escalations

Phase Checkpoint:
Phase 3 - Implementation

Before implementing, answer:
1. Do I have a clear plan? (Phase 2 complete?)
2. Am I orchestrator or implementer? → ORCHESTRATOR
3. How many files need changes? → Deploy N agents

Required Action:
Deploy implementation agents:

    # For single file:
    Task(subagent_type="general-purpose",
         description="Implement X in file.py",
         prompt="...")

    # For multiple files (deploy in parallel):
    Task(...)  # Agent 1: file1.py
    Task(...)  # Agent 2: file2.py
    Task(...)  # Agent 3: file3.py

❌ This tool usage is BLOCKED to protect orchestration integrity.
```

---

### Scenario 7: HEAVY Tier - No Task() Yet 🛑

**Context**:
```
User: "/response-awareness-heavy Fix scaling issue"
Assistant: [Immediately tries to use Edit() without planning]
```

**Firewall State**:
- Tier: HEAVY
- Task() used: No
- Is orchestrator: No (but should be)

**Result**: 🛑 **BLOCK**

**Message**:
```
🛑 ORCHESTRATOR FIREWALL - HEAVY/FULL TIER BLOCK

HEAVY/FULL TIER DETECTED

State:
- Tier: HEAVY
- Task() usage: No (yet)

⚠️  HEAVY/FULL Tier Requirement:
These tiers are orchestrator-only. All implementation must be delegated.

Workflow:
1. Planning Phase → Deploy planning agents
2. Synthesis Phase → Deploy synthesis agent
3. Implementation Phase → Deploy implementation agents
4. Verification Phase → Deploy verification agent

Direct implementation is not allowed in HEAVY/FULL tiers.

Action Required:
Deploy implementation agent(s) to maintain framework integrity.
```

**Reason**: HEAVY tier requires orchestration even without Task() usage

---

### Scenario 8: FULL Tier - Always Block 🛑

**Context**:
```
User: "/response-awareness Add authentication system"
[Router routes to FULL tier]
Assistant: [Any attempt to use Edit/Write/NotebookEdit]
```

**Firewall State**:
- Tier: FULL
- Task() used: Varies
- Is orchestrator: Yes (FULL is always orchestrator)

**Result**: 🛑 **BLOCK**

**Reason**: FULL tier is orchestrator-only, never allows direct implementation

---

### Scenario 9: Deployed Agent - Allowed ✅

**Context**:
```
User: "/response-awareness-heavy Fix character rendering"
Orchestrator: ## Phase 3: Implementation
[Deploys implementation agent]

Task(
    subagent_type="general-purpose",
    description="Fix character image scaling",
    prompt="""
    You are implementing the character image scaling fix.

    Files: ui/screens/dialogue_screen.py
    Changes: Update scale_mode from 'contain' to 'fit'
    """
)

[Agent receives prompt and starts working]
Agent: [About to use Edit() to implement the fix]
```

**Firewall State**:
- Tier: HEAVY (inherited from orchestrator)
- Task() used: Yes (by orchestrator)
- Is deployed agent: **YES** (detected from prompt pattern)

**Result**: ✅ **ALLOW** (silent)

**Reason**: Deployed agents ARE implementers, they SHOULD use Edit/Write

**Detection Pattern**:
```python
# Firewall detects phrases like:
"You are implementing"
"You have been deployed to"
"subagent_type.*prompt.*Implement"
```

---

### Scenario 10: AUTO Router - Orchestrator Detected 🛑

**Context**:
```
User: "/response-awareness Investigate character image issues"
Router: [Assesses complexity, routes to HEAVY tier]
Assistant: [Uses Task() to deploy investigation agent]
Assistant: [About to use Edit() to implement findings]
```

**Firewall State**:
- Tier: AUTO (router)
- Task() used: Yes
- Is orchestrator: Yes

**Result**: 🛑 **BLOCK**

**Message**:
```
🛑 ORCHESTRATOR FIREWALL - AUTO ROUTER BLOCK

AUTO ROUTER MODE - ORCHESTRATOR DETECTED

State:
- Mode: AUTO ROUTER
- Task() usage: YES

You used the /response-awareness router, which routed to a tier.
Since you used Task(), you are now an ORCHESTRATOR.

Action Required:
Deploy implementation agents instead of implementing directly.

Tool usage BLOCKED.
```

---

## Edge Cases & Special Scenarios

### Edge Case 1: Multiple Task() Calls

**Context**:
```
Task()  # Planning agent
Task()  # Another planning agent
Task()  # Synthesis agent
[About to use Edit()]
```

**Result**: 🛑 **BLOCK** (first Task() makes you orchestrator)

---

### Edge Case 2: Task() in Earlier Conversation

**Context**:
```
[Earlier conversation]
Task()  # Used 100 messages ago
[Current conversation]
[About to use Edit()]
```

**Result**: 🛑 **BLOCK** (Task() usage persists in conversation)

**Note**: Firewall scans entire conversation, not just recent messages

---

### Edge Case 3: Tier Switch Mid-Conversation

**Context**:
```
User: "/response-awareness-light Quick fix"
[Work starts]
User: "Actually, /response-awareness-heavy this is complex"
[About to use Edit()]
```

**Result**: 🛑 **BLOCK** (most recent tier is HEAVY)

**Detection**: Firewall uses MOST RECENT tier command

---

### Edge Case 4: Commenting About Task()

**Context**:
```
Assistant: "I could use Task() here, but I won't"
[About to use Edit()]
```

**Result**: ✅ **ALLOW**

**Reason**: Firewall looks for actual Task() invocation patterns:
- `Task(subagent_type=`
- `<invoke name="Task">`

Not just the word "Task()"

---

## Testing the Hook

### Manual Test 1: Simple LIGHT Allow

```bash
# Create test conversation
cat > test_light.txt << 'EOF'
User: /response-awareness-light Fix typo
Assistant: I'll fix the typo in the file.
EOF

# Run firewall
python .claude/hooks/orchestrator-firewall.py < test_light.txt
echo $?  # Should be 0 (allow)
```

### Manual Test 2: HEAVY Block

```bash
cat > test_heavy.txt << 'EOF'
User: /response-awareness-heavy Add feature
Assistant: Let me plan this.
Task(subagent_type="general-purpose", description="Plan feature")
Agent: [Planning complete]
Assistant: Now I'll implement.
EOF

python .claude/hooks/orchestrator-firewall.py < test_heavy.txt
echo $?  # Should be 1 (block)
```

### Manual Test 3: Deployed Agent Allow

```bash
cat > test_agent.txt << 'EOF'
User: /response-awareness-heavy Fix bug
Orchestrator: Deploying agent...
Task(subagent_type="general-purpose",
     prompt="You are implementing the bug fix in file.py")
Agent: I am implementing the fix.
EOF

python .claude/hooks/orchestrator-firewall.py < test_agent.txt
echo $?  # Should be 0 (allow - deployed agent)
```

### Debug Mode Testing

```bash
# Enable debug output
export DEBUG_FIREWALL=1

# Run test
echo "Task(subagent_type='test')" | python .claude/hooks/orchestrator-firewall.py

# Expected debug output:
# === Orchestrator Firewall Diagnostic ===
# Tool: Unknown
# Tier: NONE
# Phase: None
# Task() used: True
# Is Orchestrator: True
# Is Deployed Agent: False
# =========================================
```

---

## Expected Behavior Summary

### ✅ ALLOW (Silent) - No Firewall Output

- No framework in use
- LIGHT tier without Task()
- Deployed agent implementing
- Appropriate context for direct implementation

### ⚠️ WARN - Message + Allow

- LIGHT tier with Task() (suggest delegation)
- MEDIUM tier without Task() (consider delegation)

### 🛑 BLOCK - Message + Prevent Execution

- MEDIUM tier with Task() (orchestrator must delegate)
- HEAVY tier (always orchestrator)
- FULL tier (always orchestrator)
- AUTO router with Task() (orchestrator detected)

---

## Regression Tests

### Test Suite 1: Tier Detection

```python
# Test: Detect LIGHT tier
conversation = "/response-awareness-light Fix bug"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.tier == "LIGHT"

# Test: Detect HEAVY tier
conversation = "/response-awareness-heavy Complex feature"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.tier == "HEAVY"

# Test: No tier
conversation = "Just a normal conversation"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.tier == "NONE"
```

### Test Suite 2: Task() Detection

```python
# Test: Detect Task() usage
conversation = "Task(subagent_type='general-purpose', ...)"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.used_task == True

# Test: No Task() usage
conversation = "I'm implementing this directly"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.used_task == False
```

### Test Suite 3: Phase Detection

```python
# Test: Detect Phase 3
conversation = "## Phase 3: Implementation"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.phase == 3

# Test: No phase markers
conversation = "Working on feature"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall.phase == None
```

### Test Suite 4: Deployed Agent Detection

```python
# Test: Detect deployed agent
conversation = "You are implementing the fix in file.py"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall._is_deployed_agent() == True

# Test: Not deployed agent
conversation = "I am orchestrating the work"
firewall = OrchestratorFirewall(conversation, "Edit")
assert firewall._is_deployed_agent() == False
```

---

## Performance Tests

### Benchmark: Conversation Parsing

```python
import time

# Small conversation (100 lines)
small_conversation = "\n".join(["line " + str(i) for i in range(100)])
start = time.time()
firewall = OrchestratorFirewall(small_conversation, "Edit")
firewall.should_block()
elapsed = time.time() - start
print(f"Small conversation: {elapsed*1000:.2f}ms")

# Large conversation (10,000 lines)
large_conversation = "\n".join(["line " + str(i) for i in range(10000)])
start = time.time()
firewall = OrchestratorFirewall(large_conversation, "Edit")
firewall.should_block()
elapsed = time.time() - start
print(f"Large conversation: {elapsed*1000:.2f}ms")
```

**Expected**:
- Small (<100 lines): ~5-20ms
- Medium (100-1000 lines): ~20-100ms
- Large (1000-10000 lines): ~100-500ms

---

## Conclusion

The Orchestrator Firewall provides comprehensive protection against the "Just Do It" cognitive trap across all response-awareness tiers. These test scenarios demonstrate:

- ✅ Tier-specific enforcement
- ✅ Task() usage detection
- ✅ Phase-aware guidance
- ✅ Deployed agent recognition
- ✅ Appropriate warnings vs blocks
- ✅ Clear, actionable messages

**Result**: Framework rules become executable enforcement.
