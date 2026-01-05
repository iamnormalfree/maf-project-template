# MAF CI Review Gates (CAN-065)

CI enforcement for Multi-Agent Framework commit policy. Provides automated approval gates based on AI reviewer feedback with escalation detection.

## Quick Start

```bash
# Run gate with JSON file
npm run maf:ci:gate -- --input fixtures/basic-approval.json

# Run gate with stdin input
cat fixtures/high-risk-gpt5-required.json | npm run maf:ci:gate -- --stdin

# Custom escalation threshold (default: 3 review cycles)
ESCALATION_THRESHOLD=2 npm run maf:ci:gate -- --input fixtures/escalation-required.json
```

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | ✅ PASS | Merge allowed |
| 1 | ❌ BLOCKING ISSUES | Fix blocking issues, re-run gate |
| 2 | ❌ GPT-5 REQUIRED | Get GPT-5 review, re-run gate |
| 3 | ❌ INPUT ERROR | Fix input format, re-run gate |

## Input Schema

```json
{
  "taskId": "string",           // Required: CAN task identifier
  "tier": "LIGHT|MEDIUM|HEAVY|FULL",  // Optional: Response-awareness tier
  "risk": "LOW|MEDIUM|HIGH",    // Optional: Risk assessment
  "tier1Files": ["string"],     // Optional: CANONICAL_REFERENCES files modified
  "codex": {                    // Required: Codex review summary
    "issues": number,           // Total issues found
    "blocking": number,         // Blocking issues (must be 0 to pass)
    "notes": ["string"]         // Optional: Review notes
  },
  "gpt5": {                     // Optional: GPT-5 review summary
    "issues": number,
    "blocking": number,
    "notes": ["string"]
  },
  "evidence": [{}],             // Optional: Evidence artifacts
  "reviewCycles": number        // Optional: Override detected cycles
}
```

## Decision Logic

### GPT-5 Requirement

GPT-5 review is required when ANY of:
- `risk === "HIGH"`
- `tier === "HEAVY"` or `tier === "FULL"`
- `tier1Files.length > 0`

### Blocking Computation

**"Blocking" is computed from reviewer summaries:**
- `codex.blocking > 0` → FAIL (code 1)
- `gpt5.blocking > 0` (if required) → FAIL (code 1)
- Missing `codex` summary → FAIL (code 3)
- Required `gpt5` missing → FAIL (code 2)

### Escalation Detection

**Advisory only - never affects pass/fail:**
- Counts previous gate runs from SQLite evidence table
- Recommends escalation when `reviewCycles >= ESCALATION_THRESHOLD`
- Default threshold: 3 review cycles
- Configurable via `ESCALATION_THRESHOLD` environment variable

## Sample Scenarios

### ✅ Basic Approval
```json
{
  "taskId": "CAN-065-basic-approval",
  "tier": "MEDIUM",
  "risk": "LOW",
  "codex": {
    "issues": 2,
    "blocking": 0,
    "notes": ["Minor naming issues"]
  }
}
```
**Output:** `{"success":true,"code":0,"reason":null,"escalationRecommended":false}`

### 🔄 Escalation Recommended
```json
{
  "taskId": "CAN-065-escalation-demo",
  "tier": "HEAVY",
  "risk": "MEDIUM",
  "tier1Files": ["lib/maf/core/coordinator.ts"],
  "codex": {"issues": 5, "blocking": 0},
  "gpt5": {"issues": 3, "blocking": 0},
  "reviewCycles": 3
}
```
**Output:** `{"success":true,"code":0,"reason":null,"escalationRecommended":true,"escalationReason":"Review cycles (3) >= escalation threshold (3)"}`

### ❌ Blocking Issues
```json
{
  "taskId": "CAN-065-blocking-issues",
  "codex": {
    "issues": 3,
    "blocking": 2,
    "notes": ["CRITICAL: Missing authentication check"]
  }
}
```
**Output:** `{"success":false,"code":1,"reason":"codex blocking issues","escalationRecommended":false}`

### ❌ GPT-5 Required
```json
{
  "taskId": "CAN-065-high-risk",
  "tier": "FULL",
  "risk": "HIGH",
  "codex": {"issues": 8, "blocking": 0}
  // Missing gpt5 summary
}
```
**Output:** `{"success":false,"code":2,"reason":"gpt5 review required but missing","escalationRecommended":false}`

