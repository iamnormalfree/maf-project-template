# Phase 3: Coordinated Implementation

**Load this file**: After Phase 2 synthesis complete
**Purpose**: Multi-domain coordinated implementation following unified blueprint
**Clear after**: Implementation complete, proceed to Phase 4

## Phase 3 Objectives

1. **Blueprint Execution**: Implement each domain per synthesis decisions
2. **Sequence Adherence**: Follow defined sequential vs parallel work plan
3. **Contract Implementation**: Implement all integration contracts precisely
4. **Integration Validation**: Validate at each integration checkpoint
5. **Pattern Detection**: Use full tag set to catch all error patterns

## Context from Phase 2

This phase receives LCL exports from synthesis:
- Unified implementation blueprint
- Selected approaches per domain with PATH_RATIONALE
- Final integration contracts
- Implementation sequence (parallel vs sequential)
- Integration checkpoints

## Implementation Tag Set (Complete)

Phase 3 has access to **ALL tags** for maximum error prevention:

### Failsafe Tags (Always Available)
1. **#COMPLETION_DRIVE** - Assuming unknowns
2. **#QUESTION_SUPPRESSION** - Should ask but assuming
3. **#CARGO_CULT** - Pattern-driven features
4. **#PATH_DECISION** - Multiple approaches
5. **#Potential_Issue** - Unrelated discoveries

### Medium Tier Tags
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

### Planning Tags (Still Relevant)
16. **#POISON_PATH** - Terminology constraining solution
17. **#FIXED_FRAMING** - Problem framing eliminating alternatives
18. **#ANTICIPATION_BIAS** - Planning beyond requirements
19. **#PARALLEL_DEGRADATION** - Multiple concepts degrading
20. **#PLAN_UNCERTAINTY** - Implementation assumptions

### Synthesis Tags (Permanent Documentation)
21. **#PATH_RATIONALE** - Why specific path chosen (PERMANENT)
22. **#PHANTOM_PATTERN** - False recognition
23. **#FALSE_FLUENCY** - High-confidence but incorrect
24. **#CONFIDENCE_DISSONANCE** - Confidence doesn't match certainty

### Advanced Implementation Tags
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

### LCL Export Levels
- **#LCL_EXPORT_FIRM** - Maintain with precision (balanced cost/fidelity)
- **#LCL_EXPORT_CASUAL** - Store as influence/impression (style guidance)

## Tag Descriptions (Full Set)

### Advanced Implementation Tags (Detailed)

#### #PATTERN_CONFLICT
**Recognition signal**: "Functional and OOP approaches both feel applicable"
**Action**: Make explicit choice rather than blending inconsistently
**Example**: Mixing class-based and functional React patterns → pick one

#### #TRAINING_CONTRADICTION
**Recognition signal**: "Python context says A, JavaScript context says B for same problem"
**Action**: Choose based on current language/framework idioms
**Example**: Error handling patterns differ between languages → use current lang conventions

#### #PARADIGM_CLASH
**Recognition signal**: "Imperative solution feels natural but codebase is functional"
**Action**: Align with project paradigm
**Example**: Imperative loops in functional codebase → use map/reduce

#### #BEST_PRACTICE_TENSION
**Recognition signal**: "DRY says extract, but explicit is better says inline"
**Action**: Choose based on context and project standards
**Example**: Abstraction vs explicitness → decide which matters more here

#### #GOSSAMER_KNOWLEDGE
**Recognition signal**: "I know there's a pattern here but can't grasp specifics"
**Action**: Research and verify rather than inferring
**Example**: "Redux has some hook for this..." → look up exact hook name

#### #POOR_OUTPUT_INTUITION
**Recognition signal**: "This doesn't feel quite right but unclear why"
**Action**: Mark for thorough verification review
**Example**: Code works but feels wrong → verification finds subtle bug

#### #SOLUTION_COLLAPSE
**Recognition signal**: "Committed to Redux but Context API might be simpler"
**Action**: Pause and reconsider alternatives
**Example**: Deep into complex solution → realize simpler approach exists

