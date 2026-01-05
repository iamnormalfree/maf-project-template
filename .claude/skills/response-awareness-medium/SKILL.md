---
name: Response Awareness Medium
description: Multi-file features with optional planning and basic synthesis. Complexity score 2-4 of 12. Use when task involves 2-5 related files, mostly clear requirements with minor questions, touches existing APIs, or introduces new features in existing patterns. Handles 90% of real-world development with 15 tags. Deploy agents if complexity emerges.
---


## Purpose
Handles multi-file features and moderate complexity with optional planning and basic synthesis. Balances rigor with efficiency for standard development work.

**When to use**: Multi-file features, moderate refactoring, contained systems
**Complexity score**: 2-4 (out of 12)
**Model strategy**: 🧠 **Opus for planning** → 🚀 **Haiku for implementation** → 🧠 **Sonnet for verification**

## 🎯 Model & Agent Guidance (MEDIUM Tier)

### Model Selection: Tiered Approach
**MEDIUM tier uses tiered model strategy:**
- **Planning (if needed)**: Opus orchestrator does lightweight planning
- **Implementation**: Haiku agents execute clear plans
- **Verification**: Sonnet orchestrator verifies results

**Why tiered works for MEDIUM:**
- Opus creates superior implementation instructions (maximum planning capability)
- Haiku follows instructions quickly and cost-efficiently
- Sonnet verifies quality with strong metacognition
- 2-5 files with clear guidance = Haiku sweet spot

### Recommended Specialized Agents for MEDIUM

| Task Domain | Specialized Agent | Model | Notes |
|-------------|------------------|-------|-------|
| **Data modeling** | `data-architect` | Haiku | Clear schemas, well-defined |
| **API/event integration** | `integration-specialist` | Haiku | Follow integration patterns |
| **Code refactoring** | `refactor-engineer` | Haiku | Mechanical transformations |
| **Performance work** | `performance-analyst` | Haiku | Measurable optimizations |
| **Security tasks** | `security-analyst` | Haiku | Defined security patterns |
| **Test creation** | `test-automation-expert` | Haiku | Clear test specifications |
| **UI state bugs** | `ui-state-synchronization-expert` | Haiku | State synchronization fixes |
| **Documentation** | `documentation-specialist` | Haiku | Template-based docs |
| **Generic/exploratory** | `general-purpose` | Haiku | Fallback only |

**Example deployment**:
```python
# Planning (Opus orchestrator) creates clear plan:
Task(
    subagent_type="implementation-planner",
    model="claude-opus-4-5-20251101",  # Opus for planning
    description="Plan skill tree data model implementation",
    prompt="Analyze codebase and create detailed implementation plan..."
)

# Then deploy Haiku implementer:
# ✅ CORRECT - Haiku with specialized agent
Task(
    subagent_type="data-architect",
    model="claude-3-5-haiku-20241022",  # Fast Haiku implementation
    description="Implement skill tree data model",
    prompt="""
    Implement the skill tree data model per this specification:
    [Clear, detailed specification from Opus planning]

    Files to create:
    - models/skill_tree.py
    - models/skill_node.py

    [Explicit schema details...]
    """
)

# Verification (Sonnet):
Task(
    subagent_type="general-purpose",
    model="claude-sonnet-4-5-20250929",  # Sonnet for verification
    description="Verify skill tree implementation",
    prompt="Verify implementation matches requirements..."
)
```

---
## ⚠️ COMMON MISTAKE: Defaulting to `general-purpose`

**Symptom**: You're about to write `Task(subagent_type="general-purpose", ...)`

**STOP and ask**: "Is there a specialized agent for this domain?"
1. Check the table above
2. Check `.claude/agents/` directory
3. Use the specialist if available

**Why this matters**: Specialized agents have:
- Domain-specific workflows
- Battle-tested patterns
- Contextual expertise
- Better quality outcomes

**When `general-purpose` is OK**:
- Quick exploratory work
- Task spans unrelated domains
- No specialist fits the domain

**Rule**: Specialized first, generic as fallback.
---

## Orchestration Model

**Workflow**: (Optional Planning) → Implementation → Verification → Done
- Optional planning when architectural choices exist
- Basic synthesis if multiple approaches need evaluation
- Systematic implementation with assumption tracking
- Thorough verification with tag resolution
- Handles most real-world development tasks

