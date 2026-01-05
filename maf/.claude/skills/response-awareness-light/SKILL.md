---
name: Response Awareness Light
description: Minimal orchestration for single-file changes, bug fixes, and cosmetic updates. Complexity score 0-1 of 12. Use when requirements are crystal clear, change is isolated with no integration risk, and task involves 1 file only. Fast execution with 5 essential tags. Direct implementation usually OK.
---

# Response Awareness Light

## Purpose
Handles simple, single-file tasks with minimal orchestration overhead. Fast execution with essential error prevention.

**When to use**: Bug fixes, cosmetic changes, simple functions, clear isolated work
**Complexity score**: 0-1 (out of 12)
**Model strategy**: 🚀 **Haiku for implementation** (fast, cost-efficient, excellent instruction-following)

## 🎯 Model & Agent Guidance (LIGHT Tier)

### Model Selection: Haiku for Speed
**LIGHT tier uses Haiku for implementation:**
- Fast execution (2x faster than Sonnet)
- Cost-efficient (1/3 the cost)
- Excellent at following clear instructions
- Perfect for single-file, well-defined tasks

### Agent Deployment
For LIGHT tier, specialized agents are **rarely needed**. Use `general-purpose` or implement directly.

**When to deploy agent in LIGHT**:
```python
# If verification finds issues (Haiku agent)
Task(
    subagent_type="general-purpose",
    model="claude-3-5-haiku-20241022",  # Fast Haiku
    description="Fix validation bug in user_form.py",
    prompt="[clear, specific instructions]"
)
```

**When to consider specialized agents** (still Haiku):
- **test-automation-expert**: If task is specifically about writing tests
- **documentation-specialist**: If task is specifically about docs (rare in LIGHT)
- **refactor-engineer**: If simple refactoring task

**Default for LIGHT**: Direct implementation (no agent) or single Haiku agent if needed

---
## ⚠️ COMMON MISTAKE: Over-orchestrating Simple Tasks

**Symptom**: Deploying multiple specialized agents for single-file bug fix

**Problem**: LIGHT tier exists to be lightweight. Over-orchestration defeats the purpose.

**Solution**:
- Single file, clear fix → Implement directly
- Needs verification → Use `general-purpose` agent
- Don't reach for specialized agents unless domain truly requires it

**Remember**: LIGHT tier is about speed. Keep it simple.
---

## Orchestration Model

**Workflow**: Implement → Quick Verify → Done
- Usually single agent (sometimes two if verify finds issues)
- No planning phase needed (requirements are clear)
- No synthesis phase needed (no architectural decisions)
- Fast turnaround with essential safety checks

**Note**: LIGHT tier typically doesn't need orchestration (direct implementation OK)
Only deploy agent if verification discovers complexity escalation

## The 5 Essential Tags

### #COMPLETION_DRIVE
**What**: Generating plausible content for knowledge gaps
**Recognition signal**: "I'm assuming this method exists based on naming patterns"
**Action**: Tag it, don't skip verification
**Why it matters**: Most common error source

**Example**:
```python
# #COMPLETION_DRIVE: Assuming utils.format_date() exists
result = utils.format_date(timestamp)
```

### #QUESTION_SUPPRESSION
**What**: Should ask user for clarification but choosing assumption instead
**Recognition signal**: "Not sure if they mean X or Y, but I'll assume X to keep moving"
**Action**: STOP - Ask the user immediately
**Why it matters**: Prevents wrong entire directions

**When to ask**:
- Unclear what "fix the styling" means (which styling?)
- "Add validation" but unclear which fields
- Ambiguous variable name or behavior

**Example**:
Instead of assuming, ask: "Do you want email validation or just non-empty check?"

### #CARGO_CULT
**What**: Pattern-completion adding unrequested features
**Recognition signal**: "I'm adding error handling because this pattern usually has it"
**Action**: Mark as #SUGGEST if not specified
**Why it matters**: Pattern momentum operates even in simple tasks

**Example**:
```python
def calculate_total(items):
    # #SUGGEST_ERROR_HANDLING: Should validate items is not empty?
    return sum(item.price for item in items)
```

### #PATH_DECISION
**What**: Multiple implementation approaches considered
**Recognition signal**: "Both approach A and B are viable here"
**Action**: Document choice briefly
**Why it matters**: Even simple tasks have choices worth noting

**Example**:
```python
# #PATH_DECISION: Using list comprehension over map() for readability
filtered = [x for x in data if x > 0]
```

### #Potential_Issue
**What**: Discovered unrelated problem during work
**Recognition signal**: "Noticed deprecated API usage in adjacent code"
**Action**: Report to user, don't fix unless asked
**Why it matters**: Useful discoveries at any scale

**Example**:
```python
# #Potential_Issue: Found deprecated jQuery usage in adjacent file utils.js
# User might want to address separately
```

## Strategic Context Placement (LCL) - Light Usage

For LIGHT tier, LCL is rarely needed (single agent, simple task).

**Use LCL only if**:
- Need to pass critical constraint to verification agent
- Multiple related files with shared context

**Format**:
```python
# #LCL_EXPORT: constraint::no_external_dependencies
```

Orchestrator extracts, passes to verifier:
```
LCL: constraint::no_external_dependencies
```

## Orchestration Protocol