## CI Integration

### GitHub Actions

```yaml
name: MAF Review Gate
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Generate reviewer summaries
        run: |
          # Your CI generates reviewer summaries here
          # This would involve running Codex and GPT-5 reviews
          # Output goes to gate-input.json
          
      - name: Run MAF CI Gate
        id: gate
        run: |
          result=$(npm run maf:ci:gate -- --input gate-input.json | jq -r '.success')
          echo "gate_result=$result" >> $GITHUB_OUTPUT
          npm run maf:ci:gate -- --input gate-input.json
          
      - name: Gate Result
        run: |
          if [ "${{ steps.gate.outputs.gate_result }}" != "true" ]; then
            echo "❌ Review gate blocked - see above for details"
            exit 1
          fi
          echo "✅ Review gate passed"
```

### Evidence Collection

The gate automatically writes evidence to SQLite when available:

```sql
-- Evidence stored in evidence table
INSERT INTO evidence(task_id, attempt, verifier, result, details_json)
VALUES ('CAN-065-demo', 0, 'gate', 'PASS', json({
  codex: {...},
  gpt5: {...},
  decision: {
    pass: true,
    code: 0,
    escalationRecommended: false
  }
}));

-- Events logged in events table
INSERT INTO events(task_id, ts, kind, data_json)
VALUES ('CAN-065-demo', 164207..., 'REVIEW_GATE', json({
  code: 0,
  escalationRecommended: false
}));
```

## Integration Guide for Committers

### Staging Branch Workflow

1. **Create staging branch from feature branch**
   ```bash
   git checkout -b staging/CAN-065-implementation
   ```

2. **Run complete review process**
   ```bash
   # Generate reviewer summaries
   npm run maf:review:codex  # Outputs to reviewer-codex.json
   npm run maf:review:gpt5    # Outputs to reviewer-gpt5.json
   
   # Combine into gate input (automated script)
   npm run maf:ci:prepare    # Outputs to gate-input.json
   ```

3. **Run CI gate**
   ```bash
   npm run maf:ci:gate -- --input gate-input.json
   ```

4. **Check results**
   - **Exit code 0**: Merge to main allowed
   - **Exit code 1**: Fix blocking issues, restart from step 2
   - **Exit code 2**: Get GPT-5 review, restart from step 2
   - **Exit code 3**: Fix input format, restart from step 2

5. **Handle escalation recommendations**
   - Gate passes but suggests escalation
   - Optional: Create escalation ticket for human review
   - Decision to merge remains with committer

### Merge Rules

| Gate Result | Merge Allowed | Action Required |
|-------------|---------------|-----------------|
| ✅ PASS (code 0) | Yes | Merge to main |
| ❌ BLOCKING (code 1) | No | Fix blocking issues |
| ❌ GPT-5 MISSING (code 2) | No | Get GPT-5 review |
| ❌ INPUT ERROR (code 3) | No | Fix input format |

**Escalation recommendations are advisory only** - they don't block merging but provide guidance for complex changes.

## Testing

```bash
# Run all gate tests
npm test -- lib/maf/__tests__/ci-gate.test.ts

# Test with sample files
for file in scripts/maf/ci/fixtures/*.json; do
  echo "Testing: $file"
  npm run maf:ci:gate -- --input "$file"
  echo "---"
done
```

## Troubleshooting

### SQLite Errors
- Gate continues without SQLite if `better-sqlite3` not available
- Set `MAF_DB_PATH` environment variable to custom database location
- Evidence collection is optional - gate decisions work without it

### Input Validation
- Missing `taskId` → Exit code 3
- Invalid JSON → Exit code 3
- Missing `codex` summary → Exit code 3

### Performance
- Gate runs in <100ms for typical inputs
- SQLite operations are synchronous but fast
- No external dependencies for decision logic

## Files

- **Gate CLI**: `scripts/maf/ci/review-gates.ts`
- **Unit Tests**: `lib/maf/__tests__/ci-gate.test.ts` (46 tests)
- **Sample Inputs**: `scripts/maf/ci/fixtures/*.json`
- **Package Script**: `npm run maf:ci:gate`
