# Phase 1: Multi-Domain Planning

**Load this file**: After Phase 0 survey complete
**Purpose**: Multi-path exploration across all affected domains with integration contracts
**Clear after**: Planning complete, proceed to Phase 2

## Phase 1 Objectives

1. **Domain-Specific Planning**: Explore approaches for each domain independently
2. **Integration Contract Definition**: Explicit interfaces between domains
3. **Multi-Path Exploration**: Document 2-3 viable approaches per domain
4. **Dependency Mapping**: Identify sequential vs parallel work
5. **Risk Mitigation Planning**: Strategies for high-risk areas

## Context from Phase 0

This phase receives LCL exports from survey:
- Domain map with impact/risk levels
- Existing integration contracts
- Technical and business constraints
- High-risk areas flagged
- Existing patterns

## Planning Tags (Phase 1 Specific)

### #POISON_PATH
**Recognition signal**: "User said 'handler' and I'm defaulting to event patterns despite better options"
**Action**: Explicitly consider alternatives outside the terminology
**Example**: User says "add handler" → explore service layer, functional, or event-driven approaches

### #FIXED_FRAMING
**Recognition signal**: "User said 'state machine' and simpler conditional logic feels unconsidered"
**Action**: Force exploration of simpler approaches
**Example**: "State machine" request → also explore if simple if/else would suffice

### #ANTICIPATION_BIAS
**Recognition signal**: "Adding error handling to plan though they said 'quick prototype'"
**Action**: Mark as optional, don't build into core plan
**Example**: Prototype request → don't plan production-grade error handling

### #PARALLEL_DEGRADATION
**Recognition signal**: "Losing track of both architecture and data flow concepts"
**Action**: Deploy multiple specialized planning agents
**Example**: Complex state + API + UI planning → split into 3 agents

### #PLAN_UNCERTAINTY
**Recognition signal**: "Assuming database schema allows this, but should verify"
**Action**: Mark for validation before implementation
**Example**: "Plan uses user.settings field" → verify schema has this

### Failsafe Tags (Always Available)
- #COMPLETION_DRIVE, #QUESTION_SUPPRESSION, #CARGO_CULT, #PATH_DECISION, #Potential_Issue

## Planning Agent Deployment Strategy

### Agent Assignment

**One planning agent per domain** (for independent exploration)

**Example for "Add authentication" task**:
- Agent 1: Auth Service domain
- Agent 2: API Gateway domain
- Agent 3: Frontend domain
- Agent 4: Database domain

**Plus integration agent** (if complex cross-domain contracts):
- Agent 5: Integration contract planning

### Planning Agent Task Template

```
Plan implementation approach for: [task] in [Domain Name]

Context from Phase 0:
LCL: [relevant constraints]
LCL: [relevant integration contracts]
LCL: [relevant existing patterns]
LCL: [relevant risks]

Domain specifics:
- Impact level: [Core/Interface/Integration/Indirect]
- Risk level: [High/Medium/Low]
- Existing patterns: [description]
- Key files: [list]

Planning requirements:
1. Explore 2-3 viable implementation approaches
2. For each approach, document:
   - Technical design
   - Pros and cons
   - Integration contracts needed
   - Risk mitigation
   - Implementation complexity

3. Mark decisions:
   - #PATH_DECISION: Where multiple approaches viable
   - #POISON_PATH: If terminology constrains thinking
   - #FIXED_FRAMING: If problem framing limits exploration
   - #ANTICIPATION_BIAS: If planning beyond requirements
   - #PLAN_UNCERTAINTY: For assumptions needing validation

4. Export for Phase 2:
   - #LCL_EXPORT_CRITICAL: Integration contracts this domain exposes
   - #LCL_EXPORT_FIRM: Technical decisions impacting other domains
   - #LCL_EXPORT_CASUAL: Implementation preferences

Watch for:
- #QUESTION_SUPPRESSION: Ask user if unclear
- #PARALLEL_DEGRADATION: If losing track, split further
- #COMPLETION_DRIVE: Verify assumptions about domain

Return: Multi-path plan with integration contracts
```

## Multi-Path Exploration Protocol

