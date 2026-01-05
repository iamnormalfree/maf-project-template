# Hook Behavior Matrix - Orchestrator vs Agent Contexts

**Design Principle**: Orchestrators interact with humans (strict enforcement), Deployed agents work autonomously (permissive guidance with tagging)

---

## Core Design Philosophy

### Orchestrator Context (Main Agent)
- **Can interact with user** - Ask clarifying questions
- **Strict enforcement** - Blocks on ambiguity, missing verification
- **Prevents bad delegation** - Ensures agents have clear instructions
- **Phase 1 requirement** - ALL questions resolved BEFORE synthesis

### Deployed Agent Context (Subagents)
- **Cannot stop to ask questions** - Must work autonomously
- **Permissive guidance** - Warnings, not blocks
- **Tag uncertainties** - `#COMPLETION_DRIVE`, `#QUESTION_SUPPRESSION`, etc.
- **Report findings** - Structured output with assumptions/discoveries
- **Later validation** - Errors tolerated, caught in Phase 4 verification

---

## Hook Behavior By Context

| Hook | Orchestrator (Main) | Deployed Agent (Subagent) |
|------|---------------------|---------------------------|
| **orchestrator-firewall** | 🛑 BLOCK Edit/Write if used Task() | ✅ ALLOW (agents implement) |
| **assumption-detector** | 🛑 BLOCK - must verify or ask user | ⚠️ WARN - tag with #COMPLETION_DRIVE |
| **question-suppression** | 🛑 BLOCK - must ask user | ⚠️ WARN - tag with #QUESTION_SUPPRESSION |
| **phase-checkpoint** | ℹ️ GUIDE - ensure phase complete | ℹ️ SKIP (not in phases) |
| **specification-drift** | ⚠️ WARN - scope creep detected | ⚠️ WARN - report as #Potential_Issue |
| **tag-lifecycle-verifier** | ℹ️ REMIND - tags should be resolved | ✅ SKIP (agents use tags) |
| **context-degradation** | ⚠️ WARN - approaching token limit | ⚠️ WARN - suggest agent restart |
| **sunk-cost-detector** | 🛑 SUGGEST RESTART - deploy new agent | 🛑 SUGGEST RESTART - report failure |

**Legend**:
- 🛑 BLOCK - Prevent tool execution, show message
- ⚠️ WARN - Allow but show warning
- ℹ️ GUIDE - Informational guidance
- ✅ ALLOW/SKIP - No action needed

---

## Context Detection Strategy

### Explicit Marker System (Recommended)

**Orchestrator emits when deploying agent**:
```markdown
<!-- RA_AGENT_CONTEXT: deployed_as=implementer, agent_id=agent_1, tier=HEAVY -->
```

**Hook detection**:
```python
def _is_deployed_agent(self) -> bool:
    """Reliable agent detection via explicit marker."""
    return "<!-- RA_AGENT_CONTEXT: deployed_as=implementer" in self.conversation
```

**Benefits**:
- Zero false positives/negatives ✅
- Clear context boundaries ✅
- Works across all hooks ✅

---

## Agent Information Passing Protocol

### Pattern: Structured Output + LCL Exports

**Agent Final Output Format**:
```markdown
## Implementation Complete: [Feature Name]

### What Was Done
- Implemented authentication with JWT tokens
- Added login/logout endpoints
- Integrated with existing user model

### Assumptions Made
- #COMPLETION_DRIVE: JWT expiry = 1 hour (industry standard, not verified)
- #COMPLETION_DRIVE: Assumed bcrypt for password hashing (saw pattern in adjacent code)

### Issues Discovered
- #Potential_Issue: Found deprecated bcrypt usage in user_model.py:45
- #Potential_Issue: No rate limiting on login endpoint (security concern)

### Critical Decisions (LCL Exports)
- #LCL_EXPORT_CRITICAL: auth_pattern::jwt_with_refresh_tokens
- #LCL_EXPORT_CRITICAL: token_storage::http_only_cookies
- #LCL_EXPORT_FIRM: session_duration::1_hour_access_15_day_refresh

### Verification Needed
- Confirm JWT expiry duration with user requirements
- Verify bcrypt is approved security library
- Decide on rate limiting strategy

### Files Modified
- auth_service.py (new file, 245 lines)
- user_model.py (added token fields, lines 23-45)
- auth_routes.py (new file, 120 lines)
```