#### #DETAIL_DRIFT
**Recognition signal**: "Building elaborate features beyond the spec"
**Action**: Re-read requirements, refocus on actual task
**Example**: Login form request → building full user management system

#### #TOKEN_PADDING
**Recognition signal**: "Generating verbose comments to reach perceived 'proper' length"
**Action**: Remove padding, keep code minimal
**Example**: Over-commenting obvious code → remove unnecessary comments

#### #ASSOCIATIVE_GENERATION
**Recognition signal**: "Adding user profiles because login systems usually have them"
**Action**: Mark as #SUGGEST if not specified
**Example**: Login → don't add profile management unless asked

#### #CONTEXT_RECONSTRUCT
**Recognition signal**: "Reconstructing API signature from memory of similar APIs"
**Action**: Stop and verify actual signature
**Example**: "This API probably takes (id, data)" → verify actual parameters

## Implementation Agent Deployment Strategy

### Agent Assignment by Domain

**One implementation agent per domain** (following blueprint)

**Example for multi-domain auth implementation**:
- Agent 1: Auth Service domain (follows blueprint approach)
- Agent 2: API Gateway domain (follows blueprint approach)
- Agent 3: Frontend domain (follows blueprint approach)
- Agent 4: Database domain (follows blueprint approach)

### Parallel vs Sequential Execution

**Parallel agents** (independent work):
- Deploy all at once if no dependencies
- Monitor progress independently
- Collect results when all complete

**Sequential agents** (dependent work):
- Deploy Agent 1 (foundation domain)
- Wait for completion + validation checkpoint
- Deploy Agent 2 (depends on Agent 1)
- Continue sequence

### Implementation Agent Task Template

```
Implement [Domain Name] following unified blueprint

Context from Phase 2:
LCL: blueprint::implementation_sequence::[sequence]
LCL: contract::final::[contracts for this domain]
LCL: decision::technical::[relevant decisions]
LCL: [any domain-specific context]

Blueprint for this domain:
- Selected approach: [approach from synthesis]
- Rationale: [PATH_RATIONALE from Phase 2]
- Key files: [files to modify/create]
- Integration contracts to implement:
  - Expose: [contracts this domain provides]
  - Consume: [contracts this domain uses]

Implementation requirements:

1. FOLLOW BLUEPRINT STRICTLY:
   - Implement selected approach as designed
   - Don't deviate without marking #SOLUTION_COLLAPSE
   - Respect PATH_RATIONALE from synthesis

2. IMPLEMENT CONTRACTS PRECISELY:
   - Match exact signatures/schemas from blueprint
   - Validate against contract specifications
   - Don't improvise contract details

3. MARK ALL PATTERNS (full tag set available):
   Core patterns:
   - #COMPLETION_DRIVE: When assuming unknowns
   - #QUESTION_SUPPRESSION: If unclear, ASK immediately
   - #CARGO_CULT: Unrequested features → mark #SUGGEST

   Technical accuracy:
   - #DOMAIN_MIXING: Verify correct API/version
   - #CONSTRAINT_OVERRIDE: Respect all constraints
   - #SPECIFICATION_REFRAME: Check solving right problem

   Implementation quality:
   - #PATTERN_CONFLICT: Resolve conflicting patterns
   - #PARADIGM_CLASH: Align with project paradigm
   - #GOSSAMER_KNOWLEDGE: Research vs infer
   - #POOR_OUTPUT_INTUITION: Mark if feels wrong

   Scope management:
   - #DETAIL_DRIFT: Stay focused on blueprint
   - #ASSOCIATIVE_GENERATION: Don't add related features
   - #TOKEN_PADDING: Keep code minimal
   - #FALSE_COMPLETION: Verify all requirements met

   Meta signals:
   - #SUNK_COST_COMPLETION: Continuing bad approach?
   - #SOLUTION_COLLAPSE: Should reconsider simpler approach?
   - #CONTEXT_DEGRADED: Re-read rather than infer
   - #RESOLUTION_PRESSURE: Deploy continuation agent if needed

4. INTEGRATION CHECKPOINTS:
   - Validate contract implementation at each checkpoint
   - Don't proceed past checkpoint until validation passes
   - Report checkpoint status to orchestrator

5. PRESERVE CONTEXT FOR PHASE 4:
   - #LCL_EXPORT_FIRM: Implementation details affecting verification
   - #LCL_EXPORT_CASUAL: Code style choices made

Return: Implemented domain with contract validation results
```

