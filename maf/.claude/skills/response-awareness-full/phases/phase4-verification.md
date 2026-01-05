# Phase 4: Comprehensive Verification

**Load this file**: After Phase 3 implementation complete
**Purpose**: Multi-domain verification, tag resolution, integration validation
**Clear after**: Verification complete, proceed to Phase 5

## Phase 4 Objectives

1. **Tag Resolution**: Resolve all tagged patterns from implementation
2. **Contract Verification**: Validate all integration contracts work correctly
3. **Cross-Domain Validation**: Ensure domains integrate properly
4. **Assumption Verification**: Validate all COMPLETION_DRIVE assumptions
5. **Quality Assurance**: Confirm production-ready code quality
6. **Documentation Preparation**: Prepare architectural decisions for Phase 5

## Context from Phase 3

This phase receives LCL exports from implementation:
- All implemented code
- Pattern tags marked during implementation
- Integration checkpoint results
- Contract implementations
- Implementation details and decisions

## Verification Agent Deployment

**Deploy 1-2 verification agents**:

**Option 1: Single comprehensive agent** (for moderate complexity)
- Verifies all domains and integrations
- Resolves all tags in priority order

**Option 2: Specialized agents** (for high complexity):
- Agent 1: Tag resolution and pattern cleanup
- Agent 2: Integration and contract verification

### Verification Agent Task Template

```
Comprehensive verification of multi-domain implementation

Context from Phase 3:
LCL: [all implementation details]
LCL: [integration checkpoint results]
LCL: [pattern tags marked]

Verification requirements:

PRIORITY ORDER (critical errors first):

1. CRITICAL ERROR PREVENTION:
   - #QUESTION_SUPPRESSION: Should have asked user → validate assumption or ASK NOW
   - #SPECIFICATION_REFRAME: Verify correct problem solved
   - #CONSTRAINT_OVERRIDE: Fix any constraint violations
   - #FALSE_COMPLETION: Confirm ALL requirements met

2. ASSUMPTION VERIFICATION:
   - #COMPLETION_DRIVE: Verify every assumption made
   - #CONTEXT_DEGRADED/#CONTEXT_RECONSTRUCT: Re-verify sources
   - #DOMAIN_MIXING: Confirm correct API/version used
   - #GOSSAMER_KNOWLEDGE: Research and confirm specifics

3. ARCHITECTURAL ALIGNMENT:
   - #PATTERN_CONFLICT: Resolve to consistent approach
   - #PARADIGM_CLASH: Align with project paradigm
   - #BEST_PRACTICE_TENSION: Choose contextually appropriate

4. PATTERN CLEANUP:
   - #CARGO_CULT/#ASSOCIATIVE_GENERATION: Validate need or remove
   - #TOKEN_PADDING: Remove unnecessary code/comments
   - #DETAIL_DRIFT: Verify scope alignment

5. QUALITY SIGNALS:
   - #SUNK_COST_COMPLETION/#SOLUTION_COLLAPSE: Evaluate restart need
   - #POOR_OUTPUT_INTUITION: Deep review of flagged areas
   - #RESOLUTION_PRESSURE: Fresh verification needed
   - #CONFIDENCE_DISSONANCE: Extra verification

6. SYNTHESIS VALIDATION:
   - #PHANTOM_PATTERN/#FALSE_FLUENCY: Verify logic correct
   - Cross-check against #PATH_RATIONALE from Phase 2

7. CONTRACT VERIFICATION:
   - All contracts match specifications exactly
   - Integration tests pass
   - Edge cases handled

8. CROSS-DOMAIN INTEGRATION:
   - End-to-end flows work correctly
   - No integration gaps
   - Performance acceptable

9. SUGGESTIONS:
   - Compile all #SUGGEST_* items for user

10. DOCUMENTATION PRESERVATION:
    - Keep #PATH_DECISION and #PATH_RATIONALE
    - Remove ALL other processing tags

Return: Clean, verified code ready for Phase 5 reporting
```

## Tag Resolution Priority Order

