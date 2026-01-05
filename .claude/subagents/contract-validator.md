# Contract Validator Subagent

## Purpose
Validates integration contracts between domains to prevent integration failures. Specialized for FULL tier Phase 2 (Synthesis) cross-domain validation.

## When to Use
- FULL tier Phase 2 (after multi-domain planning, before synthesis)
- When multiple domains expose/consume integration contracts
- To validate contract compatibility before implementation begins

## Core Capabilities
- Extract integration contracts from domain plans
- Validate contract compatibility (types, formats, semantics)
- Identify contract mismatches
- Generate contract alignment recommendations
- Produce structured validation report

## Tools Available
- **Read**: Read domain planning outputs
- **Grep**: Search for contract definitions
- **Glob**: Find all plan files

## Integration Contract Types

### 1. API Contracts (REST/GraphQL)
**What to validate**:
- Endpoint paths match on both sides
- HTTP methods align
- Request/response field names identical
- Data types compatible (string/number/boolean/object/array)
- Required vs optional fields consistent
- Status codes defined on both sides
- Error response formats match

**Example mismatch**:
```
Frontend expects: POST /api/login → {token: string, expires: number}
Backend provides: POST /api/login → {accessToken: string, expiresIn: number}

Mismatch: Field names differ (token vs accessToken, expires vs expiresIn)
```

### 2. Event Contracts (Event-Driven)
**What to validate**:
- Event names identical (case-sensitive)
- Payload structure matches
- Field names and types align
- Required fields present on both sides
- Timestamp formats consistent
- Event versioning strategy defined

**Example mismatch**:
```
Publisher emits: UserLoggedIn {userId: string, timestamp: ISO8601}
Subscriber expects: UserLoggedIn {user_id: number, loginTime: Unix}

Mismatch: Field name format (userId vs user_id), ID type (string vs number), timestamp format (ISO vs Unix)
```

### 3. Data Contracts (Database/Shared Models)
**What to validate**:
- Table/collection names match
- Column/field names identical
- Data types compatible
- Constraints consistent (nullable, unique, etc.)
- Foreign key relationships defined on both sides
- Index strategies aligned

**Example mismatch**:
```
Service A writes: users {id: UUID, email: VARCHAR(255)}
Service B reads: users {id: INT, email_address: TEXT}

Mismatch: ID type (UUID vs INT), field name (email vs email_address), type precision
```

### 4. Function Contracts (Internal APIs)
**What to validate**:
- Function/method names identical
- Parameter order matches
- Parameter types compatible
- Return type consistent
- Error handling approach defined
- Async vs sync contract clear

**Example mismatch**:
```
Module A exports: authenticateUser(email: string, password: string) → Promise<User>
Module B imports: authenticateUser(username: string, password: string) → User

Mismatch: Parameter name (email vs username), return type (Promise vs sync)
```

## Validation Process

### Step 1: Contract Extraction

**From planning outputs, extract all contracts**:

```python
contracts = []

for plan_file in glob("docs/response-awareness-plans/*.md"):
    plan = read(plan_file)

    # Extract API contracts
    api_contracts = extract_api_contracts(plan)

    # Extract event contracts
    event_contracts = extract_event_contracts(plan)

    # Extract data contracts
    data_contracts = extract_data_contracts(plan)

    # Extract function contracts
    function_contracts = extract_function_contracts(plan)

    contracts.extend([api_contracts, event_contracts, data_contracts, function_contracts])
```

**Contract extraction patterns**:
- Look for endpoint definitions: `POST /api/...`, `GET /api/...`
- Look for event definitions: `Event:`, `emits`, `listens to`, `subscribes to`
- Look for data models: `table`, `schema`, `model`, `interface`
- Look for function signatures: `function`, `method`, `exports`, `returns`

### Step 2: Contract Mapping

**Build contract matrix** - who exposes vs who requires:

| Contract | Exposed By | Required By | Type |
|----------|-----------|-------------|------|
| POST /api/login | Auth Service | Frontend | API |
| UserLoggedIn event | Auth Service | Analytics, Notification | Event |
| users table | Database | Auth Service, Admin | Data |
| validateToken() | Auth Service | API Gateway | Function |

