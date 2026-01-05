# Orchestrator Firewall Hook - User Guide

## Overview

The **Orchestrator Firewall** is a Claude Code hook that enforces the Response-Awareness Framework's core principle:

> **Once you use Task() → you are orchestrator → NEVER implement directly**

This hook prevents a common cognitive trap where orchestrators (who should coordinate) accidentally implement directly (losing their coordination capacity).

---

## What Problem Does This Solve?

### The "Just Do It" Cognitive Trap

When working with the Response-Awareness Framework:

1. **You start orchestrating** → Use `/response-awareness-heavy` → Deploy planning agents
2. **You get a clear plan** → Phase 2 synthesis complete → Know exactly what to implement
3. **Strong momentum to "just do it"** → Brain says "I can implement this quickly!"
4. **You start using Edit/Write** → ❌ **VIOLATION** - Lost orchestrator role

**Result**:
- Lost coordination map
- Can't handle escalations
- Framework broken
- Defeats the purpose of systematic orchestration

### What the Firewall Does

The hook **creates external friction** at the critical moment:

```
You: [About to use Edit() tool in HEAVY tier after using Task()]
Firewall: 🛑 BLOCKED - You are orchestrator, deploy agents instead
```

This forces a **conscious decision** rather than automatic implementation.

---

## How It Works

### State Detection

The firewall analyzes your conversation to detect:

1. **Tier**: Which response-awareness tier you're using
   - LIGHT: Direct implementation usually OK
   - MEDIUM: Conditional (delegate if used Task())
   - HEAVY: Always delegate
   - FULL: Always delegate

2. **Orchestrator Status**: Did you use Task()?
   - If YES → You are orchestrator → Must delegate
   - If NO → Can implement (if tier allows)

3. **Phase**: What phase you're in (optional)
   - Helpful for Phase 2→3 transition checkpoints

### Trigger Conditions

Firewall triggers **before** these tools execute:
- `Edit` - File editing
- `Write` - File creation
- `NotebookEdit` - Jupyter notebook editing

### Decision Logic

```
IF tier == NONE:
    ALLOW (no framework in use)

IF tier == LIGHT:
    IF used_task:
        WARN (consider delegating)
    ELSE:
        ALLOW (direct implementation OK)

IF tier == MEDIUM:
    IF used_task:
        BLOCK (orchestrator must delegate)
    ELSE:
        WARN (consider if delegation needed)

IF tier in [HEAVY, FULL]:
    IF used_task:
        BLOCK (orchestrator NEVER implements)
    ELSE:
        BLOCK (these tiers are orchestrator-only)
```

---

## Installation

### Step 1: Files Created

The hook consists of:

```
.claude/hooks/
├── orchestrator-firewall.py      # Main hook logic (Python)
├── orchestrator-firewall.bat     # Windows wrapper
├── orchestrator-firewall.sh      # Unix/Linux/macOS wrapper
├── hook-config-example.json      # Configuration reference
└── ORCHESTRATOR_FIREWALL_GUIDE.md # This guide
```

### Step 2: Configuration Added

The hook has been integrated into `.claude/settings.json`:

```json
{
  "hooks": {
    "before_tool_use": {
      "Edit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py"
      },
      "Write": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py"
      },
      "NotebookEdit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py"
      }
    }
  }
}
```

### Step 3: Activation

**The hook is now ACTIVE** and will fire automatically when:
- You're using a response-awareness tier
- You attempt to use Edit/Write/NotebookEdit
- Conditions match the firewall rules

---

## Usage Examples

### Example 1: HEAVY Tier - Orchestrator Blocked ✅

**Scenario**: You used `/response-awareness-heavy`, deployed planning agents, got a clear plan, then try to implement.

```
You: [Attempt to use Edit()]

Firewall Output:
🛑 ORCHESTRATOR FIREWALL - CRITICAL VIOLATION

HEAVY/FULL TIER - ORCHESTRATOR MODE

State Detected:
- Tier: HEAVY
- Phase: 3
- Task() usage: YES
- Role: ORCHESTRATOR

❌ CRITICAL RULE VIOLATION:
HEAVY/FULL tier orchestrators NEVER implement directly

Required Action:
Deploy implementation agents:

    Task(subagent_type="general-purpose",
         description="Implement feature X",
         prompt="...")

❌ Tool execution BLOCKED by orchestrator firewall
```

**Result**: Edit() tool is **blocked**, you must deploy agents

---

### Example 2: LIGHT Tier - Warning Only ⚠️