**⚠️ IMPLEMENTATION FIREWALL:**
If you use Task() for planning/analysis → you are orchestrator → delegate implementation
Direct implementation only if: (1) No Task() used AND (2) single straightforward change

## Tag Set (15 Total)

### Core Tags (from LIGHT)
1. **#COMPLETION_DRIVE** - Assuming unknowns
2. **#QUESTION_SUPPRESSION** - Should ask but assuming
3. **#CARGO_CULT** - Pattern-driven features
4. **#PATH_DECISION** - Multiple approaches
5. **#Potential_Issue** - Unrelated discoveries

### MEDIUM Additions (11 more)
6. **#SPECIFICATION_REFRAME** - Solving different problem
7. **#DOMAIN_MIXING** - Blending similar APIs/versions
8. **#CONSTRAINT_OVERRIDE** - Violating stated constraints
9. **#SUNK_COST_COMPLETION** - Continuing bad approach
10. **#CONTEXT_DEGRADED** - Can't recall earlier details
11. **#LCL_EXPORT_CRITICAL** - Must preserve for next phase
12. **#SUGGEST_ERROR_HANDLING** - Pattern-driven error handling
13. **#SUGGEST_EDGE_CASE** - Pattern-driven edge cases
14. **#FALSE_COMPLETION** - Feels done but isn't
15. **#RESOLUTION_PRESSURE** - Bias toward conclusion
16. **#SKILL_GAP** - Area needs new skill in catalog (collected for user report)

## Tag Descriptions & Usage

### #SPECIFICATION_REFRAME
**What**: Subtly solving a different problem than requested
**Recognition signal**: "They asked for X but I'm building for use case Y"
**Action**: Re-read requirements, verify scope alignment
**Why in MEDIUM**: Room for misunderstanding grows with complexity

**Example**:
```python
# User asked: "Add login validation"
# #SPECIFICATION_REFRAME: Building full auth system with roles/permissions
# Should focus just on login validation as requested
```

### #DOMAIN_MIXING
**What**: Blending details from similar but distinct domains
**Recognition signal**: "Using React Router syntax but feels like v5... wait, am I mixing versions?"
**Action**: Verify which specific version/variant applies
**Why in MEDIUM**: Technical accuracy matters more in multi-file work

**Example**:
```javascript
// #DOMAIN_MIXING: Mixing React Router v5 and v6 APIs
// v6: useNavigate()
// v5: useHistory()
// Check which version we're using
```

### #CONSTRAINT_OVERRIDE
**What**: About to violate a stated constraint
**Recognition signal**: "They said no dependencies... but I'm about to import lodash"
**Action**: Stop - either respect constraint or ask permission
**Why in MEDIUM**: Requirements get more specific

**Example**:
```python
# Constraint: "Keep it under 50 lines"
# #CONSTRAINT_OVERRIDE: Implementation is 75 lines
# Need to refactor or ask if 75 is acceptable
```

### #SUNK_COST_COMPLETION
**What**: Continuing suboptimal approach due to investment
**Recognition signal**: "This approach is wrong but I'm 200 lines in"
**Action**: Mark it - verification evaluates if restart needed
**Why in MEDIUM**: More code = higher sunk cost risk

**Example**:
```python
# #SUNK_COST_COMPLETION: Recursive approach causing stack issues
# Should switch to iterative but already deep in recursion
# Mark for verification review
```

### #CONTEXT_DEGRADED
**What**: Can't retrieve earlier context with precision
**Recognition signal**: Reconstructing rather than recalling specifics
**Action**: Re-read source rather than inferring
**Why in MEDIUM**: Longer sessions across multiple files

**Example**:
```python
# #CONTEXT_DEGRADED: Can't recall exact parameter order for process_data()
# Re-reading the function definition instead of guessing
```

### #LCL_EXPORT_CRITICAL
**What**: Critical information that must pass cleanly to next phase
**Recognition signal**: "Next agent needs to know this architectural decision"
**Action**: Export with LCL tag
**Why in MEDIUM**: Cross-agent context becomes important

**Example**:
```python
# #LCL_EXPORT_CRITICAL: auth_pattern::jwt_with_refresh_tokens
# Next implementation agent needs this decision
```