**Orchestrator reads this and**:
1. Extracts LCL exports for next agents
2. Notes assumptions requiring verification
3. Adds issues to todo list
4. Proceeds with next agent deployment

---

## Hook-Specific Behavior

### 1. Assumption Detector Hook

#### Orchestrator Context (Strict)
```python
# Detects: "I assume feature X should work like Y"
# No grep verification found

→ 🛑 BLOCK Edit/Write/Task()

Message:
"""
⚠️ ASSUMPTION DETECTOR - ORCHESTRATOR MODE

You made an assumption without verification:
"I assume feature X should work like Y"

Required action:
1. Verify assumption with grep/glob/read, OR
2. Ask user for clarification

Do NOT deploy agents with unverified assumptions.
This creates downstream errors in validation phase.
"""
```

#### Deployed Agent Context (Permissive)
```python
# Detects: Agent assumes without verification

→ ⚠️ ALLOW with reminder

Message:
"""
ℹ️ ASSUMPTION DETECTOR - AGENT MODE

You made an assumption without verification.

Action: Tag assumption in final output:
  #COMPLETION_DRIVE: Assumed X because Y (reason)

This allows orchestrator to verify during validation phase.
"""
```

---

### 2. Question Suppression Detector Hook

#### Orchestrator Context (Strict)
```python
# Detects: Ambiguous requirement without clarification
# Example: User said "add validation" (flexible approach)

→ 🛑 BLOCK Task() deployment

Message:
"""
⚠️ QUESTION SUPPRESSION - ORCHESTRATOR MODE

Ambiguous requirement detected:
"add validation (flexible approach)"

You must ask user BEFORE deploying agents:
- What validation rules? (client-side, server-side, both?)
- What fields require validation?
- Error handling approach?

Phase 1 Planning: ALL ambiguities resolved before synthesis.
"""
```

#### Deployed Agent Context (Permissive)
```python
# Detects: Agent encounters ambiguity during implementation

→ ⚠️ ALLOW with tagging

Message:
"""
ℹ️ QUESTION SUPPRESSION - AGENT MODE

Ambiguity encountered during implementation.

Action: Make best judgment + tag in final output:
  #QUESTION_SUPPRESSION: Chose X over Y because [reasoning]

Report in "Verification Needed" section for orchestrator review.
"""
```

---

### 3. Phase Checkpoint Hook

#### Orchestrator Context (Guidance)
```python
# Triggers: When orchestrator emits "## Phase 3: Implementation"

→ ℹ️ CHECKPOINT guidance

Message:
"""
🚦 PHASE CHECKPOINT: Phase 2 → Phase 3

Before deploying implementation agents, confirm:
✅ Phase 2 synthesis complete?
✅ All user questions answered?
✅ LCL exports documented?
✅ Clear agent delegation strategy?

Phase 3 Action: Deploy implementation agents with Task()
(NOT: Direct implementation with Edit/Write)
"""
```

#### Deployed Agent Context (Skip)
```python
# Agents don't operate in phases
→ ✅ SKIP (no action)
```

---

### 4. Specification Drift Detector Hook

#### Orchestrator Context (Warn)
```python
# After orchestrator plans features beyond user request

→ ⚠️ WARN (don't block, just awareness)

Message:
"""
⚠️ SPECIFICATION DRIFT - ORCHESTRATOR MODE

Planned features beyond user request:
- User asked: "Add login validation"
- Plan includes: Login validation + password reset + 2FA

Action options:
1. Ask user if additional features wanted, OR
2. Tag as #CARGO_CULT and explain reasoning, OR
3. Remove from plan (stick to request)
"""
```

