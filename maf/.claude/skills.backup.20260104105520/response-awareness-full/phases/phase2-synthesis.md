# Phase 2: Cross-Domain Synthesis

**Load this file**: After Phase 1 planning complete
**Purpose**: Validate integration contracts, select optimal path combinations, create unified blueprint
**Clear after**: Synthesis complete, proceed to Phase 3

## Phase 2 Objectives

1. **Contract Validation**: Ensure all integration contracts are compatible
2. **Path Selection**: Choose optimal approach for each domain
3. **Conflict Resolution**: Resolve any incompatible planning decisions
4. **Unified Blueprint**: Create single coherent implementation plan
5. **Integration Strategy**: Define progressive integration approach

## Context from Phase 1

This phase receives LCL exports from all planning agents:
- Recommended approaches per domain
- Integration contracts (exposed and required)
- Dependencies and sequencing
- Risk mitigation strategies
- Uncertainties flagged

## Synthesis Tags (Phase 2 Specific)

### #PATH_RATIONALE
**Recognition signal**: "Chose approach A over B because..."
**Action**: Document rationale thoroughly, keep in final code
**Example**: "Chose Redux over Context because multi-component state sync needed"
**NOTE**: This is PERMANENT documentation (unlike processing tags)

### #PHANTOM_PATTERN
**Recognition signal**: Strong familiarity signal without concrete recall
**Action**: Mark and verify rather than trusting the signal
**Example**: "Remember solving this Redux middleware issue" (but haven't actually)

### #FALSE_FLUENCY
**Recognition signal**: Smooth explanations that feel too easy
**Action**: Mark for extra verification even if confident
**Example**: Confidently explaining why approach works, but verification finds flaws

### #CONFIDENCE_DISSONANCE
**Recognition signal**: Confidence level doesn't match actual certainty
**Action**: Meta-signal for extra verification needed
**Example**: Explaining integration confidently but gut says verify

### Failsafe Tags (Always Available)
- #COMPLETION_DRIVE, #QUESTION_SUPPRESSION, #CARGO_CULT, #PATH_DECISION, #Potential_Issue

## Synthesis Agent Deployment

**Deploy single synthesis agent** for cross-domain perspective

Alternatively, **deploy 2 synthesis agents** if domains very complex:
- Agent 1: Technical synthesis (contract compatibility, architecture)
- Agent 2: Integration synthesis (sequencing, progressive rollout)

### Synthesis Agent Task Template

```
Synthesize unified implementation plan from multi-domain planning

Context from Phase 1:
[All LCL exports from planning agents]

Synthesis requirements:

1. VALIDATE INTEGRATION CONTRACTS:
   - Verify all required contracts are exposed
   - Check contract compatibility (types, formats match)
   - Identify any contract gaps or conflicts

2. SELECT OPTIMAL PATH COMBINATIONS:
   - For each domain, choose recommended approach
   - Verify selected approaches are compatible
   - Document selection rationale with #PATH_RATIONALE

3. RESOLVE CONFLICTS:
   - If domain approaches conflict, determine resolution
   - Update contracts if needed for compatibility
   - Mark any compromises made

4. CREATE UNIFIED BLUEPRINT:
   - Merge domain plans into single coherent plan
   - Define implementation sequence
   - Specify integration points

5. DEFINE INTEGRATION STRATEGY:
   - Progressive integration approach (what integrates when)
   - Validation checkpoints between integrations
   - Rollback strategy if integration fails

Use synthesis tags:
- #PATH_RATIONALE: Document all major decisions (PERMANENT)
- #PHANTOM_PATTERN: False familiarity signals
- #FALSE_FLUENCY: Over-confident reasoning
- #CONFIDENCE_DISSONANCE: Confidence vs certainty mismatch

Watch for:
- #QUESTION_SUPPRESSION: Ask user if conflicts unresolvable
- #COMPLETION_DRIVE: Verify contract assumptions
- #CARGO_CULT: Don't add integration complexity beyond requirements

Export for Phase 3:
- #LCL_EXPORT_CRITICAL: Final integration contracts
- #LCL_EXPORT_CRITICAL: Implementation sequence
- #LCL_EXPORT_FIRM: Technical decisions binding all domains

Return: Unified implementation blueprint with rationale
```

## Contract Validation Protocol

### Step 1: Map All Contracts

Create matrix of exposed vs required contracts:

```markdown
## Contract Matrix

| Contract | Exposed By | Required By | Status |
|----------|-----------|-------------|--------|
| POST /auth/login | Auth Service | Frontend, API Gateway | ✅ Compatible |
| UserCreatedEvent | User Service | Email, Analytics | ⚠️ Format mismatch |
| users table view | Database | User Service, Admin | ✅ Compatible |
```

### Step 2: Validate Compatibility

For each contract, check:

**Type Compatibility**:
- Do request/response types match?
- Are enums/constants aligned?
- Are required vs optional fields clear?

**Format Compatibility**:
- Do dates use same format (ISO8601, Unix timestamp, etc.)?
- Are IDs same type (UUID, integer, string)?
- Are units consistent (seconds vs milliseconds)?

**Semantic Compatibility**:
- Do both domains understand contract the same way?
- Are edge cases handled consistently?
- Are error conditions defined?

### Step 3: Resolve Incompatibilities

**If contracts incompatible**:

```markdown
### Incompatibility: [Description]

**Exposed by**: [Domain A]
**Format**: [what Domain A provides]

**Required by**: [Domain B]
**Expected**: [what Domain B needs]

**Conflict**: [how they differ]

**Resolution Options**:
1. [Option A - modify Domain A]
2. [Option B - modify Domain B]
3. [Option C - add adapter layer]

**#PATH_DECISION: [Chosen resolution]**
**#PATH_RATIONALE: [Why this resolution optimal]**

**Updated Contract**:
[Final agreed interface]

**#LCL_EXPORT_CRITICAL: contract::[domain_a]_[domain_b]::[updated_contract]**
```

## Path Selection Across Domains

### Selection Criteria

For each domain's planned approaches, select based on:

1. **Cross-domain compatibility**: Chosen approaches work together
2. **Integration simplicity**: Minimize integration complexity
3. **Risk minimization**: Prefer lower-risk approaches when equivalent
4. **Resource efficiency**: Avoid unnecessary complexity
5. **Requirement alignment**: Best matches actual requirements

### Selection Documentation

```markdown
## Path Selection

### Domain: [Name]

**Planned Approaches**:
- Approach A: [summary]
- Approach B: [summary]
- Approach C: [summary]

**Selected**: Approach [X]

**#PATH_RATIONALE: [Why this approach chosen]**

Reasoning:
- Cross-domain compatibility: [how it fits with other domain choices]
- Integration impact: [how it simplifies/complicates integration]
- Risk consideration: [how it addresses identified risks]
- Trade-offs: [what we're giving up by not choosing others]

**Rejected Approaches**:
- Approach [Y]: [why not chosen]
- Approach [Z]: [why not chosen]

**Dependencies created**:
- Requires from [other domain]: [what's needed]
- Provides to [other domain]: [what this enables]
```

### Cross-Domain Path Validation

After selecting approaches for all domains, validate combinations:

**Compatibility Check**:
- Do selected approaches have compatible integration contracts?
- Are there circular dependencies?
- Is implementation sequence feasible?

**Example validation**:
```markdown
## Cross-Domain Validation

**Domain A** (Auth Service): JWT-based approach
**Domain B** (Frontend): httpOnly cookie storage
**Domain C** (API Gateway): JWT validation middleware

**Compatibility**: ✅ All three work together
- Auth issues JWT tokens
- Frontend stores in httpOnly cookies
- Gateway validates JWT from cookie

**Integration sequence**:
1. Auth Service (exposes token generation)
2. API Gateway (validates tokens)
3. Frontend (consumes auth flow)

**#PATH_RATIONALE: This combination provides security (httpOnly) with stateless validation (JWT) and simple frontend integration**
```

## Conflict Resolution

### Types of Conflicts

**Technical Conflicts**:
- Domain A needs sync API, Domain B provides async
- Domain A uses SQL, Domain B uses NoSQL
- Domain A requires React 18, Domain B uses React 17

**Pattern Conflicts**:
- Domain A uses REST, Domain B uses GraphQL
- Domain A uses Redux, Domain B uses Context
- Domain A uses classes, Domain B uses functions

**Timing Conflicts**:
- Domain A must complete before Domain B starts
- But Domain B has tighter deadline
- Resource constraint (same developer needed)

### Resolution Protocol

```markdown
### Conflict: [Description]

**Domain A Position**: [what A needs/chose]
**Domain B Position**: [what B needs/chose]
**Incompatibility**: [why they conflict]

**Resolution Options**:

1. **Option 1**: [description]
   - Pros: [benefits]
   - Cons: [costs]
   - Impact: [which domains affected]

2. **Option 2**: [description]
   - Pros: [benefits]
   - Cons: [costs]
   - Impact: [which domains affected]

3. **Option 3**: [description]
   - Pros: [benefits]
   - Cons: [costs]
   - Impact: [which domains affected]

**#PATH_DECISION: Chose Option [X]**

**#PATH_RATIONALE: [Detailed reasoning for choice]**
- Why this option best balances competing needs
- Trade-offs accepted
- How this impacts implementation

**#CONFIDENCE_DISSONANCE: [If applicable - if uncertain despite choosing]**

**Action Items**:
- Domain A: [what needs to change]
- Domain B: [what needs to change]
- New contract: [updated integration]

**#LCL_EXPORT_CRITICAL: conflict_resolution::[domains]::[resolution]**
```

## Unified Blueprint Creation

### Blueprint Structure

```markdown
# Unified Implementation Blueprint

## Overview
[High-level description of complete implementation]

## Domain Implementations

### Domain 1: [Name]
**Selected Approach**: [approach name from planning]
**Rationale**: [PATH_RATIONALE from selection]
**Key Files**: [files to modify/create]
**Integration Points**: [contracts exposed/consumed]
**Dependencies**: [what must complete before this]

### Domain 2: [Name]
[Same structure]

## Integration Contracts (Final)

### Contract 1: [Domain A] → [Domain B]
[Final validated contract specification]

### Contract 2: [...]
[All contracts after conflict resolution]

## Implementation Sequence

### Phase 3A: Foundation
**Parallel Work**:
- Domain [X]: [work that has no dependencies]
- Domain [Y]: [work that has no dependencies]

**Sequential Work**:
1. Domain [Z]: [must go first because...]

### Phase 3B: Integration
**After Phase 3A completes**:
- Integrate Domain [X] with Domain [Y]
- Validation checkpoint: [how to verify integration]

### Phase 3C: Completion
**After Phase 3B validates**:
- Domain [W]: [final domain work]
- End-to-end integration test

## Progressive Integration Strategy

### Integration Checkpoint 1: [Name]
**After**: [which domains complete]
**Validate**: [what to check]
**Success Criteria**: [how to know it works]
**Rollback Plan**: [if validation fails]

### Integration Checkpoint 2: [Name]
[Same structure]

## Risk Mitigation (Updated)

[Risk mitigation strategies from Phase 1, updated based on synthesis decisions]

## Verification Strategy

[How Phase 4 will verify this implementation]
- Unit tests per domain
- Integration tests per contract
- End-to-end scenarios

## LCL Exports for Phase 3

#LCL_EXPORT_CRITICAL: blueprint::implementation_sequence::[sequence]
#LCL_EXPORT_CRITICAL: contract::final::[all_contracts]
#LCL_EXPORT_FIRM: decision::technical::[major_decisions]
#LCL_EXPORT_CASUAL: preference::implementation::[preferences]
```

## Integration Strategy Definition

**Progressive Integration**: Integrate incrementally with validation checkpoints

### Integration Levels

**Level 1: Stub Integration**
- Each domain implements against stub/mock of other domains
- Validates domain logic in isolation
- Fast feedback, no cross-domain dependencies

**Level 2: Contract Integration**
- Domains integrate via actual contracts
- Validates contract compatibility
- Catches integration issues early

**Level 3: End-to-End Integration**
- Complete system integration
- Validates full user flows
- Confirms everything works together

### Integration Sequence Example

```markdown
## Progressive Integration Strategy

### Step 1: Isolated Development (Parallel)
- Domain A develops against mock of Domain B
- Domain B develops against mock of Domain A
- Both validate their logic independently

**Checkpoint**: Unit tests pass for both domains

### Step 2: Contract Integration (Sequential)
1. Domain B deployed with contract implementation
2. Domain A integrates with real Domain B API
3. Integration tests validate contract

**Checkpoint**: Integration tests pass

### Step 3: Rollout (Progressive)
1. Feature flag enabled for 10% of traffic
2. Monitor metrics (errors, latency, etc.)
3. If stable, increase to 50%
4. If stable, increase to 100%

**Checkpoint**: Production metrics stable

**Rollback Plan**:
- Feature flag off if error rate > 1%
- Revert to previous domain versions
- Investigate integration issues
```

## Synthesis Anti-Patterns

### Anti-Pattern 1: Forcing Incompatible Choices
❌ **Wrong**: "Both approaches are fine" when they're incompatible
✅ **Right**: Identify conflict, resolve explicitly with PATH_RATIONALE
**Use #CONFIDENCE_DISSONANCE if uncertain**

### Anti-Pattern 2: Vague Integration Strategy
❌ **Wrong**: "Connect all the pieces"
✅ **Right**: Specific sequence with validation checkpoints
**Define progressive integration steps**

### Anti-Pattern 3: Ignoring Resource Constraints
❌ **Wrong**: Planning parallel work without checking if parallelizable
✅ **Right**: Consider team size, dependencies, shared resources
**Map realistic sequence**

### Anti-Pattern 4: Over-Confident Selection
❌ **Wrong**: Choosing path without thorough rationale
✅ **Right**: Document reasoning even if choice seems obvious
**Use #PATH_RATIONALE for all selections**

## Phase 2 Verification

Before proceeding to Phase 3, confirm:

✅ **All contracts validated** (compatible and complete)
✅ **Paths selected for all domains** (with rationale)
✅ **Conflicts resolved** (no incompatible choices remain)
✅ **Unified blueprint created** (single coherent plan)
✅ **Integration strategy defined** (progressive with checkpoints)
✅ **Implementation sequence clear** (parallel vs sequential work mapped)
✅ **PATH_RATIONALE documented** (for all major decisions)
✅ **LCL exported** (Phase 3 has complete blueprint)

## Transition to Phase 3

**Ready for implementation when**:
- Unified blueprint complete
- All domains have selected approaches
- Integration contracts finalized
- Implementation sequence defined
- LCL exports collected

**Next step**:
- Clear phase2-synthesis.md from context
- Load phase3-implementation.md
- Pass all LCL exports (blueprint, contracts, sequence)
- Begin coordinated implementation

**Phase 3 will**:
- Implement each domain per blueprint
- Follow defined sequence
- Validate at integration checkpoints
- Handle all patterns with full tag set