### #SUGGEST_ERROR_HANDLING
**What**: Error handling from pattern-completion, not requirements
**Recognition signal**: "I'm adding try/catch because this pattern usually has it"
**Action**: Mark as suggestion, don't implement unless specified
**Why in MEDIUM**: Worth collecting suggestions for user

**Example**:
```python
def fetch_user(id):
    # #SUGGEST_ERROR_HANDLING: Should handle network timeout?
    return api.get(f"/users/{id}")
```

### #SUGGEST_EDGE_CASE
**What**: Edge case handling from pattern-association
**Recognition signal**: "Should probably handle empty array case"
**Action**: Mark as suggestion if not specified
**Why in MEDIUM**: Pattern-driven features appear more

**Example**:
```python
# #SUGGEST_EDGE_CASE: What if items array is empty?
total = sum(item.price for item in items)
```

### #FALSE_COMPLETION
**What**: Task feels done but requirements objectively unmet
**Recognition signal**: "That handles it" (but only 3 of 5 requirements done)
**Action**: Check requirements list before concluding
**Why in MEDIUM**: Multi-step tasks have completion risk

**Example**:
```python
# Requirement: "Add user CRUD operations"
# Implemented: Create, Read
# #FALSE_COMPLETION: Feels done but Update/Delete missing
```

### #RESOLUTION_PRESSURE
**What**: Increasing bias toward conclusion
**Recognition signal**: "I want to say 'that should work' without testing"
**Action**: Deploy continuation agent for fresh perspective
**Why in MEDIUM**: Longer work increases pressure

### #SKILL_GAP
**What**: Area where no relevant skill exists in the catalog
**Recognition signal**: "Working in a domain with no helpful skills available" or "Skill catalog returned low/no relevance"
**Action**: Tag the area with domain and description for end-of-session report
**Why in MEDIUM**: Multi-file work reveals catalog gaps that could help future tasks

**Example**:
```python
# #SKILL_GAP: websocket-testing
# Need skill for WebSocket connection testing and message validation
# Would help with real-time feature verification

# #SKILL_GAP: graphql-mutations
# Need skill for GraphQL mutation testing patterns
# Recurring pattern in this codebase
```

**Manual reporting**: Agents can also report gaps programmatically:
```bash
python .claude/hooks/report_skill_gap.py "domain-name" "description of needed skill" "optional context"
```

## Strategic Context Placement (LCL)

MEDIUM tier uses LCL for cross-agent coordination:

### When to Export
- Architectural decisions (auth pattern, state management choice)
- Critical constraints (no external deps, performance targets)
- Integration contracts (API shape, data flow)

### Export Levels
**#LCL_EXPORT_CRITICAL**: Must preserve exactly (auth decisions, core architecture)
**#LCL_EXPORT_FIRM**: Maintain with precision (API contracts, integration points)
**#LCL_EXPORT_CASUAL**: General guidance (code style preferences)

### Lifecycle
1. Planning/Implementation agents mark: `#LCL_EXPORT_CRITICAL: key::value`
2. Orchestrator extracts and converts: `LCL: key::value`
3. Next phase agents receive and work with implicitly
4. No repeated discussion - stated once, maintained cleanly

**Example**:
```python
# Agent 1 (Planning):
# #LCL_EXPORT_CRITICAL: state_management::redux_toolkit
# #LCL_EXPORT_FIRM: api_layer::rest_with_react_query

# Orchestrator extracts, passes to Agent 2:
LCL: state_management::redux_toolkit
LCL: api_layer::rest_with_react_query

# Agent 2 implements with this context (doesn't restate it)
```

## Orchestration Protocol

### Optional Phase 0: Quick Planning

**Deploy planning agent when**:
- Multiple viable approaches exist
- Architectural decision needed
- Integration complexity unclear

**Specialized Agents to Consider**:
- **Data tasks** → `data-architect` (not generic agent)
- **Integration tasks** → `integration-specialist` (not generic agent)
- **Refactoring** → `refactor-engineer` (not generic agent)
- **Performance** → `performance-analyst` (not generic agent)
- **Security** → `security-analyst` (not generic agent)
- **Generic/exploratory** → `general-purpose` (fallback only)