**Scenario**: Simple task, no Task() used, LIGHT tier.

```
You: [Attempt to use Edit()]

Firewall Output:
[No output - firewall allows silently]
```

**Result**: Edit() proceeds normally

---

### Example 3: MEDIUM Tier - Orchestrator Detected 🛑

**Scenario**: MEDIUM tier, used Task() for planning, now trying to implement.

```
You: [Attempt to use Edit()]

Firewall Output:
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

    Task(subagent_type="general-purpose",
         description="Implement [feature]",
         prompt="<implementation details>")

❌ This tool usage will be BLOCKED.
```

**Result**: Edit() is **blocked**, must delegate

---

### Example 4: Deployed Agent - Allowed ✅

**Scenario**: You deployed an implementation agent with Task(), the agent is now implementing.

```
Agent Context: "You are implementing feature X in file.py..."

Agent: [Attempt to use Edit()]

Firewall Output:
[No output - firewall detects deployed agent context, allows]
```

**Result**: Edit() proceeds (agents CAN implement, orchestrators cannot)

---

## Customization

### Disable Temporarily

Edit `.claude/settings.json`:

```json
{
  "hooks": {
    "before_tool_use": {
      "Edit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py",
        "enabled": false  // Add this to disable
      }
    }
  }
}
```

### Enable Debug Mode

Set environment variable before running Claude Code:

```bash
# Windows (PowerShell)
$env:DEBUG_FIREWALL = "1"

# Unix/Linux/macOS
export DEBUG_FIREWALL=1
```

Debug output shows:
```
=== Orchestrator Firewall Diagnostic ===
Tool: Edit
Tier: HEAVY
Phase: 3
Task() used: True
Is Orchestrator: True
Is Deployed Agent: False
=========================================
```

### Adjust Severity Levels

Edit `orchestrator-firewall.py` and modify the `should_block()` logic:

```python
# Make MEDIUM tier warnings instead of blocks
if self.tier == 'MEDIUM':
    if self.used_task:
        return (False, 'WARN', self._generate_message('MEDIUM_ORCHESTRATOR'))
        # Changed first parameter from True to False (warn instead of block)
```

---

## Understanding the Messages

### 🛑 BLOCKED Messages

**When**: Critical violation (orchestrator implementing in MEDIUM/HEAVY/FULL)

**Action**: Tool execution is **prevented**

**Recovery**:
1. Deploy implementation agents with Task()
2. Switch to appropriate tier for direct implementation
3. Or acknowledge deviation and override (disable hook)

### ⚠️ WARNING Messages

**When**: Questionable pattern (LIGHT with Task(), MEDIUM without Task())

**Action**: Tool execution **proceeds** after warning

**Meaning**: Consider whether delegation would be better

### ✅ ALLOW (Silent)

**When**: Appropriate direct implementation

**Action**: Tool executes normally with no output

**Meaning**: Framework approves this usage

---

## Firewall Rules Summary

| Tier | Task() Used | Firewall Action | Reasoning |
|------|-------------|-----------------|-----------|
| NONE | Any | ALLOW | No framework in use |
| LIGHT | No | ALLOW | Direct implementation OK |
| LIGHT | Yes | WARN | Consider delegating |
| MEDIUM | No | WARN | Direct OK but consider |
| MEDIUM | Yes | **BLOCK** | Orchestrator must delegate |
| HEAVY | No | **BLOCK** | Orchestrator-only tier |
| HEAVY | Yes | **BLOCK** | Orchestrator must delegate |
| FULL | Any | **BLOCK** | Always orchestrate |
| Deployed Agent | Any | ALLOW | Agents implement |

---

## Troubleshooting

### Problem: Hook doesn't fire when expected

**Check**:
1. Is hook enabled in `.claude/settings.json`?
2. Is Python accessible from command line? (`python --version`)
3. Are you actually using a response-awareness tier?
4. Enable DEBUG_FIREWALL=1 to see diagnostic output

### Problem: Hook fires when it shouldn't

**Causes**:
- False positive on Task() detection (matched similar pattern)
- Deployed agent not detected correctly

**Solutions**:
- Check conversation context
- Enable debug mode to see state detection
- Report pattern for improvement

### Problem: Want to override firewall temporarily

**Options**:
1. **Disable hook**: Set `"enabled": false` in settings
2. **Remove Task() check**: Comment out Task() detection temporarily
3. **Use different tier**: Switch to LIGHT for one-off implementation

### Problem: Errors when hook runs

