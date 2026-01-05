# MAF Task Coordinator CLI

## Overview

The MAF Task Coordinator CLI provides a comprehensive interface for task claiming and lease management in the Multi-Agent Framework. This tool integrates with beads for task discovery and agent mail for lease coordination.

## Installation

The CLI script is located at `scripts/maf/claim-task.ts` and is available via npm script:

```bash
npm run maf:claim-task -- [options]
```

## Usage Examples

### Basic Task Claiming
```bash
# Claim next available task
npm run maf:claim-task -- --agent claude-pair-1

# Use environment variable for agent ID
MAF_AGENT_ID=claude-pair-1 npm run maf:claim-task

# Filter by constraint
npm run maf:claim-task -- --agent claude-pair-1 --label constraint-a
```

### Dry Run Mode
```bash
# See available tasks without claiming
npm run maf:claim-task -- --agent claude-pair-1 --dry-run

# Dry run with JSON output
npm run maf:claim-task -- --agent claude-pair-1 --dry-run --json
```

### JSON Output for Automation
```bash
# Get structured JSON output
npm run maf:claim-task -- --agent claude-pair-1 --json
```

### Release Operations
```bash
# Release lease from file
npm run maf:claim-task -- --release release-info.json
```

## Command Options

| Option | Description |
|--------|-------------|
| `--agent <id>` | Agent ID requesting the task |
| `--label <filter>` | Constraint filter (can be used multiple times) |
| `--dry-run` | Simulate claiming without acquiring leases |
| `--release <file>` | Path to release file for batch operations |
| `--json` | Output results in JSON format |
| `--verbose, -v` | Enable verbose logging |
| `--help, -h` | Show help message |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MAF_AGENT_ID` | Default agent ID (falls back from --agent) |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | No tasks available |
| `3` | Invalid arguments |
| `4` | Lease conflicts detected |

## Release File Format

For lease release operations, create a JSON file with the following format:

```json
{
  "agentId": "claude-pair-1",
  "filePath": "path/to/file",
  "reason": "Release reason (optional)"
}
```

## Integration Points

The CLI script integrates with:

- **MAF CLI Service** (`lib/maf/cli/cli-service.ts`) - Core business logic
- **MAF CLI Parser** (`lib/maf/cli/cli-parser.ts`) - Argument parsing and validation
- **Runtime State** (`lib/maf/core/runtime-state.ts`) - File-based persistence
- **MAF Coordinator** (`lib/maf/core/coordinator.ts`) - High-level coordination
- **Beads CLI** (`lib/maf/beads/cli.ts`) - Task discovery and assignment

## Error Handling

The CLI provides comprehensive error handling with:

- Structured error messages
- Appropriate exit codes for automation
- Verbose logging for debugging
- JSON error output for integration

## Architecture

```
CLI Entry Point (claim-task.ts)
    ↓
CLI Parser (parseClaimTaskArgs)
    ↓
Validation (validateArgs, requireAgentId)
    ↓
CLI Service (createMafCliService)
    ↓
MAF Coordinator + Runtime State + Beads
    ↓
Formatted Output (formatOutput)
```

## Development

To extend the CLI:

1. Add new options to `ClaimTaskCliArgs` interface in `cli-parser.ts`
2. Update argument parsing in `parseClaimTaskArgs` function
3. Implement new operations in `MafCliService` class
4. Add new command handling in `main()` function
5. Update help text and examples

## Testing

The CLI has been tested with various scenarios:

- ✅ Help display
- ✅ Agent ID validation
- ✅ Environment variable fallback
- ✅ Dry run functionality
- ✅ JSON output formatting
- ✅ Constraint filtering
- ✅ Release operations
- ✅ Error handling for missing files
- ✅ Proper exit codes

## Production Usage

For production use:

1. Configure agent IDs in your deployment environment
2. Set up proper file permissions for `.agent-mail` directory
3. Configure beads integration with your task repository
4. Use JSON output for CI/CD automation
5. Monitor exit codes for proper error handling