### Step 1: Deploy Implementation Agent

**Task**: [User's request - kept simple and direct]

**Framework guidance**:
```
You are implementing a simple, isolated change.

Essential tags (use when detected):
- #COMPLETION_DRIVE: When assuming unknowns
- #QUESTION_SUPPRESSION: If unclear, ASK USER immediately
- #CARGO_CULT: If adding unrequested features, mark #SUGGEST
- #PATH_DECISION: If multiple approaches, note choice
- #Potential_Issue: If you find unrelated problems

Implementation focus:
- Stay focused on the specific request
- Don't add unrequested features (mark as #SUGGEST if pattern-driven)
- If requirements unclear, ask user immediately
- Simple, direct implementation
```

**Track status**: PENDING → IN_PROGRESS → COMPLETED

### Step 2: Quick Verification

**Deploy if needed** (skip if implementation is trivial and verified):

**Verification agent task**:
```
Quick verification checklist:
1. Does implementation match request exactly? (check for SPECIFICATION_REFRAME)
2. Any #COMPLETION_DRIVE assumptions? Verify they're correct
3. Any #CARGO_CULT features? Remove if truly unnecessary
4. Any #QUESTION_SUPPRESSION? Should have asked user
5. Test the change works as expected

Remove all processing tags (except #PATH_DECISION if present)
Keep code clean and minimal
```

### Step 3: Final Check & Delivery

**Orchestrator confirms**:
- ✅ Request fulfilled
- ✅ No unresolved assumptions
- ✅ No processing tags remain (PATH_DECISION ok to keep)
- ✅ Code is clean and minimal

**Deliver**: Changed file(s) + brief confirmation

## Escalation to MEDIUM

**Escalate when you discover**:
- Multiple files actually need changes
- Integration complexity (APIs, cross-module)
- Requirements more ambiguous than expected
- Architectural decision needed

**How to escalate**:
```python
# #COMPLEXITY_EXCEEDED: Discovered 5 components need updates + API changes
# Recommend: Escalate to MEDIUM tier for proper coordination
```

Orchestrator will re-route to MEDIUM tier.

## Tag Lifecycle (LIGHT)

**During Implementation**:
- Mark tags as patterns detected
- #QUESTION_SUPPRESSION → Ask user immediately (don't continue without answer)

**During Verification**:
- Verify #COMPLETION_DRIVE assumptions
- Remove #CARGO_CULT if unnecessary
- Check #PATH_DECISION is sensible
- Note any #Potential_Issue for user

**Final Delivery**:
- All processing tags removed
- Only #PATH_DECISION remains (optional, as documentation)
- Clean, minimal code

## Example Workflows

### Example 1: Simple Bug Fix
```
Task: "Fix off-by-one error in pagination"
Assessment: LIGHT (single file, clear issue)

Implementation:
- Agent fixes the logic
- Marks #PATH_DECISION: Using ceil() instead of floor() for page count
- No other tags needed

Verification:
- Confirms logic is correct
- Tests edge cases
- Delivers fix

Result: Clean fix, documented decision
```

### Example 2: Unclear Request → Question
```
Task: "Add validation to the form"
Assessment: LIGHT initially

Implementation starts:
- Agent detects #QUESTION_SUPPRESSION: Which fields need validation?
- Agent STOPS and asks: "Do you want validation for all fields or specific ones?
  Should it be client-side only or also server-side?"

User clarifies: "Email and password fields, client-side only"

Implementation continues with clear requirements
```

### Example 3: Escalation Discovery
```
Task: "Update button color"
Assessment: LIGHT (cosmetic, single file)

Implementation discovers:
- Button component is used in 12 places
- Each place has different theming
- Need to update theme system

Agent marks:
- #COMPLEXITY_EXCEEDED: Theme system update needed, affects 12 components

Orchestrator escalates: LIGHT → MEDIUM
Reloads with MEDIUM tier protocols
```

## Pattern Detection Guidance

**Detection reliability in LIGHT tier**:
- ✅ QUESTION_SUPPRESSION: Very detectable (that "should I ask?" moment)
- ✅ CARGO_CULT: Detectable (adding features beyond scope)
- ⚠️ COMPLETION_DRIVE: Sometimes missed mid-generation
- ✅ PATH_DECISION: Usually noticed (moment of choice)
- ✅ Potential_Issue: Obvious when seen

**If unsure about tagging**:
- Tag it anyway (verification will check)
- False positive better than false negative
- Better to mark and remove than miss

## Success Criteria

✅ **Request fulfilled exactly** (no scope creep)
✅ **No unresolved assumptions** (COMPLETION_DRIVE verified)
✅ **No unrequested features** (CARGO_CULT removed or suggested)
✅ **Questions asked when needed** (no QUESTION_SUPPRESSION)
✅ **Clean code delivered** (only PATH_DECISION tags if any)
✅ **Fast execution** (minimal overhead)

## When LIGHT is Perfect

- **Clear, simple request**: "Fix typo in error message"
- **Single file change**: "Update function to return boolean"
- **Isolated work**: "Add console.log for debugging"
- **Cosmetic updates**: "Change button color to blue"
- **Simple additions**: "Add null check before array access"

These tasks don't need planning, synthesis, or complex orchestration. LIGHT tier provides essential safety (the 5 tags) with minimal overhead.