For each domain, explore **2-3 viable approaches**:

### Path Exploration Template

```markdown
## Domain: [Name]

### Approach A: [Name]

**Design**:
[Technical description]

**Pros**:
- [benefit 1]
- [benefit 2]

**Cons**:
- [limitation 1]
- [limitation 2]

**Integration Contracts**:
- Exposes: [API/Event/Data contract this domain provides]
- Requires: [contracts needed from other domains]

**Risk Mitigation**:
- [strategy for identified risks]

**Complexity**: [Low/Medium/High]

**#PATH_DECISION: [Why this is viable]**

---

### Approach B: [Name]

[Same structure as Approach A]

**#POISON_PATH: [If applicable - terminology constraining solution space]**

---

### Approach C: [Name] (if applicable)

[Same structure]

**#FIXED_FRAMING: [If applicable - problem framing limiting alternatives]**

---

### Recommendation: [Approach X]

**Reasoning**: [Why this approach preferred for this domain]

**Dependencies**: [What must happen before/after this domain work]

**#PLAN_UNCERTAINTY**: [List any assumptions needing validation]
```

## Integration Contract Definition

**Critical for multi-domain work**: Explicit contracts prevent integration failures

### Contract Definition Format

```markdown
### Contract: [Domain A] → [Domain B]

**Type**: [API/Event/Data/Function]

**Interface**:
[Explicit signature/schema]

**Example**:
[Concrete example of contract usage]

**Validation**:
- [How to verify contract satisfied]

**Versioning**:
- [Strategy if contract needs to change]

**Owned by**: [Domain A]
**Consumed by**: [Domain B, Domain C]

**#LCL_EXPORT_CRITICAL: contract::[domain_a]_[domain_b]::[contract_summary]**
```

### Contract Examples

**API Contract**:
```typescript
### Contract: Auth Service → Frontend

Type: REST API

Interface:
POST /api/auth/login
Request: { email: string, password: string }
Response: { token: string, refreshToken: string, expiresIn: number }
Status: 200 (success), 401 (invalid), 429 (rate limit)

Validation:
- Token must be valid JWT
- ExpiresIn in seconds
- RefreshToken must be opaque string

Versioning: API v2, backward compatible with v1

#LCL_EXPORT_CRITICAL: contract::auth_frontend::POST_auth_login_returns_jwt
```

**Event Contract**:
```typescript
### Contract: Payment Service → Notification Service

Type: Event Bus

Interface:
Event: PaymentCompleted
Payload: {
  userId: string,
  amount: number,
  currency: string,
  transactionId: string,
  timestamp: ISO8601
}

Validation:
- All fields required
- Amount positive number
- Currency ISO 4217 code

Versioning: Event v1, add fields only (backward compatible)

#LCL_EXPORT_CRITICAL: contract::payment_notification::PaymentCompleted_event
```

**Data Contract**:
```sql
### Contract: User Service → Analytics Service

Type: Database View

Interface:
VIEW user_analytics AS
  SELECT user_id, email_domain, created_at, subscription_tier
  FROM users
  WHERE deleted_at IS NULL

Validation:
- user_id always present
- email_domain extracted from email
- subscription_tier from enum

Versioning: View v2, maintains v1 columns

#LCL_EXPORT_FIRM: contract::user_analytics::db_view_schema
```

## Dependency Mapping

Identify what work can happen in parallel vs must be sequential:

### Dependency Analysis

**Sequential Dependencies** (must happen in order):
```
1. Database schema changes
   ↓ (must complete before)
2. Backend API implementation
   ↓ (must complete before)
3. Frontend integration
```

**Parallel Work** (can happen simultaneously):
```
Frontend UI components ║ Backend business logic
(both can develop against ║ (both can work using
 agreed contract)         ║  agreed contract)
```

### Dependency Map Format

```markdown
## Implementation Dependencies

### Critical Path:
1. [Task/Domain that must go first]
2. [Task/Domain that depends on #1]
3. [Task/Domain that depends on #2]

### Parallel Workstreams:

**Stream A** (no dependencies):
- Domain X implementation
- Domain Y implementation

**Stream B** (depends on Stream A completion):
- Integration testing
- Domain Z implementation

**Stream C** (independent):
- Documentation
- Migration scripts
```