### Step 3: Compatibility Validation

**For each contract, check compatibility**:

**Type Compatibility**:
- string ↔ string ✅
- number ↔ number ✅
- string ↔ number ❌ (mismatch)
- Date ↔ string (check format: ISO8601, Unix, etc.)
- object ↔ object (recurse into fields)
- array ↔ array (check element types)

**Semantic Compatibility**:
- `userId` vs `user_id` (naming convention mismatch)
- `expires` vs `expiresIn` (semantic difference: timestamp vs duration)
- `token` vs `accessToken` (terminology difference)

**Format Compatibility**:
- ISO8601 timestamp vs Unix timestamp
- UUID vs integer ID
- Email format validation differences
- Enum values (must match exactly)

### Step 4: Mismatch Detection

**Identify all mismatches**:

```markdown
## Contract Validation Results

### ❌ Mismatch 1: Login API Response
**Contract**: POST /api/login response
**Exposed by**: Auth Service (backend)
**Required by**: Frontend

**Auth Service provides**:
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": "number"  // seconds
}
```

**Frontend expects**:
```json
{
  "token": "string",
  "refresh": "string",
  "expires": "number"  // timestamp
}
```

**Mismatches**:
1. Field name: `accessToken` vs `token`
2. Field name: `refreshToken` vs `refresh`
3. Field name: `expiresIn` vs `expires`
4. Semantic: `expiresIn` (duration in seconds) vs `expires` (absolute timestamp)

**Impact**: ❌ CRITICAL - Frontend will fail to extract tokens

**Recommendation**:
- Standardize on REST convention: `{token, refreshToken, expiresIn}`
- Update Frontend plan to expect `expiresIn` as seconds from now
- Document: "expiresIn is seconds until expiry, not absolute timestamp"
```

### Step 5: Generate Recommendations

**For each mismatch, provide resolution**:

**Priority 1 - Critical Mismatches** (will cause runtime failure):
- Type mismatches (string vs number)
- Missing required fields
- Incompatible formats (ISO vs Unix timestamps)

**Priority 2 - Semantic Mismatches** (will cause logic errors):
- Duration vs absolute time
- ID format differences (UUID vs int)
- Enum value mismatches

**Priority 3 - Convention Mismatches** (inconsistent but functional):
- Naming conventions (camelCase vs snake_case)
- Field ordering
- Optional field presence

**Resolution strategies**:
1. **Align to standard**: Use REST/industry conventions
2. **Pick dominant pattern**: If 3 domains use camelCase, 1 uses snake_case → align to camelCase
3. **Add adapter**: If domains can't change, add translation layer
4. **Document explicitly**: If intentional difference, document why

## Validation Report Format

```markdown
# CONTRACT VALIDATION REPORT

## Executive Summary
- Total Contracts: {count}
- Validated: {count}
- Mismatches Found: {count}
  - Critical: {count}
  - Semantic: {count}
  - Convention: {count}

## Validation Status

### ✅ Compatible Contracts ({count})
[List contracts that match perfectly]

### ❌ Critical Mismatches ({count})
[Mismatches that will cause runtime failures]

### ⚠️ Semantic Mismatches ({count})
[Mismatches that will cause logic errors]

