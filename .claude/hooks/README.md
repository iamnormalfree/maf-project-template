# Response-Awareness Framework Hooks - Quick Start

## What Is This?

A suite of Claude Code hooks that enforce Response-Awareness Framework patterns:

1. **orchestrator-firewall.py** - Prevents orchestrators from implementing directly
2. **assumption-detector.py** - Catches unverified assumptions before they propagate
3. **question-suppression-detector.py** - Detects when AI should ask user instead of guessing

**Recent Upgrade (2025-10-03)**: Added persistent logging and mode-aware activation!

---

## Installation Status

✅ **All 3 Hooks Installed and Active**

The hooks are configured in `.claude/settings.json` and will:
- ✅ **Only run when using `/response-awareness` commands** (mode-aware!)
- ✅ **Log all decisions** to `.claude/hooks/execution.log` (new!)
- ✅ **Skip silently** when working outside response-awareness framework

---

## Recent Improvements (2025-10-03)

### 🎯 Mode-Aware Activation
**Before**: Hooks ran on EVERY tool use, even outside response-awareness workflows.
**After**: Hooks detect `/response-awareness` commands and skip when not in framework mode.

**Example**:
```
# Working normally (outside RA framework)
You: "Fix this typo"
You: [Use Edit()]
Hook: [Silently skips - tier == NONE]

# Working with RA framework
You: "/response-awareness-heavy Fix character system"
You: [Use Task() to plan]
You: [Try to use Edit()]
Hook: 🛑 BLOCKED - You are orchestrator, deploy agents
```

### 📊 Persistent Logging
All hook decisions are now logged to `.claude/hooks/execution.log`:

```
[2025-10-03 15:30:45] [orchestrator-firewall   ] [NONE  ] [SKIPPED] [Edit           ] Not in response-awareness mode
[2025-10-03 15:32:10] [orchestrator-firewall   ] [HEAVY ] [BLOCK  ] [Edit           ] Orchestrator attempted direct implementation
[2025-10-03 15:33:05] [assumption-detector     ] [HEAVY ] [ALLOW  ] [Read           ] No unverified assumptions detected
```

**View logs**:
```bash
python .claude/hooks/view_hook_logs.py           # Last 50 entries
python .claude/hooks/view_hook_logs.py 100       # Last 100 entries
python .claude/hooks/view_hook_logs.py --filter BLOCK  # Only blocks
```

---

## What It Does

### Before the Hook

```
You: /response-awareness-heavy "Add user authentication"
[Deploy planning agents]
[Get clear plan]
You: "Great! Let me implement this..." [Uses Edit()]
❌ PROBLEM: Lost orchestrator role, can't handle escalations
```

### With the Hook

```
You: /response-awareness-heavy "Add user authentication"
[Deploy planning agents]
[Get clear plan]
You: [About to use Edit()]
🛑 FIREWALL: "You used Task() - you are orchestrator - deploy agents"
✅ RESULT: Forced to maintain proper role separation
```

---

## When Does It Fire?

### ✅ ALLOWS (Silent)
- LIGHT tier without Task()
- Deployed implementation agents
- No framework in use

### ⚠️ WARNS (Shows message, allows)
- LIGHT tier with Task() (consider delegating)
- MEDIUM tier without Task() (consider if needed)

### 🛑 BLOCKS (Prevents execution)
- MEDIUM tier with Task() (orchestrator must delegate)
- HEAVY tier (always orchestrator)
- FULL tier (always orchestrator)

---

## Quick Examples

### Example 1: HEAVY Tier - BLOCKED ✅

```
User: /response-awareness-heavy "Fix character images"
You: [Use Task() to plan]
You: [Attempt Edit()]

Firewall: 🛑 BLOCKED - Deploy implementation agents instead
```

### Example 2: LIGHT Tier - ALLOWED ✅

```
User: /response-awareness-light "Fix typo"
You: [Attempt Edit()]

Firewall: [Silent - allows execution]
```

### Example 3: Deployed Agent - ALLOWED ✅

```
Orchestrator: Task(...prompt="You are implementing X")
Agent: [Attempt Edit()]

Firewall: [Silent - agents CAN implement]
```

---

## Files

```
.claude/hooks/
├── orchestrator-firewall.py           # Prevents orchestrator implementation ⭐
├── assumption-detector.py             # Catches unverified assumptions ⭐
├── question-suppression-detector.py   # Detects missing user questions ⭐
├── hook_logger.py                     # Centralized logging system (NEW!) ⭐
├── view_hook_logs.py                  # Log viewer utility (NEW!) ⭐
├── execution.log                      # Hook decision log (auto-generated)
├── orchestrator-firewall.bat          # Windows wrapper
├── orchestrator-firewall.sh           # Unix wrapper
├── ORCHESTRATOR_FIREWALL_GUIDE.md     # Full documentation
├── TEST_SCENARIOS.md                  # Test cases
├── hook-config-example.json           # Configuration reference
└── README.md                          # This file
```

