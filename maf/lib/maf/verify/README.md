# Verification Registry

A minimal verification registry mapping tags to executable checks with evidence capture. Provides a small set of verifiers to gate COMMITTED state on concrete results.

## Overview

The verification registry allows you to run automated checks on your codebase before commits, providing PASS/FAIL results with detailed evidence for audit trails. Each verifier is identified by a tag and can be configured to run specific validation logic.

## Available Verifiers

### `uncertainty:high:code`

Runs the test suite to ensure code quality.

**Purpose**: Validate that all existing tests pass
**Result**:
- PASS: All tests succeed
- FAIL: Tests fail with exit code and error details

**Usage**:
```typescript
const result = await runVerifications(['uncertainty:high:code'], {
  workdir: '/path/to/project',
  payload: {}
});
```

**Example Response**:
```json
{
  "pass": true,
  "results": [
    {
      "tag": "uncertainty:high:code",
      "result": "PASS",
      "details": {
        "tests": "ok"
      }
    }
  ]
}
```

### `assumption:api`

Validates that API documentation is present for changes.

**Purpose**: Ensure API changes include documentation
**Parameters**: Requires `payload.apiDocSnippet` to be truthy
**Result**:
- PASS: Documentation snippet is present
- FAIL: Documentation snippet is missing

**Usage**:
```typescript
const result = await runVerifications(['assumption:api'], {
  workdir: '/path/to/project',
  payload: {
    apiDocSnippet: 'POST /api/users - Creates a new user...'
  }
});
```

**Example Response**:
```json
{
  "pass": true,
  "results": [
    {
      "tag": "assumption:api",
      "result": "PASS",
      "details": {
        "doc": "present"
      }
    }
  ]
}
```

### `coverage:git-diff`

Analyzes git diff to validate test coverage for source code changes.

**Purpose**: Ensure source file changes have corresponding test changes
**Analysis**:
- Identifies changed source files (`.ts`, `.js`, `.tsx`, `.jsx`)
- Tracks test file changes (`.test.ts`, `.spec.ts`, `__tests__/`)
- Validates coverage gaps (source changes without test coverage)
- Ignores configuration files, documentation, and other non-source files

**Supported Test Patterns**:
- `src/file.test.ts` → `src/file.ts`
- `src/file.spec.ts` → `src/file.ts`
- `src/__tests__/file.test.ts` → `src/file.ts`
- `src/utils/__tests__/util.test.ts` → `src/utils/util.ts`
- `tests/file.test.ts` → `src/file.ts`

**Result**:
- PASS: All source files have corresponding test changes
- FAIL: Source files changed without test coverage

**Usage**:
```typescript
const result = await runVerifications(['coverage:git-diff'], {
  workdir: '/path/to/project',
  payload: {}
});
```

**Example PASS Response**:
```json
{
  "pass": true,
  "results": [
    {
      "tag": "coverage:git-diff",
      "result": "PASS",
      "details": {
        "timestamp": "2025-11-13T10:30:00.000Z",
        "workdir": "/path/to/project",
        "summary": "Test coverage verification PASSED: 2 source file(s) have test coverage",
        "sourceFiles": ["src/calculator.ts", "src/utils.ts"],
        "testFiles": ["src/calculator.test.ts", "src/utils.test.ts"],
        "ignoredFiles": ["README.md", "package.json"],
        "coverageGaps": []
      }
    }
  ]
}
```

**Example FAIL Response**:
```json
{
  "pass": false,
  "results": [
    {
      "tag": "coverage:git-diff",
      "result": "FAIL",
      "details": {
        "timestamp": "2025-11-13T10:30:00.000Z",
        "workdir": "/path/to/project",
        "summary": "Test coverage verification FAILED: 1 source file(s) without corresponding test changes",
        "sourceFiles": ["src/service.ts"],
        "testFiles": [],
        "ignoredFiles": [],
        "coverageGaps": ["src/service.ts"]
      }
    }
  ]
}
```

## API Reference

### `runVerifications(tags, context)`

Run multiple verifiers and return overall results.

**Parameters**:
- `tags`: Array of verifier tags to run
- `context`: Object containing:
  - `workdir`: Working directory path for git operations
  - `payload`: Arbitrary data passed to verifiers

**Returns**: Promise resolving to:
```typescript
{
  pass: boolean; // true if all verifiers pass
  results: Array<{
    tag: string;
    result: 'PASS' | 'FAIL';
    details: any; // Verifier-specific details
  }>;
}
```

## Implementation Examples

### Multiple Verifiers