## Contract Implementation Protocol

### Contract Precision is Critical

**Why precision matters**: Small contract deviations cause integration failures

**Example of contract deviation**:
```typescript
// Contract specified:
POST /api/auth/login
Response: { token: string, expiresIn: number } // expiresIn in SECONDS

// What was implemented:
Response: { token: string, expiresIn: number } // but returns MILLISECONDS

// Result: Frontend thinks token expires in 1000 seconds, actually 1 second
// Integration fails silently
```

### Contract Implementation Checklist

For each contract this domain exposes:

✅ **Signature matches exactly** (parameter names, types, order)
✅ **Return type matches exactly** (all fields, correct types)
✅ **Edge cases handled** (null, empty, error conditions)
✅ **Units specified correctly** (seconds vs milliseconds, etc.)
✅ **Validation implemented** (reject invalid input per contract)
✅ **Error responses match** (status codes, error formats)

For each contract this domain consumes:

✅ **Calls match contract** (correct parameters)
✅ **Response handling correct** (parse expected format)
✅ **Error handling present** (handle contract error conditions)
✅ **No assumptions beyond contract** (don't rely on undocumented behavior)

### Contract Validation Examples

**API Contract Implementation**:
```typescript
// Contract from Phase 2:
POST /api/auth/login
Request: { email: string, password: string }
Response: { token: string, refreshToken: string, expiresIn: number }
Status: 200 (success), 401 (invalid), 429 (rate limit)

// Implementation must match EXACTLY:

// ✅ Correct:
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body; // exact field names

  // ... authentication logic ...

  if (authenticated) {
    return res.status(200).json({
      token: jwtToken,           // exact field name
      refreshToken: refreshTok,  // exact field name
      expiresIn: 3600            // number in SECONDS per contract
    });
  }

  if (rateLimited) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

// ❌ Wrong (contract deviation):
app.post('/api/auth/login', async (req, res) => {
  return res.status(200).json({
    jwt: token,              // WRONG: contract says "token" not "jwt"
    refresh: refreshToken,   // WRONG: contract says "refreshToken"
    ttl: 3600000            // WRONG: milliseconds not seconds
  });
});
// #DOMAIN_MIXING: Mixed up contract specification
```

**Event Contract Implementation**:
```typescript
// Contract from Phase 2:
Event: PaymentCompleted
Payload: {
  userId: string,
  amount: number,
  currency: string,
  transactionId: string,
  timestamp: ISO8601
}

// ✅ Correct:
eventBus.emit('PaymentCompleted', {
  userId: user.id,
  amount: 29.99,
  currency: 'USD',
  transactionId: tx.id,
  timestamp: new Date().toISOString() // ISO8601 format per contract
});

// ❌ Wrong:
eventBus.emit('PaymentCompleted', {
  user: user.id,              // WRONG: contract says "userId"
  amount: 29.99,
  currency: 'USD',
  transactionId: tx.id,
  timestamp: Date.now()       // WRONG: Unix timestamp, not ISO8601
});
// #CONSTRAINT_OVERRIDE: Violated contract specification
```

## Integration Checkpoint Validation

### Checkpoint Protocol

At each integration checkpoint (defined in Phase 2 blueprint):

**Step 1: Pause Implementation**
- Stop before integrating domains
- Prepare validation tests

**Step 2: Validate Contracts**
```markdown
## Integration Checkpoint: [Name]

### Contracts to Validate:
1. [Domain A] → [Domain B]: [Contract name]
   - Test: [specific test]
   - Expected: [expected result]
   - Actual: [actual result]
   - Status: ✅ Pass / ❌ Fail

2. [Domain B] → [Domain C]: [Contract name]
   - Test: [specific test]
   - Expected: [expected result]
   - Actual: [actual result]
   - Status: ✅ Pass / ❌ Fail
```

**Step 3: Proceed or Fix**
- ✅ All contracts pass → proceed to next phase of integration
- ❌ Any contract fails → fix contract implementation, re-validate

### Example Integration Checkpoint

```markdown
## Integration Checkpoint 1: Auth Service + API Gateway

### Validation Tests:

**Test 1**: Auth Service exposes JWT token endpoint
- Call: POST /api/auth/login {"email": "test@example.com", "password": "test123"}
- Expected: Status 200, {token: string, refreshToken: string, expiresIn: number}
- Actual: Status 200, {token: "eyJ...", refreshToken: "abc...", expiresIn: 3600}
- Status: ✅ Pass

**Test 2**: API Gateway validates JWT tokens
- Call: GET /api/protected with Authorization: Bearer [token from Test 1]
- Expected: Status 200 (token accepted)
- Actual: Status 401 "Invalid token"
- Status: ❌ Fail
- Issue: Gateway using different JWT secret than Auth Service
- #COMPLETION_DRIVE: Assumed both would use same env variable, but configured differently

**Fix**: Align JWT secret configuration between Auth Service and API Gateway
**Re-test**: ✅ Pass

**Checkpoint Result**: ✅ Ready to proceed
```

## Implementation Sequence Management

### Sequential Work (Dependencies)

**Example sequence from blueprint**:
```
1. Database schema changes (Phase 3A)
   ↓ (must complete before)
2. Backend API implementation (Phase 3B)
   ↓ (must complete before)
3. Frontend integration (Phase 3C)
```

**Orchestrator workflow**:
```markdown
### Phase 3A: Database Domain
- Deploy database implementation agent
- Wait for completion
- Validate: Schema changes applied correctly
- Checkpoint: ✅ Database ready

### Phase 3B: Backend API Domain
- Deploy backend implementation agent (can now use new schema)
- Wait for completion
- Validate: API endpoints work with new schema
- Checkpoint: ✅ API ready

### Phase 3C: Frontend Domain
- Deploy frontend implementation agent (can now use API)
- Wait for completion
- Validate: End-to-end flow works
- Checkpoint: ✅ Integration complete
```

### Parallel Work (No Dependencies)

**Example from blueprint**:
```
Parallel Stream A: Frontend UI components (using agreed contract)
Parallel Stream B: Backend business logic (exposing agreed contract)
```

**Orchestrator workflow**:
```markdown
### Phase 3A: Parallel Implementation

**Deploy simultaneously**:
- Agent 1: Frontend domain (implements against contract)
- Agent 2: Backend domain (exposes contract)

**Monitor both**:
- Track Agent 1 status: IN_PROGRESS
- Track Agent 2 status: IN_PROGRESS

**Wait for both to complete**:
- Agent 1: COMPLETED
- Agent 2: COMPLETED

**Integration Checkpoint**:
- Test: Frontend calls Backend via contract
- Validate: Contract works as designed
- Result: ✅ Integration successful
```

## Pattern Detection During Implementation

### High-Priority Patterns (Catch These)

**Wrong Direction Errors** (fix immediately):
- **#QUESTION_SUPPRESSION**: Should have asked user
- **#SPECIFICATION_REFRAME**: Solving wrong problem
- **#CONSTRAINT_OVERRIDE**: Violating stated constraints
- **#DETAIL_DRIFT**: Drifted from blueprint

**Technical Accuracy** (verify before proceeding):
- **#DOMAIN_MIXING**: Blending APIs/versions
- **#CONTEXT_RECONSTRUCT**: Reconstructing from memory
- **#GOSSAMER_KNOWLEDGE**: Can't grasp specifics
- **#COMPLETION_DRIVE**: Assuming unknowns

**Architectural Alignment** (resolve conflicts):
- **#PATTERN_CONFLICT**: Contradictory patterns
- **#PARADIGM_CLASH**: Conflicting paradigms
- **#BEST_PRACTICE_TENSION**: Competing practices

**Scope Management** (prevent scope creep):
- **#CARGO_CULT**: Unrequested features
- **#ASSOCIATIVE_GENERATION**: Related features
- **#ANTICIPATION_BIAS**: Beyond requirements
- **#TOKEN_PADDING**: Unnecessary code

**Quality Signals** (extra attention needed):
- **#POOR_OUTPUT_INTUITION**: Feels wrong
- **#SUNK_COST_COMPLETION**: Bad approach but invested
- **#SOLUTION_COLLAPSE**: Prematurely converged
- **#RESOLUTION_PRESSURE**: Deploy continuation agent

### Pattern Detection in Context

**Example 1: Detecting Scope Creep**
```typescript
// Blueprint: "Add login endpoint"

// Implementation in progress:
// POST /api/auth/login - ✅ per blueprint
// POST /api/auth/register - ❌ not in blueprint
// POST /api/auth/forgot-password - ❌ not in blueprint
// POST /api/auth/reset-password - ❌ not in blueprint

// #ASSOCIATIVE_GENERATION: Adding related auth endpoints because
// login systems usually have these features
// #DETAIL_DRIFT: Drifted from "add login" to "build auth system"

// Action: Remove extra endpoints or mark as #SUGGEST
```

**Example 2: Detecting Technical Inaccuracy**
```typescript
// Blueprint specifies: React 18 with concurrent features

// Implementation:
import { render } from 'react-dom'; // ❌ React 17 API
// #DOMAIN_MIXING: Using React 17 API in React 18 project

// Should be:
import { createRoot } from 'react-dom/client'; // ✅ React 18 API

// Action: Fix to match blueprint specification
```

**Example 3: Detecting Pattern Conflict**
```typescript
// Codebase uses functional React components

// Implementation in progress:
class LoginForm extends React.Component { // ❌ Class component
  // #PARADIGM_CLASH: Using class-based in functional codebase

  // Action: Align with project paradigm, use functional component
}

// Should be:
function LoginForm() { // ✅ Functional component
  // Aligns with codebase paradigm
}
```

## Multi-Domain Coordination

### Coordination Challenges

**Challenge 1: Shared Resources**
- Multiple domains modifying same files
- Potential merge conflicts

**Solution**: Sequence to avoid conflicts
```markdown
Sequential:
1. Domain A updates shared file
2. Domain B updates same file (after A complete)

Or create adapter:
- Domain A owns file
- Domain B uses adapter to interact
```

**Challenge 2: Integration Timing**
- Domain A exposes contract
- Domain B consumes contract
- But Domain B deploys before A is ready

**Solution**: Use stubs until ready
```markdown
Phase 3A: Domain B develops against stub
Phase 3B: Domain A implements actual contract
Phase 3C: Domain B integrates with real contract
Validation: Integration checkpoint confirms contract works
```

**Challenge 3: Circular Dependencies**
- Domain A needs Domain B
- Domain B needs Domain A

**Solution**: Break cycle with interface
```markdown
Phase 3A: Define shared interface
Phase 3B: Domain A implements against interface
Phase 3C: Domain B implements against same interface
Phase 3D: Wire both together via interface
```

## Phase 3 Verification (Pre-Phase 4)

Before proceeding to Phase 4, confirm:

✅ **All domains implemented** (per blueprint)
✅ **All contracts implemented** (precisely matching specifications)
✅ **Integration checkpoints validated** (all passing)
✅ **Implementation sequence followed** (parallel/sequential adhered to)
✅ **Blueprint adherence** (no unauthorized deviations)
✅ **Pattern tags marked** (all detected patterns tagged)
✅ **Scope maintained** (no feature creep, DETAIL_DRIFT/ASSOCIATIVE_GENERATION caught)
✅ **LCL exported** (Phase 4 has verification context)

## Transition to Phase 4

**Ready for verification when**:
- All implementation agents complete
- All integration checkpoints pass
- All contracts implemented and validated
- Pattern tags marked throughout
- LCL exports collected

**Next step**:
- Clear phase3-implementation.md from context
- Load phase4-verification.md
- Pass all LCL exports (implementation details, patterns detected)
- Begin comprehensive multi-domain verification

**Phase 4 will**:
- Resolve all tagged patterns
- Verify cross-domain integration thoroughly
- Validate all assumptions
- Remove processing tags
- Ensure clean, production-ready code