### Priority 1: Critical Error Prevention

**HIGHEST PRIORITY** - These can cause wrong entire directions:

#### #QUESTION_SUPPRESSION
**What to do**:
1. Review assumption made
2. Evaluate if assumption reasonable
3. If uncertain: ASK USER NOW
4. If certain: Document why assumption valid
5. Remove tag

**Example**:
```typescript
// Tagged during implementation:
// #QUESTION_SUPPRESSION: Assumed email validation means regex check
// Not sure if they want regex or just non-empty

// Verification action:
// Review requirement: "Add email validation"
// Check existing codebase: Other validations use validator library
// Decision: Use validator library for consistency
// Document: "Used validator.isEmail() per existing pattern"
// Remove tag
```

#### #SPECIFICATION_REFRAME
**What to do**:
1. Re-read original requirement
2. Compare with what was implemented
3. If different problem solved: FIX
4. If correct: Remove tag

**Example**:
```typescript
// Requirement: "Add login validation"
// #SPECIFICATION_REFRAME: Built full auth system with roles

// Verification action:
// Compare: Requirement vs Implementation
// Finding: Implemented way beyond requirement
// Fix: Remove role management, focus on login validation only
// Keep: Just login validation logic
```

#### #CONSTRAINT_OVERRIDE
**What to do**:
1. Check stated constraint
2. Verify if violated
3. If violated: FIX immediately
4. If not violated (false positive): Remove tag

**Example**:
```typescript
// Constraint: "No new dependencies"
// #CONSTRAINT_OVERRIDE: About to import 'axios'

// Verification action:
// Check: Is axios in package.json already? No.
// Violation: Yes, added new dependency
// Fix: Replace with native fetch API
// Remove tag after fix
```

#### #FALSE_COMPLETION
**What to do**:
1. List all requirements from original request
2. Check each requirement against implementation
3. If any missing: IMPLEMENT
4. If all present: Remove tag

**Example**:
```typescript
// Requirement: "Add CRUD operations for users"
// #FALSE_COMPLETION: Only implemented Create and Read

// Verification action:
// Checklist:
//   ✅ Create - implemented
//   ✅ Read - implemented
//   ❌ Update - missing
//   ❌ Delete - missing
// Fix: Implement Update and Delete operations
// Re-verify: All 4 operations present
// Remove tag
```

### Priority 2: Assumption Verification

#### #COMPLETION_DRIVE
**What to do**:
1. Find assumption
2. Verify assumption correct (check actual code/API/docs)
3. If wrong: FIX
4. If correct: Remove tag

**Example**:
```typescript
// #COMPLETION_DRIVE: Assumed utils.formatDate() exists

// Verification action:
// Check: Does utils.formatDate exist in codebase?
// Result: No, doesn't exist
// Fix: Implement formatDate or use existing date library
// Remove tag after fix
```

#### #CONTEXT_DEGRADED / #CONTEXT_RECONSTRUCT
**What to do**:
1. Re-read original source
2. Compare with reconstructed version
3. If mismatch: FIX
4. If match: Remove tag

**Example**:
```typescript
// #CONTEXT_RECONSTRUCT: Reconstructed API signature from memory
// Assumed: fetchUser(id: string) → Promise<User>

// Verification action:
// Check actual API:
// Actual: fetchUser(id: number, includeMetadata?: boolean) → Promise<User>
// Mismatch: Parameter type (string vs number) and missing optional param
// Fix: Update calls to use correct signature
```

#### #DOMAIN_MIXING
**What to do**:
1. Identify which domains/versions are being mixed
2. Verify correct domain for this codebase
3. Fix to use correct domain
4. Remove tag

**Example**:
```typescript
// #DOMAIN_MIXING: Mixing React Router v5 and v6 APIs

// Verification action:
// Check package.json: "react-router-dom": "^6.0.0"
// Correct version: v6
// Fix: Replace v5 API (useHistory) with v6 API (useNavigate)
// Remove tag
```

