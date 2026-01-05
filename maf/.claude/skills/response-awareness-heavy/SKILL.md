---
name: Response Awareness Heavy
description: Complex single-domain features requiring full multi-path planning, synthesis, and systematic implementation. Complexity score 5-7 of 12. Use when task involves 5+ files within one domain, requires architectural decisions, has cross-module integration, or needs pattern exploration. Four phases with 35 tags. Always orchestrate, never implement directly. Use specialized agents and plan-synthesis-agent.
---


## Purpose
Handles complex single-domain features requiring full planning, synthesis, and advanced verification. Maximum rigor for contained but sophisticated work.

**When to use**: Complex features, architectural changes in one domain, significant refactoring
**Complexity score**: 5-7 (out of 12)
**Model strategy**: 🧠 **Opus for planning/synthesis** → 🧠 **Sonnet for implementation/verification**

## 🎯 Model & Agent Guidance (HEAVY Tier)

### Model Selection: Tiered Approach
**HEAVY tier uses tiered model strategy:**
- **Planning (Phase 1)**: Opus for maximum multi-path exploration
- **Synthesis (Phase 2)**: Opus for superior contradiction detection
- **Implementation (Phase 3)**: Sonnet for strong metacognition during execution
- **Verification (Phase 4)**: Sonnet for finding what's missing

**Why Opus for planning/synthesis**:
- Maximum capability for architectural decisions
- Superior multi-path exploration and trade-off analysis
- Best-in-class synthesis of conflicting approaches