**Common causes**:
- Python not in PATH
- Hook file not executable (Unix: `chmod +x orchestrator-firewall.sh`)
- Syntax error in hook script

**Debug**:
```bash
# Test hook directly
python .claude/hooks/orchestrator-firewall.py < conversation.txt
```

---

## Advanced Features

### Custom Messages

Edit `_generate_message()` in `orchestrator-firewall.py` to customize messages:

```python
messages = {
    'MEDIUM_ORCHESTRATOR': f"""
    [Your custom message here]
    """,
}
```

### Additional Tool Coverage

To block other tools (e.g., MultiEdit), add to `.claude/settings.json`:

```json
{
  "hooks": {
    "before_tool_use": {
      "MultiEdit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py"
      }
    }
  }
}
```

### Integration with Other Hooks

Firewall works alongside other hooks. Example combined configuration:

```json
{
  "hooks": {
    "user-prompt-submit": {
      "type": "command",
      "command": "powershell -Command \"[existing hook]\""
    },
    "before_tool_use": {
      "Edit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py"
      }
    },
    "after_tool_use": {
      "Edit": {
        "type": "command",
        "command": "python .claude/hooks/verify-changes.py"
      }
    }
  }
}
```

---

## Philosophy & Design Principles

### Why External Enforcement?

**Internal rules** (documentation) vs **External friction** (hooks):

- Documentation: "Remember to delegate"
- Hook: "You cannot proceed without delegating"

The hook creates **forced decision points** that documentation alone cannot provide.

### Cognitive Load Theory

Orchestrators hold:
- ✅ Architecture map
- ✅ Agent deployment status
- ✅ Integration plan

Orchestrators should NOT hold:
- ❌ Implementation details (which line to edit)
- ❌ Function logic (how to implement)

**If you hold both**, coordination map degrades → framework fails

### The Recovery Protocol

If firewall triggers:

1. **STOP** implementing immediately
2. **Document** work done as architectural design
3. **Deploy** implementation agent with design document
4. **Return** to orchestration role

This preserves work while restoring proper role separation.

---

## Performance Impact

**Hook Execution Time**: ~50-200ms per tool invocation
- Parsing conversation: ~10-50ms
- Pattern matching: ~20-100ms
- Message generation: ~10-30ms
- Display output: ~10-20ms

**Negligible impact** on workflow (blocks prevent minutes/hours of wrong-direction work).

---

## Future Enhancements

### Potential Improvements

1. **Phase Transition Detection**: More sophisticated phase marker detection
2. **Agent Deployment Tracking**: Track which agents were deployed
3. **Escalation Detection**: Detect when complexity exceeds tier
4. **Metrics Collection**: Track how often firewall triggers (improve framework)
5. **Smart Whitelisting**: Learn legitimate Edit() patterns in orchestrator mode

### Contributing

This hook is part of the Response-Awareness Framework. Improvements welcome:

- Better state detection algorithms
- More helpful messages
- Additional tier/phase awareness
- Cross-platform compatibility enhancements

---

## Quick Reference

### Enable/Disable

```bash
# Enable
Edit .claude/settings.json → "enabled": true

# Disable
Edit .claude/settings.json → "enabled": false
```

### Debug Mode

```bash
# Windows
$env:DEBUG_FIREWALL = "1"

# Unix/Linux/macOS
export DEBUG_FIREWALL=1
```

### Test Hook

```bash
# Direct test
echo "Task(subagent_type='test')" | python .claude/hooks/orchestrator-firewall.py

# With debug
DEBUG_FIREWALL=1 echo "Task(...)" | python .claude/hooks/orchestrator-firewall.py
```

### Files

```
.claude/hooks/orchestrator-firewall.py   # Main logic
.claude/hooks/orchestrator-firewall.bat  # Windows
.claude/hooks/orchestrator-firewall.sh   # Unix
.claude/settings.json                    # Configuration
```

---

## Summary

The Orchestrator Firewall:
- ✅ Enforces response-awareness framework rules automatically
- ✅ Prevents "Just Do It" cognitive trap
- ✅ Creates forced decision points at critical transitions
- ✅ Tier-aware and phase-aware guidance
- ✅ Customizable and debuggable
- ✅ Minimal performance impact
- ✅ Works alongside other hooks

**Bottom line**: Turns framework rules into executable enforcement, protecting orchestration integrity.

---

**Last Updated**: 2025-10-02
**Version**: 1.0
**Part of**: Response-Awareness Framework