---

## Configuration

Already configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "before_tool_use": {
      "Edit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py"
      },
      "Write": { /* same */ },
      "NotebookEdit": { /* same */ }
    }
  }
}
```

---

## How to Use

### 1. Normal Usage (Hooks Active)

**Outside RA Framework**:
```
You: "Fix this bug"
Hooks: [Skip silently - no interference]
```

**Inside RA Framework**:
```
You: "/response-awareness-heavy Overhaul skill system"
Hooks: [Activate - enforce framework rules]
```

The hooks will:
- Monitor your tier and Task() usage
- Log all decisions to `execution.log`
- Fire before tool usage if framework rules violated
- Show appropriate message (warn or block)

### 2. View Hook Activity

**Quick view** (last 50 entries):
```bash
python .claude/hooks/view_hook_logs.py
```

**With filtering**:
```bash
python .claude/hooks/view_hook_logs.py --filter BLOCK    # Only see blocks
python .claude/hooks/view_hook_logs.py --filter SKIPPED  # See when hooks skipped
python .claude/hooks/view_hook_logs.py 200              # Last 200 entries
```

**Clear logs**:
```bash
python .claude/hooks/view_hook_logs.py --clear
```

### 3. Disable Temporarily

Edit `.claude/settings.json`:

```json
{
  "hooks": {
    "before_tool_use": {
      "Edit": {
        "type": "command",
        "command": "python .claude/hooks/orchestrator-firewall.py",
        "enabled": false  // Add this line
      }
    }
  }
}
```

### 4. Debug Mode

See what the firewall is detecting:

```bash
# Windows
$env:DEBUG_FIREWALL = "1"

# Unix/Linux/macOS
export DEBUG_FIREWALL=1
```

Then use Claude Code normally. Firewall will show diagnostic output.

---

## What Messages Look Like

### 🛑 BLOCK Message (HEAVY Tier)

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

Required Action:
Deploy implementation agents:

    Task(subagent_type="general-purpose",
         description="Implement X",
         prompt="...")

❌ Tool execution BLOCKED by orchestrator firewall
```

### ⚠️ WARN Message (LIGHT Tier)

```
⚠️  ORCHESTRATOR FIREWALL - LIGHT TIER WARNING

You used Task() in this conversation, which makes you an ORCHESTRATOR.

Recommendation: Deploy an implementation agent to maintain orchestrator role.

Press Enter to proceed anyway (deviation from framework)
```

---

## Troubleshooting

### Hook doesn't fire

**Check**:
1. Is Python installed? (`python --version`)
2. Is hook enabled in settings? (see above)
3. Are you using response-awareness tier?

### Hook fires when it shouldn't

**Debug**:
```bash
export DEBUG_FIREWALL=1
# Then use Claude Code and check diagnostic output
```

### Want to bypass temporarily

**Quick fix**: Disable hook in settings (see "Disable Temporarily" above)

---

## Documentation

- **Quick Start**: You're reading it
- **Full Guide**: [ORCHESTRATOR_FIREWALL_GUIDE.md](ORCHESTRATOR_FIREWALL_GUIDE.md) - Complete documentation
- **Test Scenarios**: [TEST_SCENARIOS.md](TEST_SCENARIOS.md) - When firewall triggers
- **Config Example**: [hook-config-example.json](hook-config-example.json) - Integration reference

---

## Philosophy

**Framework rules** + **External enforcement** = **Reliable behavior**

The hook creates **forced decision points** that documentation alone cannot provide.

### The Problem It Solves

**Cognitive Trap**: "I have a clear plan, I'll just implement it quickly"

**Result**: Lose coordination map, can't handle escalations, framework fails

**Solution**: External friction at the critical moment prevents automatic implementation

---

## Quick Reference

| Action | Command/File |
|--------|--------------|
| **Disable hook** | Edit `.claude/settings.json` → `"enabled": false` |
| **Enable debug** | `export DEBUG_FIREWALL=1` (Unix) or `$env:DEBUG_FIREWALL = "1"` (Windows) |
| **Test hook** | `echo "Task(...)" \| python .claude/hooks/orchestrator-firewall.py` |
| **Read full docs** | [ORCHESTRATOR_FIREWALL_GUIDE.md](ORCHESTRATOR_FIREWALL_GUIDE.md) |
| **See test cases** | [TEST_SCENARIOS.md](TEST_SCENARIOS.md) |

---

## Status

✅ **Active and Enforcing**

The orchestrator firewall is now protecting your orchestration integrity!

Try it:
1. Use `/response-awareness-heavy` with a task
2. Deploy a planning agent with Task()
3. Try to use Edit()
4. Watch the firewall block you 😊

---

**Created**: 2025-10-02
**Updated**: 2025-10-03 (Added logging + mode-aware activation)
**Version**: 2.0
**Part of**: Response-Awareness Framework