#### #GOSSAMER_KNOWLEDGE
**What to do**:
1. Research the specific detail
2. Find authoritative source (docs, code)
3. Update implementation with precise information
4. Remove tag

**Example**:
```typescript
// #GOSSAMER_KNOWLEDGE: "Redux has some hook for dispatch..."

// Verification action:
// Research: Check Redux docs
// Finding: Hook is useDispatch()
// Also found: Should use useSelector() for state
// Update: Use correct hooks
// Remove tag
```

### Priority 3: Architectural Alignment

#### #PATTERN_CONFLICT
**What to do**:
1. Identify conflicting patterns
2. Choose one based on project standards
3. Make implementation consistent
4. Remove tag

**Example**:
```typescript
// #PATTERN_CONFLICT: Mixing class-based and functional React

// Verification action:
// Check codebase: 95% functional components
// Decision: Use functional pattern
// Fix: Convert class component to functional
// Remove tag
```

#### #PARADIGM_CLASH
**What to do**:
1. Identify project paradigm
2. Align implementation with paradigm
3. Remove tag

**Example**:
```typescript
// #PARADIGM_CLASH: Imperative loops in functional codebase

// Verification action:
// Codebase paradigm: Functional (uses map/reduce/filter)
// Fix: Replace for loops with map/reduce
// Remove tag
```

#### #BEST_PRACTICE_TENSION
**What to do**:
1. Evaluate context
2. Choose appropriate practice for this situation
3. Document why in comment if non-obvious
4. Remove tag

**Example**:
```typescript
// #BEST_PRACTICE_TENSION: DRY vs explicit (same logic twice)

// Verification action:
// Context: Logic is simple but used in 2 different domains
// Decision: Keep explicit (clearer boundaries)
// Document: "Intentionally duplicated for domain isolation"
// Remove tag
```

### Priority 4: Pattern Cleanup

#### #CARGO_CULT / #ASSOCIATIVE_GENERATION
**What to do**:
1. Check if feature was requested
2. If not requested:
   - Option A: Remove (if truly unnecessary)
   - Option B: Keep and mark as #SUGGEST for user
3. Remove tag

**Example**:
```typescript
// #CARGO_CULT: Added error handling because pattern usually has it
// Request was: "Add login form"

// Verification action:
// Was error handling requested? No.
// Is it necessary? For production, yes.
// Decision: Keep but mark as #SUGGEST_ERROR_HANDLING
// Compile for user: "Added error handling for network failures - recommend keeping"
// Remove CARGO_CULT tag
```

#### #TOKEN_PADDING
**What to do**:
1. Identify unnecessary code/comments
2. Remove padding
3. Keep only essential code
4. Remove tag

**Example**:
```typescript
// #TOKEN_PADDING: Over-commenting obvious code

// Before:
// This function takes a user object and returns the user's email address
// It does this by accessing the email property on the user object
function getUserEmail(user) { // Define function to get user email
  return user.email; // Return the email property
}

// After:
function getUserEmail(user) {
  return user.email;
}
```

#### #DETAIL_DRIFT
**What to do**:
1. Re-read original requirement
2. Identify drift
3. Remove drifted features
4. Refocus on actual requirement
5. Remove tag

**Example**:
```typescript
// Requirement: "Add login form"
// #DETAIL_DRIFT: Built user management system with profiles, settings, etc.

// Verification action:
// Requirement: Login form only
// Drift: All the extra user management features
// Fix: Remove profile management, settings, etc.
// Keep: Just login form
```

### Priority 5: Quality Signals

#### #SUNK_COST_COMPLETION / #SOLUTION_COLLAPSE
**What to do**:
1. Evaluate if current approach is optimal
2. Consider: Is simpler approach better?
3. If yes and significant improvement: Restart with better approach
4. If no: Continue with current, remove tag

**Example**:
```typescript
// #SUNK_COST_COMPLETION: Recursive approach causing stack issues
// 200 lines of complex recursion with stack overflow

// Verification action:
// Evaluate: Is iterative approach simpler? Yes.
// Impact: Much clearer, no stack issues
// Decision: Restart with iterative approach
// Result: 50 lines, no stack issues, clearer logic
```