#### Deployed Agent Context (Warn)
```python
# After agent implements features beyond instructions

→ ⚠️ WARN + report

Message:
"""
⚠️ SPECIFICATION DRIFT - AGENT MODE

Implemented features beyond instructions:
- Instructed: "Add login validation"
- Implemented: Login validation + password strength meter

Tag in final output:
  #CARGO_CULT: Added password strength meter (common pattern)

Report in "What Was Done" section for orchestrator review.
"""
```

---

## Agent Restart Pattern (Option C)

### Scenario: Agent Discovers Complexity

**Agent 1 Output**:
```markdown
## Implementation Status: PARTIAL COMPLETION

### What Was Done ✅
- JWT token generation working (auth_service.py:45-120)
- Login endpoint functional (auth_routes.py:10-55)

### What Failed ❌
- Token refresh logic exceeded complexity expectations
- Multiple edge cases discovered (expired refresh, token rotation, concurrent requests)
- #COMPLEXITY_EXCEEDED: Refresh token system needs architectural design

### Assumptions That Failed
- #COMPLETION_DRIVE: Assumed simple token rotation (WRONG - needs state management)

### Recommendation
- Keep working token generation code ✅
- Deploy specialized agent for refresh token architecture
- Provide context: [what was tried, what failed, why]
```

**Orchestrator Response** (Option C):
```python
# Keep Agent 1's successful work
# Deploy Agent 2 for ONLY the failed part

Task(
    subagent_type="general-purpose",
    description="Fix token refresh logic",
    prompt="""
    You are implementing ONLY the token refresh system for authentication.

    CONTEXT FROM AGENT 1:
    - Working: JWT token generation (auth_service.py:45-120) ✅
    - Working: Login endpoint (auth_routes.py:10-55) ✅
    - Failed: Token refresh (multiple edge cases discovered) ❌

    LCL: auth_pattern::jwt_with_refresh_tokens
    LCL: token_storage::http_only_cookies

    WHAT AGENT 1 TRIED:
    - Simple token rotation (failed - needs state management)
    - Concurrent refresh requests caused race conditions

    YOUR TASK:
    Design and implement robust token refresh system handling:
    1. Expired refresh tokens
    2. Token rotation with state management
    3. Concurrent refresh request safety
    4. Edge cases Agent 1 discovered

    DO NOT modify Agent 1's working code (token generation, login).
    Focus ONLY on refresh logic.

    Tag any new assumptions with #COMPLETION_DRIVE.
    Report findings in structured format.
    """
)
```

**Key Points**:
- Preserve Agent 1's successful work ✅
- Agent 2 gets full context (what tried, what failed, why) ✅
- Agent 2 focuses ONLY on failed component ✅
- LCL exports passed forward ✅

---

## Planning Phase Question Resolution (Option A)

### Phase 1: Enumerate ALL Ambiguities

**Orchestrator Pattern**:
```markdown
## Phase 1: Planning - Ambiguity Enumeration

I've analyzed the request: "Add authentication to the app"

Before proceeding to synthesis, I need clarification on:

### Authentication Questions
1. **Authentication method**:
   - JWT tokens? (stateless)
   - Session cookies? (stateful)
   - OAuth/SSO? (third-party)

2. **Session duration**:
   - Short-lived (1 hour)?
   - Long-lived (30 days)?
   - Remember me option?

3. **Password requirements**:
   - Minimum length?
   - Complexity rules (uppercase, numbers, special chars)?
   - Password reset flow needed?

4. **Additional features**:
   - Two-factor authentication?
   - "Remember this device"?
   - Social login (Google, GitHub)?

### Security Questions
5. **Password storage**:
   - Bcrypt? Argon2? (I can recommend)

6. **Rate limiting**:
   - On login attempts?
   - Lockout after failed attempts?

Please answer 1-6 above. I'll proceed to Phase 2 (Synthesis) once clear.
```

**Benefits**:
- All ambiguities resolved BEFORE synthesis ✅
- Agents deployed with complete specs ✅
- No mid-execution questions ✅
- Clear decision record ✅

---

## Hook Enforcement Philosophy Summary

### Orchestrator Hooks (Strict)
**Goal**: Prevent bad agent deployment