**Planning agent task**:
```
Analyze: [task description]

Explore 2-3 approaches:
- Approach A: [description, pros/cons]
- Approach B: [description, pros/cons]

Mark decisions with #PATH_DECISION
Export critical choices with #LCL_EXPORT_CRITICAL

Watch for:
- #QUESTION_SUPPRESSION: Ask user if unclear
- #SPECIFICATION_REFRAME: Verify solving right problem

Return: Brief plan with marked decisions
```

**Example**:
```python
# ❌ WRONG - Generic agent for specialized task
Task(subagent_type="general-purpose",
     prompt="You are a data architecture expert...")

# ✅ CORRECT - Use specialized agent
Task(subagent_type="data-architect",
     prompt="Design data model for skill tree system...")
```

### Optional Phase 1: Basic Synthesis

**Deploy synthesis agent when**:
- Multiple planners produced different approaches
- Need to validate path selection

**Synthesis agent task**:
```
Review planning outputs
Select optimal approach
Document with #PATH_RATIONALE
Export unified decisions with #LCL_EXPORT_CRITICAL

Return: Unified approach for implementation
```

### Phase 2: Implementation

**Deploy implementation agents** (usually 1-2 for MEDIUM complexity)

**Implementation guidance**:
```
Implement: [task with approach if planned]

Context (if any):
LCL: [exported decisions from planning]

Tags to use:
Core:
- #COMPLETION_DRIVE: Assuming unknowns
- #QUESTION_SUPPRESSION: Ask user if unclear
- #CARGO_CULT: Unrequested features
- #PATH_DECISION: Document choices

MEDIUM specific:
- #SPECIFICATION_REFRAME: Check solving right problem
- #DOMAIN_MIXING: Verify correct API/version
- #CONSTRAINT_OVERRIDE: Respecting constraints?
- #SUNK_COST_COMPLETION: Bad approach but deep in
- #CONTEXT_DEGRADED: Re-read rather than infer
- #FALSE_COMPLETION: All requirements met?
- #SUGGEST_*: Mark pattern-driven suggestions

Implementation focus:
- Follow planned approach if provided
- Mark assumptions for verification
- Watch for sunk cost patterns
- Check requirements before declaring done
```

**Track status**: Multiple agents in parallel if independent work

### Phase 3: Verification & Tag Resolution

**Deploy verification agent**:

**Verification task**:
```
Verify implementation

Tag resolution priority:
1. HIGH PRIORITY:
   - #QUESTION_SUPPRESSION: Should have asked user?
   - #SPECIFICATION_REFRAME: Solving right problem?
   - #CONSTRAINT_OVERRIDE: Fixed violation?
   - #FALSE_COMPLETION: All requirements met?

2. ASSUMPTION VERIFICATION:
   - #COMPLETION_DRIVE: Verify assumptions correct
   - #CONTEXT_DEGRADED: Re-read and confirm
   - #DOMAIN_MIXING: Correct API/version used?

3. PATTERN CLEANUP:
   - #CARGO_CULT: Remove if unnecessary
   - #SUNK_COST_COMPLETION: Evaluate restart need

4. META-SIGNALS:
   - #RESOLUTION_PRESSURE: Indicates needs fresh review

5. SUGGESTIONS:
   - #SUGGEST_*: Compile for user, remove from code

6. DOCUMENTATION:
   - #PATH_DECISION: Keep as permanent record

Remove all processing tags
Only PATH_DECISION remains
Code clean and verified
```

### Phase 4: Final Synthesis & Delivery

**Orchestrator**:
- Collects verification results
- Confirms all tags resolved
- Presents SUGGEST items to user
- Delivers clean code

## Escalation to HEAVY

**Escalate when**:
- Architectural complexity beyond basic synthesis
- Multi-path exploration needed across domains
- Cross-domain integration discovered
- Complexity score recalculates to 5-7

**How to escalate**:
```python
# #COMPLEXITY_EXCEEDED: Need multi-path architectural exploration
# Discovered: Cross-domain state management + API design decisions
# Recommend: HEAVY tier for proper planning + synthesis phases
```

## Tag Lifecycle (MEDIUM)

**During Planning** (if used):
- #PATH_DECISION: Document alternatives
- #LCL_EXPORT_CRITICAL: Mark key decisions
- #QUESTION_SUPPRESSION: Ask user if unclear