#### #POOR_OUTPUT_INTUITION
**What to do**:
1. Deep review of flagged code
2. Look for subtle bugs
3. Test edge cases
4. If bug found: FIX
5. Remove tag

**Example**:
```typescript
// #POOR_OUTPUT_INTUITION: This calculation feels off

// Code:
const discount = price * 0.1;
const finalPrice = price - discount;

// Verification deep dive:
// Test: price = 100
// discount = 10, finalPrice = 90 ✓
// Test: price = 0
// discount = 0, finalPrice = 0 ✓
// Test: price = -50 (invalid)
// discount = -5, finalPrice = -45 ❌ Should reject negative prices

// Fix:
if (price < 0) throw new Error("Price cannot be negative");
const discount = price * 0.1;
const finalPrice = price - discount;
```

#### #CONFIDENCE_DISSONANCE / #RESOLUTION_PRESSURE
**What to do**:
1. These are meta-signals: Extra verification needed
2. Review flagged area with fresh eyes
3. Deploy continuation agent if needed
4. Remove tag after thorough review

### Priority 6: Synthesis Validation

#### #PHANTOM_PATTERN / #FALSE_FLUENCY
**What to do**:
1. Verify the pattern/logic is actually correct
2. Don't trust the "familiarity" feeling
3. Test thoroughly
4. Remove tag after validation

**Cross-check #PATH_RATIONALE**:
- Verify implementation follows PATH_RATIONALE from Phase 2
- If deviated: Check if deviation justified or bug
- Align with rationale or update rationale if intentional change

## Contract Verification Protocol

### Contract Testing

For each integration contract:

```markdown
### Contract: [Domain A] → [Domain B]

**Specification** (from Phase 2):
[Exact contract specification]

**Implementation Verification**:

**Test 1**: [Happy path]
- Input: [test input]
- Expected: [expected output per contract]
- Actual: [actual output]
- Status: ✅ / ❌

**Test 2**: [Edge case - empty/null]
- Input: [edge case input]
- Expected: [expected handling per contract]
- Actual: [actual handling]
- Status: ✅ / ❌

**Test 3**: [Error condition]
- Input: [error-inducing input]
- Expected: [expected error per contract]
- Actual: [actual error]
- Status: ✅ / ❌

**Overall**: ✅ Contract correctly implemented / ❌ Deviations found
```

**If deviations found**: Fix to match contract exactly

### End-to-End Integration Testing

Test complete flows across all domains:

```markdown
## E2E Test: [User Flow Name]

**Flow**: [Description of user flow across domains]

**Steps**:
1. User action → Domain A
2. Domain A → Domain B (via Contract 1)
3. Domain B → Domain C (via Contract 2)
4. Domain C → User response

**Test Execution**:

Step 1: [action] → Domain A: [result] ✅
Step 2: Domain A → Domain B: [result] ✅
Step 3: Domain B → Domain C: [result] ✅
Step 4: Response to user: [result] ✅

**Overall**: ✅ Flow works end-to-end / ❌ Integration failure at step X
```

## Cross-Domain Integration Validation

### Integration Checklist

✅ **All contracts implemented** (match specifications exactly)
✅ **Contract tests pass** (happy path, edge cases, errors)
✅ **E2E flows work** (complete user journeys)
✅ **No integration gaps** (all necessary contracts present)
✅ **Error handling present** (failures handled gracefully)
✅ **Performance acceptable** (meets performance constraints from Phase 0)

### Performance Validation

If performance constraints were specified (from Phase 0):

```markdown
## Performance Verification

**Constraint 1**: API response time < 200ms
**Test**: [endpoint] with [typical load]
**Result**: Avg 150ms, p95 180ms, p99 195ms
**Status**: ✅ Meets constraint

**Constraint 2**: Bundle size < 500KB
**Test**: Production build
**Result**: 487KB
**Status**: ✅ Meets constraint

**Constraint 3**: Database queries < 10 per request
**Test**: [endpoint] query count
**Result**: 8 queries
**Status**: ✅ Meets constraint
```