## Risk Mitigation Strategies

For each high-risk area (from Phase 0), plan mitigation:

### Risk Mitigation Template

```markdown
### Risk: [Description]
**Affected Domain**: [Domain name]
**Location**: [file/module]
**Severity**: [High/Medium/Low]

**Mitigation Strategy**:
1. [Specific action to reduce risk]
2. [Fallback if action fails]
3. [Validation method]

**#PATH_DECISION: [Chosen mitigation approach]**

**Example**:

### Risk: Deprecated authentication patterns
**Affected Domain**: Auth Service
**Location**: src/auth/passport-config.js
**Severity**: High

**Mitigation Strategy**:
1. Create new auth module alongside deprecated code
2. Feature flag to switch between old/new
3. Gradual migration with rollback capability
4. Remove deprecated code only after 100% migration

**#PATH_DECISION: Chose gradual migration over big-bang rewrite for safety**
```

## Planning Output Synthesis

Each planning agent produces:

```markdown
# Planning Report: [Domain Name]

## Explored Approaches
[Approach A, B, C with PATH_DECISION marks]

## Recommended Approach
[Selected approach with reasoning]

## Integration Contracts
[All contracts this domain exposes/requires]

## Dependencies
[What this domain needs from others]
[What other domains need from this one]

## Risk Mitigation
[Strategies for high-risk areas]

## Uncertainties
[#PLAN_UNCERTAINTY marks - need validation]

## LCL Exports for Phase 2
#LCL_EXPORT_CRITICAL: contract::[domain]::[summary]
#LCL_EXPORT_FIRM: technical_decision::[domain]::[summary]
#LCL_EXPORT_CASUAL: implementation_preference::[domain]::[summary]
```

## Phase 1 Verification

Before proceeding to Phase 2, confirm:

✅ **All domains planned** (one plan per domain)
✅ **Multi-path exploration complete** (2-3 approaches per domain)
✅ **Integration contracts defined** (explicit interfaces documented)
✅ **Dependencies mapped** (sequential vs parallel clear)
✅ **Risk mitigation planned** (strategies for high-risk areas)
✅ **Uncertainties flagged** (PLAN_UNCERTAINTY marked)
✅ **LCL exported** (Phase 2 has integration context)

## Common Planning Anti-Patterns

### Anti-Pattern 1: Single-Path Thinking
❌ **Wrong**: Only exploring one obvious approach
✅ **Right**: Force 2-3 alternatives even if one seems obvious
**Use #POISON_PATH or #FIXED_FRAMING to detect**

### Anti-Pattern 2: Vague Integration Contracts
❌ **Wrong**: "Frontend will call auth API"
✅ **Right**: "POST /api/auth/login {email, password} → {token, refreshToken, expiresIn}"
**Explicit signatures prevent integration failures**

### Anti-Pattern 3: Ignoring Existing Patterns
❌ **Wrong**: Planning new pattern ignoring codebase conventions
✅ **Right**: Align with existing patterns or explicitly plan pattern migration
**Use LCL from Phase 0 about existing patterns**

### Anti-Pattern 4: Planning Beyond Requirements
❌ **Wrong**: Adding elaborate error handling for prototype
✅ **Right**: Mark extras as optional or #SUGGEST
**Use #ANTICIPATION_BIAS to detect**

### Anti-Pattern 5: Assuming Unknowns
❌ **Wrong**: Assuming API supports feature without checking
✅ **Right**: Mark #PLAN_UNCERTAINTY and validate before Phase 3
**Use #COMPLETION_DRIVE to detect**

## Transition to Phase 2

**Ready for synthesis when**:
- All domain planning agents complete
- Integration contracts explicitly defined
- Dependencies mapped
- LCL exports collected

**Next step**:
- Clear phase1-planning.md from context
- Load phase2-synthesis.md
- Pass all LCL exports (especially integration contracts)
- Begin cross-domain synthesis

**Phase 2 will**:
- Validate contracts are compatible
- Select optimal approach combinations
- Create unified implementation blueprint
- Resolve any planning conflicts