**During Implementation**:
- All 15 tags available
- Mark patterns as detected
- Export critical info with LCL

**During Verification**:
- High priority tags first (wrong direction errors)
- Verify all assumptions
- Remove pattern-driven code if unnecessary
- Compile suggestions

**Final Delivery**:
- All processing tags removed
- Only #PATH_DECISION remains (documentation)
- #SUGGEST items presented to user separately
- Clean, verified code

## Example Workflows

### Example 1: Multi-File Feature with Planning
```
Task: "Add user profile editing"
Assessment: MEDIUM (multi-file, moderate)

Phase 0 (Planning):
- Agent explores: Edit in-place vs modal, validation approach
- Marks #PATH_DECISION: Modal approach for consistency
- Exports #LCL_EXPORT_CRITICAL: validation::yup_schema

Phase 2 (Implementation):
- Receives LCL: validation::yup_schema
- Implements modal + validation
- Marks #COMPLETION_DRIVE: Assuming UserService.update() exists
- Marks #SUGGEST_ERROR_HANDLING: Network error handling?

Phase 3 (Verification):
- Verifies UserService.update() exists (assumption correct)
- Notes SUGGEST for user
- Removes tags

Result: Clean implementation with suggestion list
```

### Example 2: Escalation Discovery
```
Task: "Refactor API calls to use React Query"
Assessment: MEDIUM (refactoring, contained)

Implementation starts:
- Agent discovers: Affects data flow in 8 components
- State management implications
- Cache invalidation strategy needed

Agent marks:
- #COMPLEXITY_EXCEEDED: Multi-component state flow + cache strategy
- Architecture decisions beyond MEDIUM scope

Orchestrator escalates: MEDIUM → HEAVY
Reloads with HEAVY tier (full planning needed)
```

### Example 3: Constraint Violation Caught
```
Task: "Add image upload feature" with constraint "no new dependencies"
Assessment: MEDIUM

Implementation:
- Agent about to import 'multer' library
- Detects #CONSTRAINT_OVERRIDE: Need multer but "no dependencies" constraint
- STOPS and asks user: "Image upload typically needs multer library. Should I:
  1. Use it anyway
  2. Implement basic file handling manually
  3. Rethink the approach"

User clarifies approach
Implementation continues correctly
```

## Pattern Detection Guidance

**Detection reliability in MEDIUM**:
- ✅ QUESTION_SUPPRESSION: Very detectable
- ✅ CARGO_CULT: Detectable
- ✅ CONSTRAINT_OVERRIDE: Highly detectable (moment of violation)
- ✅ FALSE_COMPLETION: Detectable if you check requirements
- ⚠️ SPECIFICATION_REFRAME: Sometimes missed (gradual drift)
- ⚠️ DOMAIN_MIXING: Sometimes missed (feels natural)
- ⚠️ SUNK_COST_COMPLETION: Emotionally hard to catch
- ⚠️ CONTEXT_DEGRADED: Often missed mid-generation
- ⚠️ RESOLUTION_PRESSURE: Detectable if watching for it

**If uncertain**:
- Tag it anyway
- Verification will resolve
- Better to over-tag than under-tag

## Success Criteria

✅ **Scope correct** (no SPECIFICATION_REFRAME)
✅ **All requirements met** (no FALSE_COMPLETION)
✅ **Constraints respected** (no unresolved CONSTRAINT_OVERRIDE)
✅ **Assumptions verified** (COMPLETION_DRIVE checked)
✅ **Technical accuracy** (no DOMAIN_MIXING errors)
✅ **Clean code** (only PATH_DECISION tags remain)
✅ **Suggestions compiled** (SUGGEST items presented to user)
✅ **Context preserved** (LCL exports handled correctly)

## When MEDIUM is Perfect

- **Multi-file features**: "Add user authentication to app"
- **Moderate refactoring**: "Convert class components to hooks"
- **API integration**: "Connect frontend to new backend endpoint"
- **State management**: "Add Redux for cart functionality"
- **Data flow changes**: "Update how we handle form submissions"

These tasks need more than LIGHT (coordination, some planning) but less than HEAVY (not multi-domain, not architectural overhaul). MEDIUM provides the right balance.