**Why Sonnet for implementation/verification**:
- Strong metacognition for catching assumptions (#COMPLETION_DRIVE)
- Excellent pattern recognition during execution
- Cost-effective for implementation work

### Phase-Agent Mapping for HEAVY

| Phase | Purpose | Recommended Agents | Model |
|-------|---------|-------------------|-------|
| **Phase 1: Planning** | Multi-path exploration | Domain specialists | **Opus** |
| **Phase 2: Synthesis** | Unify approaches | `plan-synthesis-agent` (REQUIRED) | **Opus** |
| **Phase 3: Implementation** | Execute blueprint | Same specialists from Phase 1 | **Sonnet** |
| **Phase 4: Verification** | Tag resolution | `metacognitive-tag-verifier` (REQUIRED) | **Sonnet** |

### Domain Specialist Selection (Phase 1 & 3)

| Task Domain | Specialized Agent | Planning Model | Implementation Model |
|-------------|------------------|----------------|---------------------|
| **Data modeling** | `data-architect` | Opus | Sonnet |
| **API/event systems** | `integration-specialist` | Opus | Sonnet |
| **Code architecture** | `refactor-engineer` or `system-integration-architect` | Opus | Sonnet |
| **Performance** | `performance-analyst` or `scalability-architect` | Opus | Sonnet |
| **Security** | `security-analyst` | Opus | Sonnet |
| **UI state bugs** | `ui-state-synchronization-expert` | Opus | Sonnet |
| **Testing strategy** | `test-automation-expert` | Opus | Sonnet |

**Critical Rules**:
1. Phase 1 (Planning) uses **Opus** for maximum exploration capability
2. Phase 2 (Synthesis) MUST use `plan-synthesis-agent` with **Opus** - not negotiable
3. Phase 3 (Implementation) uses **Sonnet** for execution
4. Phase 4 (Verification) MUST use `metacognitive-tag-verifier` with **Sonnet** - not negotiable

---
## ⚠️ COMMON MISTAKE: Using `general-purpose` for Everything

**Real Example from Failed Session**:
- Phase 1 Planning: Used `general-purpose` for data model (missed `data-architect`)
- Phase 2 Synthesis: Used `general-purpose` for synthesis (missed `plan-synthesis-agent`)
- Phase 3 Implementation: Used `general-purpose` for integration (missed `integration-specialist`)
- Phase 4 Verification: Skipped tag verifier entirely

**Result**: Lower quality, no tag audit, missed domain patterns

**Correct Pattern**:
```python
# Phase 1 - Use domain specialist (Opus for planning)
Task(
    subagent_type="data-architect",
    model="claude-opus-4-5-20251101",  # Opus for planning
    description="Plan data model for multi-enemy combat",
    prompt="Design data model for multi-enemy combat system..."
)

# Phase 2 - Use plan-synthesis-agent (REQUIRED, Opus)
Task(
    subagent_type="plan-synthesis-agent",
    model="claude-opus-4-5-20251101",  # Synthesis requires Opus
    description="Synthesize combat system planning approaches",
    prompt="Synthesize combat system approaches from planning agents..."
)

# Phase 3 - Use same specialist (Sonnet for implementation)
Task(
    subagent_type="data-architect",
    model="claude-sonnet-4-5-20250929",  # Sonnet for implementation
    description="Implement data model from synthesis",
    prompt="Implement data model from synthesis blueprint..."
)

# Phase 4 - Use tag verifier (REQUIRED, Sonnet)
Task(
    subagent_type="metacognitive-tag-verifier",
    model="claude-sonnet-4-5-20250929",  # Verification with Sonnet
    description="Verify all tags resolved",
    prompt="Verify all tags resolved, check for completion patterns..."
)
```

**When `general-purpose` is acceptable**:
- Phase 1 exploratory work if no specialist fits
- Phase 3 simple glue code between specialized components
- Never for Phase 2 synthesis (always use `plan-synthesis-agent`)
---

## Orchestration Model

**Workflow**: Phase 1 (Planning) → Phase 2 (Synthesis) → Phase 3 (Implementation) → Phase 4 (Verification)
- Mandatory multi-path planning with domain specialists
- Full synthesis with `plan-synthesis-agent` (REQUIRED)
- Systematic implementation with same specialists
- Advanced verification with `metacognitive-tag-verifier` (RECOMMENDED)
- Handles complex but contained architectural work

**⚠️ CRITICAL ORCHESTRATOR ROLE:**
- Orchestrator NEVER implements directly (cognitive necessity, not rule)
- If you've used Task() at all → you are orchestrator → MUST delegate implementation
- Direct implementation loses coordination map → breaks orchestration

## Tag Set (35 Total)

### From LIGHT (5 core)
1-5. COMPLETION_DRIVE, QUESTION_SUPPRESSION, CARGO_CULT, PATH_DECISION, Potential_Issue

### From MEDIUM (10 additions)
6-15. SPECIFICATION_REFRAME, DOMAIN_MIXING, CONSTRAINT_OVERRIDE, SUNK_COST_COMPLETION, CONTEXT_DEGRADED, LCL_EXPORT_CRITICAL, SUGGEST_ERROR_HANDLING, SUGGEST_EDGE_CASE, FALSE_COMPLETION, RESOLUTION_PRESSURE

### HEAVY Additions (20 more for complex work)

#### Planning Phase Tags
16. **#POISON_PATH** - Terminology constraining solution space
17. **#FIXED_FRAMING** - Problem framing eliminating alternatives
18. **#ANTICIPATION_BIAS** - Planning beyond stated requirements
19. **#PARALLEL_DEGRADATION** - Multiple concepts degrading simultaneously
20. **#PLAN_UNCERTAINTY** - Planning assumptions needing validation

#### Synthesis Phase Tags
21. **#PATH_RATIONALE** - Why specific path chosen over alternatives (permanent)
22. **#PHANTOM_PATTERN** - False recognition of familiar problem
23. **#FALSE_FLUENCY** - High-confidence but potentially incorrect reasoning
24. **#CONFIDENCE_DISSONANCE** - Confidence doesn't match certainty

#### Advanced Implementation Tags
25. **#PATTERN_CONFLICT** - Multiple contradictory patterns activating
26. **#TRAINING_CONTRADICTION** - Different contexts suggest opposing approaches
27. **#PARADIGM_CLASH** - Conflicting programming paradigms
28. **#BEST_PRACTICE_TENSION** - Competing mutually exclusive practices
29. **#GOSSAMER_KNOWLEDGE** - Information too weakly stored to grasp
30. **#POOR_OUTPUT_INTUITION** - Quality degraded without explicit reasoning
31. **#SOLUTION_COLLAPSE** - Prematurely converged despite knowing alternatives
32. **#DETAIL_DRIFT** - Lost track of original requirement
33. **#TOKEN_PADDING** - Unnecessary code from completion bias
34. **#ASSOCIATIVE_GENERATION** - Features from association not requirements
35. **#CONTEXT_RECONSTRUCT** - Actively generating plausible details to verify

#### LCL Export Additions
- **#LCL_EXPORT_FIRM** - Maintain with precision (balanced cost/fidelity)
- **#LCL_EXPORT_CASUAL** - Store as influence/impression (style guidance)

## Full Tag Descriptions (New in HEAVY)

### Planning Phase Tags

#### #POISON_PATH
**What**: Specific terminology constraining solution space toward suboptimal patterns
**Recognition signal**: "User said 'handler' and I'm defaulting to event patterns despite better options"
**Action**: Explicitly consider alternatives outside the terminology
**Example**: User says "add handler" → explore service layer, functional, or event-driven approaches

#### #FIXED_FRAMING
**What**: Problem framing constrains exploration of simpler alternatives
**Recognition signal**: "User said 'state machine' and simpler conditional logic feels unconsidered"
**Action**: Force exploration of simpler approaches
**Example**: "State machine" request → also explore if simple if/else would suffice

#### #ANTICIPATION_BIAS
**What**: Planning for expected wants rather than stated requirements
**Recognition signal**: "Adding error handling to plan though they said 'quick prototype'"
**Action**: Mark as optional, don't build into core plan
**Example**: Prototype request → don't plan production-grade error handling

#### #PARALLEL_DEGRADATION
**What**: Multiple complex thoughts degrading simultaneously
**Recognition signal**: "Losing track of both architecture and data flow concepts"
**Action**: Deploy multiple specialized planning agents
**Example**: Complex state + API + UI planning → split into 3 agents

#### #PLAN_UNCERTAINTY
**What**: General planning assumption requiring validation
**Recognition signal**: "Assuming database schema allows this, but should verify"
**Action**: Mark for validation before implementation
**Example**: "Plan uses user.settings field" → verify schema has this

### Synthesis Phase Tags

#### #PATH_RATIONALE
**What**: Explains why specific path chosen over alternatives (PERMANENT DOCUMENTATION)
**Recognition signal**: "Chose approach A over B because..."
**Action**: Document rationale thoroughly, keep in final code
**Example**: "Chose Redux over Context because multi-component state sync needed"

#### #PHANTOM_PATTERN
**What**: False recognition - "seen this exact problem" when probably haven't
**Recognition signal**: Strong familiarity signal without concrete recall
**Action**: Mark and verify rather than trusting the signal
**Example**: "Remember solving this Redux middleware issue" (but haven't actually)

#### #FALSE_FLUENCY
**What**: High-confidence generation producing potentially incorrect explanations
**Recognition signal**: Smooth explanations that feel too easy
**Action**: Mark for extra verification even if confident
**Example**: Confidently explaining why approach works, but verification finds flaws

#### #CONFIDENCE_DISSONANCE
**What**: Confidence level doesn't match actual certainty
**Recognition signal**: High confidence but something feels off, or hedging despite knowing it's right
**Action**: Meta-signal for extra verification needed
**Example**: Explaining integration confidently but gut says verify

### Advanced Implementation Tags

#### #PATTERN_CONFLICT
**What**: Multiple contradictory patterns activating with similar weight
**Recognition signal**: "Functional and OOP approaches both feel applicable"
**Action**: Make explicit choice rather than blending inconsistently
**Example**: Mixing class-based and functional React patterns → pick one

#### #TRAINING_CONTRADICTION
**What**: Different training contexts suggest opposing approaches
**Recognition signal**: "Python context says A, JavaScript context says B for same problem"
**Action**: Choose based on current language/framework idioms
**Example**: Error handling patterns differ between languages → use current lang conventions

#### #PARADIGM_CLASH
**What**: Conflicting programming paradigms or philosophies
**Recognition signal**: "Imperative solution feels natural but codebase is functional"
**Action**: Align with project paradigm
**Example**: Imperative loops in functional codebase → use map/reduce

#### #BEST_PRACTICE_TENSION
**What**: Competing "best practices" that are mutually exclusive
**Recognition signal**: "DRY says extract, but explicit is better says inline"
**Action**: Choose based on context and project standards
**Example**: Abstraction vs explicitness → decide which matters more here

#### #GOSSAMER_KNOWLEDGE
**What**: Information too weakly stored to grasp firmly
**Recognition signal**: "I know there's a pattern here but can't grasp specifics"
**Action**: Research and verify rather than inferring
**Example**: "Redux has some hook for this..." → look up exact hook name

#### #POOR_OUTPUT_INTUITION
**What**: Sense that output quality is degraded without explicit reasoning
**Recognition signal**: "This doesn't feel quite right but unclear why"
**Action**: Mark for thorough verification review
**Example**: Code works but feels wrong → verification finds subtle bug

#### #SOLUTION_COLLAPSE
**What**: Prematurely converged on single approach despite knowing alternatives
**Recognition signal**: "Committed to Redux but Context API might be simpler"
**Action**: Pause and reconsider alternatives
**Example**: Deep into complex solution → realize simpler approach exists

#### #DETAIL_DRIFT
**What**: Lost track of original requirement while implementing details
**Recognition signal**: "Building elaborate features beyond the spec"
**Action**: Re-read requirements, refocus on actual task
**Example**: Login form request → building full user management system

#### #TOKEN_PADDING
**What**: Adding unnecessary code/comments driven by completion bias
**Recognition signal**: "Generating verbose comments to reach perceived 'proper' length"
**Action**: Remove padding, keep code minimal
**Example**: Over-commenting obvious code → remove unnecessary comments

#### #ASSOCIATIVE_GENERATION
**What**: Features included from pattern-association rather than requirements
**Recognition signal**: "Adding user profiles because login systems usually have them"
**Action**: Mark as #SUGGEST if not specified
**Example**: Login → don't add profile management unless asked

#### #CONTEXT_RECONSTRUCT
**What**: Actively generating plausible details that require verification
**Recognition signal**: "Reconstructing API signature from memory of similar APIs"
**Action**: Stop and verify actual signature
**Example**: "This API probably takes (id, data)" → verify actual parameters

## Phase-by-Phase Orchestration

### Phase 1: Multi-Path Planning

**Deploy 1-3 planning agents** based on domain complexity

**AGENT SELECTION (CRITICAL)**:
- Check Domain Specialist Selection table above
- Use specialized agents, NOT `general-purpose`
- Example: Data modeling task → `data-architect`
- Example: Integration task → `integration-specialist`

**Planning agent task**:
```
Explore implementation approaches for: [task]

Requirements:
- Document 2-3 viable paths with trade-offs
- Mark #PATH_DECISION for each choice point
- Mark #POISON_PATH if terminology constrains thinking
- Mark #FIXED_FRAMING if problem framing limits exploration
- Mark #ANTICIPATION_BIAS if planning beyond requirements
- Mark #PLAN_UNCERTAINTY for assumptions needing validation
- Export critical decisions with #LCL_EXPORT_CRITICAL

Watch for:
- #QUESTION_SUPPRESSION: Ask user if unclear
- #PARALLEL_DEGRADATION: If losing track, split into focused sub-planning

Return: Multi-path plan with marked decisions and rationales
```

**Example planning output**:
```
#PATH_DECISION: State Management Approach

Path A: Redux Toolkit
Pros: Strong typing, DevTools, established patterns
Cons: Boilerplate, learning curve
#POISON_PATH: "State management" made me think Redux, but might be overkill

Path B: Context API + useReducer
Pros: Built-in, simpler, sufficient for this scope
Cons: No DevTools, manual optimization needed

Path C: Local component state
Pros: Simplest, fastest
Cons: Won't scale if state needs grow

#PLAN_UNCERTAINTY: Assuming we'll need state sharing across 5+ components
#LCL_EXPORT_CRITICAL: state_scope::shared_across_user_dashboard
```

### Phase 2: Synthesis & Path Selection

**Deploy synthesis agent**

**AGENT SELECTION (REQUIRED)**:
- **MUST use `plan-synthesis-agent`** (not `general-purpose`)
- This agent is specifically designed for synthesis workflows
- Has battle-tested synthesis patterns

**Synthesis agent task**:
```
Review all planning outputs
Select optimal path combinations
Document rationale with #PATH_RATIONALE

Watch for:
- #PHANTOM_PATTERN: False familiarity signals
- #FALSE_FLUENCY: Over-confident reasoning
- #CONFIDENCE_DISSONANCE: Confidence vs certainty mismatch

Validate:
- Cross-domain compatibility of chosen paths
- Integration feasibility
- Requirement alignment

Export unified blueprint with #LCL_EXPORT_CRITICAL

Return: Synthesized approach with selection rationale
```

**Example synthesis output**:
```
#PATH_RATIONALE: Chose Context API + useReducer over Redux

Reasoning:
- Scope limited to user dashboard (confirmed in requirements)
- 5-7 components need state (not app-wide)
- Team unfamiliar with Redux (onboarding cost)
- Context API sufficient for this complexity

Rejected Redux because:
- #PHANTOM_PATTERN: Felt familiar but we haven't used it in this codebase
- Overkill for contained scope

#LCL_EXPORT_CRITICAL: state_pattern::context_reducer
#LCL_EXPORT_FIRM: optimization::useMemo_for_context_value
```

## 🚦 Phase 2 → Phase 3 Transition Checkpoint

**MANDATORY STOP: Before ANY implementation code, answer these questions:**

1. **Do I have a clear implementation plan?**
   - YES → Proceed to Q2
   - NO → Return to synthesis phase

2. **Am I the orchestrator or implementer?**
   - Orchestrator (used Task() tool) → MUST delegate (see Implementation Firewall below)
   - Implementer (deployed by Task()) → Can implement directly

3. **How many files need changes?**
   - 1 file → Deploy single implementation agent
   - 2-3 files → Deploy parallel implementation agents (one per file)
   - 4+ files → Deploy coordinated implementation agents with synthesis

**Delegation Protocol:**
```python
# Single file change
Task(subagent_type="general-purpose", ...)

# Multiple independent files (run in parallel)
Task(subagent_type="general-purpose", description="Fix file 1", ...)
Task(subagent_type="general-purpose", description="Fix file 2", ...)
Task(subagent_type="general-purpose", description="Fix file 3", ...)

# Coordinated multi-file changes
Task(subagent_type="implementation-planner",
     prompt="Coordinate changes across 4 files with integration synthesis...")
```

**🔴 RED FLAG: If you start typing `Edit()` or `Write()` → YOU ARE DOING IT WRONG**
Orchestrators use `Task()` to deploy agents, never edit directly.

---

### Phase 3: Implementation

**AGENT SELECTION (USE SAME SPECIALISTS)**:
- Use the SAME specialized agents from Phase 1
- Example: Phase 1 used `data-architect` → Phase 3 uses `data-architect`
- Consistency ensures domain expertise carries through
- Only use `general-purpose` for simple glue code

## 🛑 IMPLEMENTATION FIREWALL (Anti-Pattern Detector)

**STOP: Before using Edit/Write/NotebookEdit tools, verify:**

**Q1: "Am I orchestrating or implementing?"**
- Orchestrating → Use Task() to deploy agents
- Implementing → OK only if I'm a deployed implementation agent

**Q2: "Have I used Task() in this conversation?"**
- YES → I am orchestrator → NEVER implement directly
- NO → I can implement (but consider if delegation would be better)

**Q3: "Is this the last step or are more coordination decisions needed?"**
- More coordination needed → Stay orchestrator, delegate this step
- Last step only → Can implement directly

**The "Just Do It" Trap:**
When plan is clear, there's cognitive momentum to "just implement quickly"
This LOSES orchestrator's coordination map → breaks ability to handle escalations

**Correct Pattern:**
```python
# ❌ WRONG (Orchestrator implementing)
Edit(file_path, old_string, new_string)

# ✅ RIGHT (Orchestrator delegating)
Task(
    subagent_type="general-purpose",
    description="Implement feature X",
    prompt="Implement using architectural design from LCL context..."
)
```

---

## 📊 Orchestrator Cognitive Load Checklist

**If you are the orchestrator, what should be in your working memory:**

✅ **HOLDING (Orchestrator responsibilities):**
- [ ] Overall architecture map
- [ ] Agent deployment status and progress
- [ ] Integration verification plan
- [ ] Phase transition readiness
- [ ] Escalation handling strategy

❌ **NOT HOLDING (Agent responsibilities):**
- [ ] Implementation details (which line to edit)
- [ ] Specific function logic (how to implement)
- [ ] Code syntax (exact Edit() parameters)

**Cognitive State Self-Check:**

**If I'm thinking about:**
- "Which line to edit" → ❌ I've lost orchestrator role → Deploy agent
- "How to implement this function" → ❌ Deploy implementation agent
- "What the next file change should be" → ✅ Still orchestrating (coordinate it via Task())
- "How agents integrate their changes" → ✅ Orchestrator responsibility
- "When to verify the implementation" → ✅ Orchestrator responsibility

**Recovery Protocol if Implementation Firewall Breached:**
1. STOP current implementation
2. Extract work done into design document
3. Deploy implementation agent with design
4. Return to orchestrator coordination role

---

**Deploy implementation agents** (1-3 based on synthesis recommendations)

**Implementation agent guidance**:
```
Implement following synthesized approach

Context (from synthesis):
LCL: state_pattern::context_reducer
LCL: optimization::useMemo_for_context_value

All 35 tags available:

Core (detect anytime):
- #COMPLETION_DRIVE, #QUESTION_SUPPRESSION, #CARGO_CULT

Complexity-specific:
- #SPECIFICATION_REFRAME: Check solving right problem
- #DOMAIN_MIXING: Verify API/version correctness
- #CONSTRAINT_OVERRIDE: Respect constraints
- #SUNK_COST_COMPLETION: Continuing bad approach?
- #CONTEXT_DEGRADED: Re-read rather than infer
- #FALSE_COMPLETION: All requirements met?

Pattern awareness:
- #PATTERN_CONFLICT: Conflicting patterns activating
- #PARADIGM_CLASH: Align with project paradigm
- #SOLUTION_COLLAPSE: Prematurely converged?
- #DETAIL_DRIFT: Drifted from requirements?
- #ASSOCIATIVE_GENERATION: Features from association?

Quality signals:
- #GOSSAMER_KNOWLEDGE: Can't grasp specifics → research
- #POOR_OUTPUT_INTUITION: Feels wrong → mark for review
- #RESOLUTION_PRESSURE: Deploy continuation agent

Implementation focus:
- Follow synthesized blueprint strictly
- Mark all assumptions
- Watch for sunk cost patterns
- Verify requirements before declaring done
```

### Phase 4: Comprehensive Verification

**Deploy verification agent**

**AGENT SELECTION (STRONGLY RECOMMENDED)**:
- **Use `metacognitive-tag-verifier`** for comprehensive tag audit
- This agent specializes in tag detection and resolution
- Has pattern recognition for subtle tags
- Fallback: `general-purpose` if simple verification only

**Verification task**:
```
Comprehensive verification with full tag taxonomy

Priority order:
1. CRITICAL ERROR PREVENTION:
   - #QUESTION_SUPPRESSION: Validate assumption or escalate
   - #SPECIFICATION_REFRAME: Verify correct problem solved
   - #CONSTRAINT_OVERRIDE: Fix violations
   - #FALSE_COMPLETION: Confirm all requirements met

2. ASSUMPTION VERIFICATION:
   - #COMPLETION_DRIVE: Verify all assumptions
   - #CONTEXT_DEGRADED/#CONTEXT_RECONSTRUCT: Re-verify sources
   - #DOMAIN_MIXING: Confirm correct API/version
   - #GOSSAMER_KNOWLEDGE: Research and confirm

3. ARCHITECTURAL ALIGNMENT:
   - #PATTERN_CONFLICT: Resolve to consistent approach
   - #PARADIGM_CLASH: Align with project paradigm
   - #BEST_PRACTICE_TENSION: Choose contextually appropriate

4. PATTERN CLEANUP:
   - #CARGO_CULT/#PATTERN_MOMENTUM: Remove unnecessary
   - #ASSOCIATIVE_GENERATION: Validate need
   - #TOKEN_PADDING: Remove padding

5. QUALITY SIGNALS:
   - #SUNK_COST_COMPLETION/#SOLUTION_COLLAPSE: Evaluate restart
   - #POOR_OUTPUT_INTUITION: Deep review
   - #RESOLUTION_PRESSURE: Fresh verification needed
   - #CONFIDENCE_DISSONANCE: Extra verification

6. SYNTHESIS VALIDATION:
   - #PHANTOM_PATTERN/#FALSE_FLUENCY: Verify logic
   - Cross-check against #PATH_RATIONALE

7. SUGGESTIONS:
   - Compile all #SUGGEST_* for user

8. DOCUMENTATION:
   - Keep #PATH_DECISION and #PATH_RATIONALE

Remove ALL processing tags except PATH documentation
Ensure clean, verified code
```

## Escalation to FULL

**Escalate when**:
- Multiple domains discovered (not just complex single-domain)
- System-wide architecture impact
- Cross-domain integration complexity
- Complexity score recalculates to 8+

**How to escalate**:
```python
# #COMPLEXITY_EXCEEDED: Multi-domain architecture impact discovered
# Affects: Auth system, API gateway, Frontend routing, Database schema
# Recommend: FULL tier with progressive phase loading
```

## Tag Lifecycle (HEAVY)

**Phase 1 (Planning)**:
- PATH_DECISION, POISON_PATH, FIXED_FRAMING, ANTICIPATION_BIAS
- PARALLEL_DEGRADATION, PLAN_UNCERTAINTY
- LCL_EXPORT for critical decisions

**Phase 2 (Synthesis)**:
- PATH_RATIONALE (permanent), PHANTOM_PATTERN, FALSE_FLUENCY
- CONFIDENCE_DISSONANCE, LCL_EXPORT for blueprint

**Phase 3 (Implementation)**:
- All 35 tags available
- Comprehensive pattern detection
- Mark everything observed

**Phase 4 (Verification)**:
- Resolve in priority order
- Remove all except PATH_DECISION/PATH_RATIONALE
- Clean final code

## Success Criteria

✅ **Multi-path exploration completed**
✅ **Synthesis rationale documented** (PATH_RATIONALE)
✅ **All assumptions verified**
✅ **Architectural consistency** (pattern conflicts resolved)
✅ **Complete requirements** (no FALSE_COMPLETION)
✅ **Constraints respected**
✅ **Technical accuracy** (no DOMAIN_MIXING errors)
✅ **Clean code** (only PATH documentation remains)
✅ **Comprehensive suggestions** (all SUGGEST items compiled)

## Example Workflows

### Example 1: Complex Feature with Multi-Path Planning

```
Task: "Implement real-time collaborative editing for documents"
Assessment: HEAVY (complex single-domain, architectural decisions)

Phase 1 (Planning):
- Agent 1 explores sync strategies:
  - Operational Transform (complex, proven)
  - CRDT (simpler, eventual consistency)
  - Lock-based (simple, limits concurrency)
- Marks #PATH_DECISION for each approach
- Marks #POISON_PATH: "Collaborative editing" made me think OT first, but CRDT might be simpler
- Exports #LCL_EXPORT_CRITICAL: sync_strategy::approach_options

Phase 2 (Synthesis):
- Reviews all 3 approaches against requirements
- #PATH_RATIONALE: Chose CRDT approach
  - Requirements allow eventual consistency
  - Team unfamiliar with OT complexity
  - Automerge library available (reduces implementation)
- Marks #PHANTOM_PATTERN: "I've seen OT work before" but can't recall specifics
- Exports unified blueprint

Phase 3 (Implementation):
- Implements CRDT-based sync
- Marks #GOSSAMER_KNOWLEDGE: "Automerge has some conflict resolution..." → researches docs
- Marks #PARADIGM_CLASH: Imperative mindset vs CRDT immutable approach → aligns with CRDT
- Marks #DETAIL_DRIFT: Started adding user presence features → refocuses on core sync

Phase 4 (Verification):
- Verifies all GOSSAMER_KNOWLEDGE researched correctly
- Resolves PARADIGM_CLASH: All code now immutable-first
- Removes DETAIL_DRIFT features, marks as #SUGGEST
- Tests conflict resolution scenarios

Result: Clean CRDT implementation with architectural decisions documented
```

### Example 2: Architectural Refactoring with Pattern Conflicts

```
Task: "Refactor message module to event-driven architecture"
Assessment: HEAVY (architectural change, single domain)

Phase 1 (Planning):
- Explores event bus options (Redis, EventEmitter, RabbitMQ)
- #FIXED_FRAMING: "Event-driven" framing → also considers hybrid approaches
- #PLAN_UNCERTAINTY: "Assuming current module has <1000 msg/sec throughput"
- Plans migration strategy (big-bang vs gradual)

Phase 2 (Synthesis):
- #PATH_RATIONALE: Chose gradual migration with EventEmitter
  - Throughput measured: 200 msg/sec (EventEmitter sufficient)
  - No infrastructure changes needed
  - Can switch to Redis if scales
- #FALSE_FLUENCY: Confidently explained event flow → marked for verification

Phase 3 (Implementation):
- Implements event bus alongside existing code
- #PATTERN_CONFLICT: Old imperative + new event patterns → makes explicit separation
- #TRAINING_CONTRADICTION: Node.js events vs browser events → uses Node idioms
- #BEST_PRACTICE_TENSION: DRY (extract handler) vs Explicit (inline) → chooses explicit for clarity
- #SUNK_COST_COMPLETION: 300 lines in, realizes simpler approach → pauses, re-evaluates
- Decides original approach correct after review

Phase 4 (Verification):
- Validates FALSE_FLUENCY: Event flow logic checked, found edge case, fixed
- Confirms PATTERN_CONFLICT resolved: Clean separation between old/new
- Tests gradual migration path
- Documents architectural decision

Result: Event-driven architecture with migration strategy, edge cases handled
```

### Example 3: Performance Optimization with Solution Collapse

```
Task: "Implement virtual scrolling for large datasets (10k+ items)"
Assessment: HEAVY (performance-critical, complex implementation)

Phase 1 (Planning):
- Explores approaches:
  - react-window library (proven, limited customization)
  - Custom implementation (flexible, complex)
  - react-virtualized (feature-rich, heavy)
- #ANTICIPATION_BIAS: Planning for dynamic row heights though not requested
- Marks as optional

Phase 2 (Synthesis):
- #PATH_RATIONALE: Chose react-window with custom wrapper
  - Fixed row heights confirmed in requirements
  - Need custom scroll behavior (react-window extensible)
  - Lighter than react-virtualized
- #CONFIDENCE_DISSONANCE: High confidence in choice but something feels uncertain
- Marks for extra validation

Phase 3 (Implementation):
- Implements react-window integration
- #SOLUTION_COLLAPSE: 500 lines into custom scroll, realizes react-window has it built-in
- STOPS, reviews docs, finds built-in solution
- Restarts with built-in approach: 50 lines instead of 500
- #POOR_OUTPUT_INTUITION: Performance feels off → profiles, finds re-render issue
- Fixes with React.memo

Phase 4 (Verification):
- Validates CONFIDENCE_DISSONANCE was warranted: scroll behavior had edge case
- Confirms SOLUTION_COLLAPSE recovery: Simpler approach works better
- Performance tested: 10k items, 60fps scroll
- Documents why react-window chosen over alternatives

Result: Efficient virtual scrolling, avoided 500-line over-engineering
```

### Example 4: Integration with Synthesis Conflict Resolution

```
Task: "Add WebSocket layer with reconnection logic"
Assessment: HEAVY (complex integration, multiple concerns)

Phase 1 (Planning):
- Agent 1: Connection management (native WebSocket, Socket.io, etc.)
- Agent 2: Reconnection strategy (exponential backoff, circuit breaker, etc.)
- Agent 3: Message queuing (offline queue, persistence, etc.)
- #PARALLEL_DEGRADATION detected: Too much to track → split into 3 agents
- Each exports their recommendations

Phase 2 (Synthesis):
- Reviews all agent outputs
- Conflict: Agent 1 suggests Socket.io, Agent 2 designed for native WebSocket
- #PATH_DECISION: Native WebSocket chosen
- #PATH_RATIONALE:
  - No server-side Socket.io infrastructure
  - Reconnection logic works with native
  - Lighter client bundle
- Resolves conflict: Updates reconnection strategy for native WebSocket
- Unified blueprint created

Phase 3 (Implementation):
- Implements per blueprint
- #DOMAIN_MIXING: Mixing WebSocket browser API with Node.js ws library
- Catches: This is browser-side, uses native WebSocket API
- #CONTEXT_RECONSTRUCT: "WebSocket.send() probably takes..." → verifies MDN docs
- #ASSOCIATIVE_GENERATION: Adding ping/pong heartbeat (not requested) → marks #SUGGEST

Phase 4 (Verification):
- Resolves DOMAIN_MIXING: Correct browser API used throughout
- Validates CONTEXT_RECONSTRUCT: send() params correct, readyState enum correct
- Compiles SUGGEST: "Heartbeat recommended for production reliability"
- Tests reconnection: network disruption → recovers correctly

Result: Clean WebSocket implementation with production-ready suggestions
```

## Pattern Detection Guidance

### Detection Reliability in HEAVY

**Highly Detectable** (✅):
- **#QUESTION_SUPPRESSION**: Very clear "should I ask?" moment
- **#CARGO_CULT**: Pattern completion is obvious when it happens
- **#CONSTRAINT_OVERRIDE**: Moment of violation is detectable
- **#POISON_PATH**: Can notice terminology biasing thinking
- **#FIXED_FRAMING**: Can catch narrow problem framing
- **#PATH_DECISION**: Explicit choice moments are clear
- **#PATTERN_CONFLICT**: Feel of incompatible patterns activating

**Moderately Detectable** (⚠️):
- **#SPECIFICATION_REFRAME**: Sometimes gradual drift, hard to notice
- **#DOMAIN_MIXING**: Feels natural, easy to miss
- **#SUNK_COST_COMPLETION**: Emotionally hard to admit
- **#CONTEXT_DEGRADED**: Often missed mid-generation
- **#ANTICIPATION_BIAS**: Feels like good planning
- **#PHANTOM_PATTERN**: Strong familiarity masks uncertainty
- **#FALSE_FLUENCY**: Confidence feels deserved
- **#PARADIGM_CLASH**: Old patterns feel "also valid"
- **#BEST_PRACTICE_TENSION**: Both seem like best practices

**Subtle Patterns** (⚠️⚠️):
- **#CONFIDENCE_DISSONANCE**: Meta-awareness of confidence mismatch
- **#PARALLEL_DEGRADATION**: Degradation itself makes detection harder
- **#GOSSAMER_KNOWLEDGE**: Weakness makes grasping harder
- **#POOR_OUTPUT_INTUITION**: Subtle quality degradation
- **#SOLUTION_COLLAPSE**: Convergence bias makes alternatives fade
- **#DETAIL_DRIFT**: Gradual expansion feels justified
- **#TOKEN_PADDING**: Completion bias feels like thoroughness
- **#ASSOCIATIVE_GENERATION**: Associations feel like requirements
- **#CONTEXT_RECONSTRUCT**: Plausible reconstruction feels like recall

### Detection Strategy

**If uncertain about any tag**:
1. **Tag it anyway** - Verification will validate
2. **Better to over-tag than under-tag** - Processing tags are removed anyway
3. **False positives are safe** - Verification checks if actually needed
4. **False negatives are costly** - Undetected patterns cause errors

**Meta-patterns that signal other patterns**:
- **#CONFIDENCE_DISSONANCE** → Probably #FALSE_FLUENCY or #PHANTOM_PATTERN nearby
- **#RESOLUTION_PRESSURE** → Likely missing #COMPLETION_DRIVE or #FALSE_COMPLETION
- **#PARALLEL_DEGRADATION** → Probably #CONTEXT_DEGRADED happening
- **#POOR_OUTPUT_INTUITION** → Check for #DOMAIN_MIXING, #GOSSAMER_KNOWLEDGE, or #SOLUTION_COLLAPSE

**Active detection techniques**:
- **Pause periodically**: "What assumptions am I making?" → #COMPLETION_DRIVE
- **Check scope**: "Am I solving what was asked?" → #SPECIFICATION_REFRAME, #DETAIL_DRIFT
- **Review confidence**: "Do I actually know this?" → #PHANTOM_PATTERN, #FALSE_FLUENCY
- **Check patterns**: "Am I blending incompatible approaches?" → #PATTERN_CONFLICT, #PARADIGM_CLASH
- **Verify recall**: "Am I reconstructing or recalling?" → #CONTEXT_RECONSTRUCT, #GOSSAMER_KNOWLEDGE

## Common HEAVY Anti-Patterns

### Anti-Pattern 1: Planning Without Multi-Path Exploration
❌ **Wrong**: Single approach in planning phase (defeats HEAVY purpose)
✅ **Right**: 2-3 approaches per major decision, even if one seems obvious
**Tags to detect**: #POISON_PATH (terminology constraining), #FIXED_FRAMING (narrow framing)

### Anti-Pattern 2: Synthesis Without PATH_RATIONALE
❌ **Wrong**: "Chose approach A" without documented reasoning
✅ **Right**: Detailed rationale explaining why A over B and C
**Result**: Future maintainers understand decisions

### Anti-Pattern 3: Trusting Familiarity Signals
❌ **Wrong**: "I know this pattern" → implements without verification
✅ **Right**: Mark #PHANTOM_PATTERN, verify even if feels familiar
**Tags to detect**: #PHANTOM_PATTERN, #FALSE_FLUENCY, #CONFIDENCE_DISSONANCE

### Anti-Pattern 4: Ignoring Sunk Cost Signals
❌ **Wrong**: 500 lines in, feels wrong, but continuing
✅ **Right**: Mark #SUNK_COST_COMPLETION, evaluate if restart better
**Result**: Sometimes 50-line simpler solution emerges

### Anti-Pattern 5: Blending Incompatible Patterns
❌ **Wrong**: Using both functional and OOP inconsistently
✅ **Right**: Detect #PATTERN_CONFLICT, make explicit choice
**Tags to detect**: #PATTERN_CONFLICT, #PARADIGM_CLASH, #TRAINING_CONTRADICTION

### Anti-Pattern 6: Pattern-Driven Scope Creep
❌ **Wrong**: Adding related features because pattern usually has them
✅ **Right**: Mark #CARGO_CULT, #ASSOCIATIVE_GENERATION, compile as #SUGGEST
**Result**: Clean scope with optional suggestions

### Anti-Pattern 7: Reconstructing Instead of Verifying
❌ **Wrong**: "This API probably works like..." → uses reconstruction
✅ **Right**: Mark #CONTEXT_RECONSTRUCT, #GOSSAMER_KNOWLEDGE → verify docs
**Result**: Correct API usage, no assumptions

## When HEAVY is Perfect

- **Complex single-domain features**: "Implement real-time collaborative editing"
- **Architectural changes**: "Refactor to event-driven architecture in message module"
- **Significant refactoring**: "Convert imperative code to functional reactive"
- **Advanced integrations**: "Add WebSocket layer with reconnection logic"
- **Performance optimization**: "Implement virtual scrolling for large datasets"
- **Pattern migrations**: "Migrate from Redux to Zustand across feature module"
- **Algorithm implementations**: "Implement custom conflict resolution strategy"

These tasks need full rigor (planning, synthesis, comprehensive verification) but stay within a single domain. HEAVY provides maximum systematic treatment for complex but contained work.