### ℹ️ Convention Mismatches ({count})
[Inconsistencies that won't break but should be aligned]

## Detailed Findings

### Mismatch 1: [Contract Name]
**Type**: [API/Event/Data/Function]
**Exposed by**: [Domain A]
**Required by**: [Domain B, Domain C]

**Domain A provides**:
```
[Exact contract specification]
```

**Domain B expects**:
```
[Exact contract specification]
```

**Differences**:
1. [Specific difference 1]
2. [Specific difference 2]

**Impact**: [CRITICAL/HIGH/MEDIUM/LOW]
- [Describe what will break]

**Recommendation**:
- [Specific action to align contracts]
- [Who should change: Domain A, Domain B, or both]
- [Updated contract specification]

---

[Repeat for each mismatch]

## Contract Alignment Recommendations

### Immediate Actions Required (Critical):
1. [Action 1] - Update [Domain X] to align [Contract Y]
2. [Action 2] - Standardize [field name] across all domains

### Recommended Improvements (Semantic):
1. [Action 1] - Document semantic difference in [Contract Z]
2. [Action 2] - Align [timestamp format] to ISO8601

### Optional Standardization (Convention):
1. [Action 1] - Adopt camelCase naming convention
2. [Action 2] - Standardize error response format

## Updated Contract Specifications

[For each aligned contract, provide the final agreed specification]

### Contract: POST /api/login
**Final Specification** (aligned):
```json
Request: {
  "email": "string",
  "password": "string"
}

Response: {
  "token": "string",
  "refreshToken": "string",
  "expiresIn": "number"  // seconds until expiry
}

Status Codes:
- 200: Success
- 401: Invalid credentials
- 429: Rate limit exceeded
```

**All domains must implement this exact specification.**

## Validation Summary

- ✅ All critical mismatches have resolution recommendations
- ✅ Semantic differences documented
- ✅ Final contract specifications provided
- ✅ Ready for synthesis phase

**Next Step**: Synthesis agent uses these aligned contracts to create unified blueprint.
```

## Usage in FULL Tier Workflow

### Deployment Point
```
FULL Tier Phase 2 (Synthesis):

1. Multi-domain planning complete (Phase 1)
   ↓
2. Deploy contract-validator subagent
   ↓
3. Subagent validates all contracts
   ↓
4. Returns validation report
   ↓
5. If critical mismatches:
   - Synthesis agent resolves using recommendations
   - Updates domain plans with aligned contracts
   ↓
6. Synthesis proceeds with validated contracts
   ↓
7. Implementation receives clean, compatible contracts
```

### Integration with Synthesis

**Synthesis agent receives**:
- Validation report with all mismatches
- Resolution recommendations
- Aligned contract specifications

**Synthesis agent actions**:
1. Apply contract alignments to plans
2. Document alignment decisions with #PATH_RATIONALE
3. Export aligned contracts via LCL
4. Create unified blueprint with validated contracts

**Result**: Implementation begins with guaranteed-compatible contracts

## Anti-Patterns to Avoid

### Anti-Pattern 1: Ignoring Semantic Differences
❌ "Field names are different but both strings, so it's fine"
✅ Validate semantics: `expiresIn` (duration) vs `expires` (timestamp) are NOT compatible

### Anti-Pattern 2: Assuming Format Compatibility
❌ "Both use timestamps, so compatible"
✅ Verify format: ISO8601 vs Unix timestamps require conversion

### Anti-Pattern 3: Skipping Type Recursion
❌ "Both return objects, so compatible"
✅ Recurse into object fields: inner field types must match

### Anti-Pattern 4: Convention Tolerance
❌ "Naming convention differences don't matter"
✅ Enforce consistency: inconsistent naming causes maintenance issues

## Success Criteria

✅ **All contracts extracted** from domain plans
✅ **All mismatches identified** (critical, semantic, convention)
✅ **Resolution recommendations provided** for each mismatch
✅ **Aligned contract specifications** documented
✅ **Validation report complete** and actionable
✅ **No false positives** (valid differences not flagged as mismatches)
✅ **No false negatives** (real mismatches not missed)

## Example Validation Session

**Input**: 3 domain plans (Auth, Frontend, Database)

**Process**:
1. Extract 8 contracts across all domains
2. Build contract matrix (who exposes/requires)
3. Validate compatibility for all 8 contracts
4. Find 3 critical mismatches, 2 semantic, 1 convention
5. Generate resolution recommendations
6. Provide aligned contract specifications

**Output**: Validation report showing:
- 2 contracts perfectly compatible ✅
- 6 contracts with mismatches ❌
- Recommendations to align all 6
- Final specifications for all 8 contracts

**Value**: Prevents 3 critical integration failures before implementation starts

## Activation

Deploy contract-validator:
- In FULL tier Phase 2 (Synthesis)
- After multi-domain planning complete
- Before synthesis creates unified blueprint
- When 2+ domains have integration contracts

**Not needed for**:
- LIGHT/MEDIUM tiers (single domain or simple multi-file)
- HEAVY tier (complex but single-domain, no cross-domain contracts)
- FULL tier Phase 1 (still planning, contracts not finalized)