## Suggestion Compilation

Collect all #SUGGEST_* tags:

```markdown
## Suggestions for User

These features were added based on common patterns but weren't explicitly requested:

### 1. Error Handling (#SUGGEST_ERROR_HANDLING)
**Location**: src/api/auth.ts:45
**What**: Added try/catch for network failures
**Recommendation**: Keep for production resilience
**Rationale**: Login should handle network failures gracefully

### 2. Edge Case Handling (#SUGGEST_EDGE_CASE)
**Location**: src/utils/format.ts:12
**What**: Handle empty array case
**Recommendation**: Keep
**Rationale**: Prevents runtime errors

### 3. Input Validation (#SUGGEST)
**Location**: src/components/LoginForm.tsx:30
**What**: Email format validation
**Recommendation**: Review - might be too strict
**Rationale**: Currently rejects valid emails with + signs

[User can approve/reject each suggestion in Phase 5 report]
```

## Tag Cleanup Protocol

### Final Cleanup

After resolving all patterns:

**Remove ALL processing tags**:
- COMPLETION_DRIVE
- QUESTION_SUPPRESSION
- CARGO_CULT
- SPECIFICATION_REFRAME
- DOMAIN_MIXING
- CONSTRAINT_OVERRIDE
- SUNK_COST_COMPLETION
- CONTEXT_DEGRADED
- LCL_EXPORT_* (all variants)
- SUGGEST_* (compile to report, remove from code)
- FALSE_COMPLETION
- RESOLUTION_PRESSURE
- POISON_PATH
- FIXED_FRAMING
- ANTICIPATION_BIAS
- PARALLEL_DEGRADATION
- PLAN_UNCERTAINTY
- PHANTOM_PATTERN
- FALSE_FLUENCY
- CONFIDENCE_DISSONANCE
- PATTERN_CONFLICT
- TRAINING_CONTRADICTION
- PARADIGM_CLASH
- BEST_PRACTICE_TENSION
- GOSSAMER_KNOWLEDGE
- POOR_OUTPUT_INTUITION
- SOLUTION_COLLAPSE
- DETAIL_DRIFT
- TOKEN_PADDING
- ASSOCIATIVE_GENERATION
- CONTEXT_RECONSTRUCT

**KEEP only PATH documentation**:
- #PATH_DECISION (documents alternatives considered)
- #PATH_RATIONALE (documents why specific path chosen)

**KEEP Potential_Issue tags** (informational):
- #Potential_Issue (unrelated problems discovered)

### Final Code Review

Before Phase 5:

✅ **All processing tags removed** (except PATH docs and Potential_Issue)
✅ **Code is clean** (no tag debris)
✅ **Comments are minimal** (only essential explanations)
✅ **No unnecessary code** (padding removed)
✅ **Consistent style** (paradigm aligned)
✅ **All assumptions verified** (no unvalidated assumptions)
✅ **All requirements met** (complete implementation)
✅ **All contracts work** (integration validated)

## Phase 4 Verification

Before proceeding to Phase 5, confirm:

✅ **All tags resolved** (priority order followed)
✅ **All assumptions verified** (COMPLETION_DRIVE checked)
✅ **All contracts validated** (integration tests pass)
✅ **E2E flows tested** (user journeys work)
✅ **Performance validated** (constraints met)
✅ **Suggestions compiled** (for Phase 5 report)
✅ **Code cleaned** (only PATH tags remain)
✅ **Production ready** (quality assured)

## Transition to Phase 5

**Ready for reporting when**:
- All pattern tags resolved
- All contracts verified working
- Integration validated end-to-end
- Code cleaned and production-ready
- Suggestions compiled

**Next step**:
- Clear phase4-verification.md from context
- Load phase5-report.md
- Pass verification results and suggestions
- Generate comprehensive final report

**Phase 5 will**:
- Document architectural decisions
- Create integration summary
- Present suggestions to user
- Provide handoff documentation
- Deliver final clean code
