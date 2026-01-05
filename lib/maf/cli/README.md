# MAF CLI Parser Implementation

## Overview

The CLI parser (`cli-parser.ts`) provides comprehensive command-line argument parsing and utilities for the MAF (Multi-Agent Framework) coordinator helper. It implements robust argument parsing, structured output formatting, and comprehensive error handling with emoji indicators for enhanced user experience.

## Features

### 🎯 Core Functionality
- **Argument Parsing**: Supports both `--flag=value` and `--flag value` formats
- **Environment Variable Fallback**: Uses `MAF_AGENT_ID` environment variable when agent ID not provided
- **Label Filters**: Multiple constraint filters for task selection
- **Validation**: Comprehensive argument validation with helpful error messages
- **Help System**: Built-in help with usage examples and exit codes

### 📊 Output Formats
- **Human-Readable**: Agent-optimized output with emoji indicators
- **JSON Mode**: Machine-readable output for automation/CI
- **Verbose Mode**: Detailed debugging information
- **Structured**: Clear separation of success, errors, and conflicts

### 🛡️ Error Handling
- **Custom Error Types**: Specific error classes for different scenarios
- **Structured Errors**: JSON error mode for automation
- **Exit Codes**: Proper exit codes (0, 1, 2, 3, 4) for different scenarios
- **Helpful Messages**: User-friendly error messages with suggestions

## Interfaces

### ClaimTaskCliArgs
```typescript
interface ClaimTaskCliArgs {
  agentId?: string;        // Agent ID (from --agent or MAF_AGENT_ID)
  labelFilters?: string[]; // Constraint filters for task selection
  dryRun: boolean;         // Simulate claiming without acquiring leases
  releaseFile?: string;    // Release file for batch operations
  json: boolean;           // JSON output mode
  verbose: boolean;        // Verbose logging
  help: boolean;           // Show help information
}
```

### ClaimTaskResult
```typescript
interface ClaimTaskResult {
  success: boolean;
  task?: MafTaskSummary;
  heldLeases?: string[];
  leaseConflicts?: LeaseConflict[];
  readyTasks?: MafTaskSummary[];
  message: string;
}
```

## Usage Examples

### Basic Task Claiming
```bash
# Claim next available task
npm run maf:claim-task -- --agent claude-pair-1

# With constraint filter
npm run maf:claim-task -- --agent claude-pair-1 --label constraint-a

# Multiple filters
npm run maf:claim-task -- --agent claude-pair-1 --label constraint-a --label urgent

# Dry run to see available tasks
npm run maf:claim-task -- --agent claude-pair-1 --dry-run
```

### Environment Variable Usage
```bash
# Set environment variable
export MAF_AGENT_ID=claude-pair-1

# Use without --agent flag
npm run maf:claim-task -- --label constraint-a
```

### Output Formats
```bash
# Human-readable (default)
npm run maf:claim-task -- --agent claude-pair-1

# JSON output for automation
npm run maf:claim-task -- --agent claude-pair-1 --json

# Verbose output with debugging
npm run maf:claim-task -- --agent claude-pair-1 --verbose
```

## Output Examples

### Human-Readable Output
```
🔍 MAF Task Coordinator
======================

✅ Task Claimed: BD-001 - "Implement constraint validation"
🎯 Assigned to: claude-pair-1
📁 Files Leased: lib/constraint.ts, tests/constraint.test.ts
⏰ Leases Expire: 2025-11-11T19:30:00Z

🔒 Lease Conflicts: 1 file
   • lib/shared.ts - Held by claude-backend until 2025-11-11T17:45:00Z
```

### JSON Output
```json
{
  "success": true,
  "message": "Task claimed successfully with 2 file leases.",
  "claimed": {
    "id": "BD-001",
    "title": "Implement constraint validation",
    "assigned_to": "claude-pair-1",
    "constraint": "constraint-a",
    "files": ["lib/constraint.ts", "tests/constraint.test.ts"]
  },
  "lease_conflicts": [
    {
      "file": "lib/shared.ts",
      "reason": "already leased by claude-backend",
      "holding_agent": "claude-backend",
      "expires_at": 1731369900000
    }
  ],
  "held_leases": ["lib/constraint.ts", "tests/constraint.test.ts"],
  "ready_tasks": []
}
```

## Error Handling

### Exit Codes
- `0` (SUCCESS): Operation completed successfully
- `1` (ERROR): General error occurred
- `2` (NO_TASKS_AVAILABLE): No tasks available for claiming
- `3` (INVALID_ARGUMENTS): Invalid command-line arguments
- `4` (LEASE_CONFLICTS): Lease conflicts detected

### Error Types
- `MafCliError`: Base error class with code and details
- `MafCliArgumentError`: Invalid command-line arguments
- `MafCliNoTasksError`: No tasks available
- `MafCliLeaseError`: Lease conflicts detected

### Example Error Messages
```
❌ Agent ID is required

Please specify an agent ID using one of:
  • --agent <agent-id> command line flag
  • MAF_AGENT_ID environment variable

Examples:
  npm run maf:claim-task -- --agent claude-pair-1
  MAF_AGENT_ID=claude-pair-1 npm run maf:claim-task
```

## API Reference

### Core Functions
- `parseClaimTaskArgs(argv: string[]): ClaimTaskCliArgs`
- `validateArgs(args: ClaimTaskCliArgs): void`
- `requireAgentId(agentId?: string): string`
- `formatOutput(result: ClaimTaskResult, options: ClaimTaskCliArgs): void`
- `handleError(error: Error, options: ClaimTaskCliArgs): never`
- `showUsage(command?: string): void`

### Utilities
- `parseCliCommand(argv: string[]): ParsedCliCommand`
- `verboseLog(message: string, options: ClaimTaskCliArgs): void`

### Constants
- `EXIT_CODES`: Exit code mappings
- `EMOJI`: Emoji indicators for output

## Testing

Run the comprehensive test suite:
```bash
npm test -- --testPathPatterns=cli-parser.test.ts
```

The test suite covers:
- Argument parsing for all flag formats
- Environment variable fallback
- Validation logic
- Output formatting (human and JSON)
- Error handling and exit codes
- Custom error types

## Integration

The CLI parser is designed to work seamlessly with the MAF CLI service:

```typescript
import {
  parseClaimTaskArgs,
  validateArgs,
  formatOutput,
  handleError,
  createMafCliService
} from './cli';

// Parse arguments
const args = parseClaimTaskArgs(process.argv.slice(2));

// Validate arguments
validateArgs(args);

// Create service and claim task
const service = createMafCliService(config);
const result = await service.claimTask({
  agentId: args.agentId!,
  labelFilters: args.labelFilters,
  dryRun: args.dryRun
});

// Format and display results
formatOutput(result, args);
```

## Files

- `cli-parser.ts`: Main CLI parser implementation
- `cli-parser.test.ts`: Comprehensive test suite
- `example-usage.mjs`: Usage examples and demos
- `README.md`: This documentation file

## Design Principles

1. **Developer Experience**: Emoji indicators, clear error messages, helpful suggestions
2. **Automation Support**: JSON output mode, structured error codes, verbose logging
3. **Robustness**: Comprehensive validation, graceful error handling
4. **Consistency**: Follows existing script patterns in the codebase
5. **Flexibility**: Multiple argument formats, environment variable fallbacks

The CLI parser provides a production-ready foundation for MAF task claiming operations with excellent developer experience and automation support.