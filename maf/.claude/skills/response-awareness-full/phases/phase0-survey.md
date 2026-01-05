# Phase 0: Survey & Domain Assessment

**Load this file**: When entering FULL tier orchestration
**Purpose**: Multi-domain codebase assessment and complexity validation
**Clear after**: Survey complete, proceed to Phase 1

## Phase 0 Objectives

1. **Domain Identification**: Map all affected systems/modules
2. **Stakeholder Analysis**: Identify integration points and dependencies
3. **Complexity Validation**: Confirm FULL tier appropriate (or de-escalate)
4. **Constraint Discovery**: Find technical and business constraints
5. **Risk Assessment**: Identify high-risk integration points

## Survey Agent Deployment

**Deploy 1-3 survey agents** based on initial complexity signals

### Survey Agent Task Template

```
Survey codebase for: [task description]

Objectives:
1. Identify all affected domains (systems, modules, services)
2. Map integration points and dependencies
3. Assess technical constraints (frameworks, versions, patterns)
4. Identify existing patterns relevant to task
5. Flag high-risk areas (deprecated code, tight coupling, etc.)

Use failsafe tags:
- #QUESTION_SUPPRESSION: Ask user if ambiguous
- #COMPLETION_DRIVE: Mark assumptions about structure
- #PATH_DECISION: If survey approach choices exist
- #Potential_Issue: Note unrelated problems found

Export findings:
- #LCL_EXPORT_CRITICAL: Critical constraints and integration contracts
- #LCL_EXPORT_FIRM: Domain boundaries and existing patterns

Return: Domain map with integration analysis
```

## Domain Mapping Protocol

### What Constitutes a Domain?

**Domain**: Self-contained system with clear boundaries and responsibilities

**Examples**:
- **Authentication Service** (domain) - User login, token management, session handling
- **API Gateway** (domain) - Request routing, rate limiting, API versioning
- **Frontend Application** (domain) - UI components, client state, user interactions
- **Database Layer** (domain) - Schema, migrations, query optimization
- **Payment Processing** (domain) - Transaction handling, third-party integrations

**Not separate domains** (same domain):
- Multiple components within same React app
- Helper functions in same service
- Related database tables in same schema

### Domain Assessment Checklist

For each identified domain, assess:

**Impact Level**:
- ✅ Core changes (domain logic modified)
- ✅ Interface changes (API/contract modified)
- ⚠️ Integration only (calls modified domain)
- ℹ️ Indirect (uses data from modified domain)

**Risk Level**:
- 🔴 High: Deprecated code, tight coupling, no tests
- 🟡 Medium: Some technical debt, partial coverage
- 🟢 Low: Well-structured, tested, documented

**Complexity**:
- How many files/modules in this domain?
- How many integration points?
- Existing pattern clarity (clear vs messy)

## Integration Contract Discovery

**Integration Contract**: Explicit interface between domains

### Types of Contracts

**API Contracts**:
```
Domain A → Domain B via REST API
Contract: POST /users {email, password} → {userId, token}
```

**Event Contracts**:
```
Domain A emits → Domain B consumes
Contract: UserCreatedEvent {userId, email, timestamp}
```

**Data Contracts**:
```
Domain A writes → Domain B reads
Contract: users table schema {id, email, password_hash, created_at}
```

**Function Contracts** (within codebase):
```
Domain A exports → Domain B imports
Contract: authenticateUser(email, password) → Promise<User>
```

### Contract Assessment

For each integration:
- **Current state**: What's the existing contract?
- **Required changes**: Will contract change?
- **Backward compatibility**: Can change break existing integrations?
- **Versioning strategy**: How to handle breaking changes?

Mark with **#LCL_EXPORT_CRITICAL** if contract critical to implementation.

## Complexity Re-validation

After survey, re-score complexity:

**Re-calculate** (0-3 each):
- **File Scope**: Based on actual domain count discovered
- **Requirement Clarity**: After codebase exploration
- **Integration Risk**: With concrete integration points known
- **Change Type**: With existing patterns understood

**New Total Score**:
- **8+**: Confirmed FULL tier appropriate
- **5-7**: Consider de-escalate to HEAVY
- **2-4**: Recommend de-escalate to MEDIUM
- **0-1**: Recommend de-escalate to LIGHT

### De-escalation Signal

If complexity overestimated:
```
#COMPLEXITY_OVERESTIMATED: [reason]

Original assessment: [initial score/reasoning]
Actual discovery: [what survey found]
New score: [recalculated score]

Recommend: De-escalate to [tier]
Reasoning: [why lower tier sufficient]
```