```typescript
import { runVerifications } from '@/lib/maf/verify/registry';

async function verifyBeforeCommit() {
  const result = await runVerifications(
    ['uncertainty:high:code', 'coverage:git-diff', 'assumption:api'],
    {
      workdir: process.cwd(),
      payload: {
        apiDocSnippet: getApiDocumentation()
      }
    }
  );

  if (!result.pass) {
    console.error('Verification failed:');
    result.results
      .filter(r => r.result === 'FAIL')
      .forEach(r => {
        console.error(`- ${r.tag}: ${r.details.summary}`);
      });
    process.exit(1);
  }

  console.log('All verifications passed!');
  return result;
}
```

### Custom Git Diff Analysis

```typescript
import { analyzeGitDiff } from '@/lib/maf/verify/registry';

async function getCoverageReport() {
  try {
    const analysis = analyzeGitDiff(process.cwd());

    console.log(`Source files changed: ${analysis.sourceFiles.length}`);
    console.log(`Test files changed: ${analysis.testFiles.length}`);
    console.log(`Coverage gaps: ${analysis.coverageGaps.length}`);

    if (analysis.coverageGaps.length > 0) {
      console.log('\nMissing test coverage for:');
      analysis.coverageGaps.forEach(file => console.log(`  - ${file}`));
    }

    return analysis;
  } catch (error) {
    console.error('Git analysis failed:', error.message);
  }
}
```

### Integration with CI/CD

```yaml
# .github/workflows/verify.yml
name: Verify Changes
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run verify
        env:
          API_DOC_SNIPPET: ${{ steps.docs.outputs.content }}
```

```javascript
// scripts/verify.js
import { runVerifications } from '@/lib/maf/verify/registry';

const result = await runVerifications(
  ['uncertainty:high:code', 'coverage:git-diff'],
  {
    workdir: process.cwd(),
    payload: {}
  }
);

process.exit(result.pass ? 0 : 1);
```

## File Classification Rules

### Source Files
- File extensions: `.ts`, `.js`, `.tsx`, `.jsx`
- Excludes test files (identified by patterns below)
- Excludes configuration files (`.config`, `.d.ts`)
- Excludes documentation (`.md`)
- Excludes build files (`package.json`)
- Excludes `node_modules`, `.git`, `docs/`, `scripts/`

### Test Files
- Filename patterns: `*.test.ts`, `*.test.js`, `*.spec.ts`, `*.spec.js`
- Directory patterns: `__tests__/`, `/tests/`
- Supports nested test directories

### Ignored Files
- Configuration files: `tsconfig.json`, `jest.config.js`, etc.
- Documentation: `README.md`, `CHANGELOG.md`
- Build files: `package.json`, `yarn.lock`, `pnpm-lock.yaml`
- Other non-source content

## Error Handling

All verifiers include comprehensive error handling:

1. **Git Command Failures**: Wrapped with try-catch, returns FAIL with error details
2. **Missing Dependencies**: Graceful degradation when external tools unavailable
3. **Invalid Inputs**: Proper validation and clear error messages
4. **Unexpected Errors**: Always return FAIL rather than throwing

## Extending the Registry

To add a new verifier:

```typescript
import type { Verifier } from './registry';

const customVerifier: Verifier = async ({ workdir, payload }) => {
  // Your verification logic here
  try {
    const result = await performCustomCheck(workdir, payload);

    return {
      result: result.isValid ? 'PASS' : 'FAIL',
      details: {
        timestamp: new Date().toISOString(),
        workdir,
        ...result.details
      }
    };
  } catch (error: any) {
    return {
      result: 'FAIL',
      details: {
        timestamp: new Date().toISOString(),
        workdir,
        error: error.message,
        summary: `Custom verification failed: ${error.message}`
      }
    };
  }
};

// Register the verifier
registry.set('custom:check', customVerifier);
```

## Best Practices

1. **Consistent Error Format**: Include timestamp, workdir, and error summary
2. **Evidence Capture**: Provide detailed information for audit trails
3. **Idempotent Operations**: Verifiers should not modify files
4. **Performance**: Minimize external command execution
5. **Clear Messages**: Use descriptive summaries for PASS/FAIL results

## Testing

The verification registry includes comprehensive tests covering:
- All verifier PASS/FAIL scenarios
- Edge cases and error conditions
- Multiple verifier combinations
- Git diff analysis with various file patterns
- Mock external dependencies for reliable testing

Run tests with:
```bash
npm test -- lib/maf/verify/__tests__/registry.test.ts
```