**Approach**:
- Block ambiguous requirements → Force user clarification
- Block unverified assumptions → Force verification or user question
- Block premature phase transitions → Ensure systematic work
- Block orchestrator implementation → Enforce delegation

**Rationale**: Orchestrator CAN interact with user, so should get clarity upfront

---

### Deployed Agent Hooks (Permissive)
**Goal**: Enable autonomous work with error tolerance

**Approach**:
- Warn on assumptions → Tag with #COMPLETION_DRIVE
- Warn on ambiguity → Tag with #QUESTION_SUPPRESSION
- Warn on drift → Tag with #CARGO_CULT
- Allow errors → Caught in Phase 4 validation

**Rationale**: Agents CANNOT interact with user, must be autonomous. Tagging + later validation prevents context loss from early agent termination.

---

## Implementation Strategy

### 1. Context Detection (All Hooks)
```python
class BaseMetacognitiveHook:
    def __init__(self, conversation: str):
        self.conversation = conversation
        self.is_orchestrator = self._detect_orchestrator()
        self.is_agent = not self.is_orchestrator

    def _detect_orchestrator(self) -> bool:
        """Orchestrator = NO agent marker in recent context."""
        return "<!-- RA_AGENT_CONTEXT: deployed_as=implementer" not in self.conversation
```

### 2. Behavior Selection (All Hooks)
```python
def should_block(self):
    if self.is_orchestrator:
        return self._orchestrator_behavior()
    else:
        return self._agent_behavior()

def _orchestrator_behavior(self):
    """Strict enforcement - blocks on violations."""
    if self.detect_issue():
        return BLOCK, "Orchestrator must resolve before proceeding"

def _agent_behavior(self):
    """Permissive guidance - warns with tagging."""
    if self.detect_issue():
        return WARN, "Tag assumption in final output"
```

---

## Validation Phase Integration

### Phase 4: Tag Resolution & Verification

**Orchestrator checklist after all agents complete**:

```markdown
## Phase 4: Verification

### Agent Output Review
✅ Agent 1: Auth token generation
   - #COMPLETION_DRIVE: JWT expiry = 1 hour → VERIFY with requirements
   - #Potential_Issue: Deprecated bcrypt → ADD to fix list

✅ Agent 2: Token refresh logic
   - #QUESTION_SUPPRESSION: Chose sliding expiry over fixed → VERIFY design choice

✅ Agent 3: Login UI
   - #CARGO_CULT: Added "Remember Me" checkbox → VERIFY if wanted

### Verification Tasks
1. Confirm JWT expiry duration (Agent 1 assumption)
2. Approve/remove "Remember Me" feature (Agent 3 drift)
3. Review sliding expiry design (Agent 2 choice)
4. Fix deprecated bcrypt (Agent 1 issue)

### Validation Agents
Task(subagent_type="verification",
     prompt="Verify all #COMPLETION_DRIVE assumptions...")
```

**Key**: Agents tag uncertainties → Orchestrator validates in Phase 4 → Errors tolerated during implementation

---

## Summary: Hook Behavior Principles

| Principle | Orchestrator | Deployed Agent |
|-----------|--------------|----------------|
| **User interaction** | ✅ Can ask questions | ❌ Cannot stop to ask |
| **Ambiguity handling** | 🛑 Block until resolved | ⚠️ Tag + best judgment |
| **Assumption handling** | 🛑 Verify or ask user | ⚠️ Tag with #COMPLETION_DRIVE |
| **Error tolerance** | ❌ Prevent bad delegation | ✅ Allow, catch in Phase 4 |
| **Enforcement level** | Strict (blocks) | Permissive (warns) |
| **Phase awareness** | ✅ Operates in phases | ❌ Not phase-aware |
| **Output requirements** | Planning clarity | Structured report + tags |

**Design Goal**: Orchestrators get everything right upfront, agents work autonomously with error tolerance and later validation.

---

**Created**: 2025-10-02
**Purpose**: Define hook behavior across orchestrator vs agent contexts
**Key Insight**: Different enforcement for different capabilities (user interaction vs autonomy)