Orchestrator will ask user if de-escalation appropriate.

## Constraint Discovery

### Technical Constraints

**Framework/Version Constraints**:
- React 18 vs 17 (different concurrent features)
- Node 16 vs 14 (different APIs available)
- Database version (supported features)

Mark: `#LCL_EXPORT_FIRM: constraint::framework::react_18_concurrent_mode`

**Architectural Constraints**:
- Must use existing auth library
- Cannot add new database tables
- Must maintain REST API compatibility

Mark: `#LCL_EXPORT_CRITICAL: constraint::architecture::no_new_db_tables`

**Performance Constraints**:
- API response time < 200ms
- Bundle size < 500KB
- Database query limit

Mark: `#LCL_EXPORT_FIRM: constraint::performance::api_response_200ms`

### Business/Process Constraints

**Deployment Constraints**:
- Zero-downtime requirement
- Staged rollout needed
- Feature flag required

**Testing Constraints**:
- 80% coverage required
- Integration tests mandatory
- Cannot break existing tests

**Compatibility Constraints**:
- Support IE11 (sadly)
- Mobile app using API v2
- Legacy systems depend on current behavior

## Risk Identification

### High-Risk Areas

**Deprecated Code**:
```
#Potential_Issue: Authentication uses deprecated passport.js patterns
Location: src/auth/passport-config.js
Risk: Might conflict with modern async/await patterns
Recommendation: [flag for planning phase]
```

**Tight Coupling**:
```
#Potential_Issue: Payment processing tightly coupled to user service
Location: src/services/payment.js:45-120
Risk: Changes to user schema might break payments
Recommendation: [consider decoupling in implementation]
```

**Missing Tests**:
```
#Potential_Issue: API gateway has 0% test coverage
Location: src/gateway/
Risk: Cannot verify changes won't break routing
Recommendation: [add tests before modifying]
```

**Technical Debt**:
```
#Potential_Issue: Frontend uses 3 different state management libraries
Locations: Redux (components/), MobX (admin/), Context (settings/)
Risk: Consistency issues if adding state management
Recommendation: [plan for pattern alignment]
```

## Survey Output Format

```markdown
# Domain Survey: [Task Name]

## Affected Domains

### Domain 1: [Name]
**Impact**: [Core/Interface/Integration/Indirect]
**Risk**: [High/Medium/Low]
**Complexity**: [file count, integration points]
**Existing Patterns**: [description]
**Key Files**: [list]

### Domain 2: [Name]
[same structure]

## Integration Contracts

### Contract 1: [Domain A] → [Domain B]
**Type**: [API/Event/Data/Function]
**Current**: [existing contract]
**Changes Needed**: [yes/no, description]
**Risk**: [backward compatibility concerns]

### Contract 2: [...]
[same structure]

## Constraints

**Technical**:
- [constraint 1]
- [constraint 2]

**Business**:
- [constraint 1]
- [constraint 2]

## Risk Assessment

**High-Risk Areas**:
- [risk 1 with location]
- [risk 2 with location]

**Mitigation Strategies**:
- [strategy 1]
- [strategy 2]

## Complexity Re-validation

**Original Score**: X/12 → FULL tier
**Survey Findings**: [what we discovered]
**Re-calculated Score**: Y/12

**Recommendation**: [Continue FULL / De-escalate to HEAVY/MEDIUM/LIGHT]
**Reasoning**: [why]

## LCL Exports for Phase 1

LCL: constraint::architecture::[value]
LCL: constraint::performance::[value]
LCL: integration_contract::domain1_domain2::[value]
LCL: risk::high_priority::[value]
LCL: pattern::existing::[value]
```

## Phase 0 Verification

Before proceeding to Phase 1, confirm:

✅ **All domains identified** (complete map)
✅ **Integration contracts documented** (explicit interfaces)
✅ **Constraints discovered** (technical and business)
✅ **Risks flagged** (high-priority areas noted)
✅ **Complexity validated** (FULL tier confirmed or de-escalation recommended)
✅ **Critical LCL exported** (Phase 1 has needed context)

## Transition to Phase 1

**If FULL tier confirmed**:
- Clear phase0-survey.md from context
- Load phase1-planning.md
- Pass all LCL exports to planning phase
- Begin multi-domain planning

**If de-escalation recommended**:
- Ask user for approval
- If approved: transition to lower tier, preserve LCL
- If rejected: continue with FULL tier

**Next**: Phase 1 (Planning) with domain-specific planning agents
