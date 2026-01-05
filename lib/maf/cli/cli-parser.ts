// ABOUTME: CLI argument parsing and utilities for MAF coordinator helper with emoji indicators and structured output.
// ABOUTME: Provides comprehensive argument parsing, output formatting, and error handling for task claiming operations.

import type { ClaimTaskResult } from './cli-service';

/**
 * Command-line arguments interface for claim-task operation
 */
export interface ClaimTaskCliArgs {
  /** Agent ID requesting the task (can come from --agent or MAF_AGENT_ID env var) */
  agentId?: string;
  /** Optional constraint filters to limit task selection */
  labelFilters?: string[];
  /** Simulate claiming without actually acquiring leases */
  dryRun: boolean;
  /** Path to release file for batch operations */
  releaseFile?: string;
  /** Output results in JSON format for automation */
  json: boolean;
  /** Enable verbose logging output */
  verbose: boolean;
  /** Show help information */
  help: boolean;
}

/**
 * Parsed command and arguments for CLI routing
 */
export interface ParsedCliCommand {
  /** The command to execute (e.g., 'claim-task', 'list-tasks') */
  command: string;
  /** Remaining arguments after the command */
  args: string[];
}

/**
 * Exit codes for different scenarios
 */
export const EXIT_CODES: Record<string, number> = {
  SUCCESS: 0,
  ERROR: 1,
  NO_TASKS_AVAILABLE: 2,
  INVALID_ARGUMENTS: 3,
  LEASE_CONFLICTS: 4,
  QUOTA_EXCEEDED: 6
};

/**
 * Emoji indicators for consistent output formatting
 */
export const EMOJI = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  SEARCH: '🔍',
  TARGET: '🎯',
  FILES: '📁',
  LOCK: '🔒',
  CLOCK: '⏰',
  SUMMARY: '📊',
  ROCKET: '🚀',
  HEALTH: '🏥'
} as const;

/**
 * Parse command-line arguments for claim-task operation
 * Supports both --flag=value and --flag value formats
 */
export function parseClaimTaskArgs(argv: string[]): ClaimTaskCliArgs {
  const args: ClaimTaskCliArgs = {
    dryRun: false,
    json: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // Handle --flag=value format
    if (arg.startsWith('--') && arg.includes('=')) {
      const [flag, value] = arg.slice(2).split('=', 2);
      setArgValue(args, flag, value);
      continue;
    }

    // Handle --flag value format
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);

      // Check if this flag has a value (next arg doesn't start with --)
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        const value = argv[i + 1];
        setArgValue(args, flag, value);
        i++; // Skip the value we just consumed
      } else {
        // Flag without value (boolean)
        setArgValue(args, flag, 'true');
      }
      continue;
    }

    // Positional arguments (label filters)
    if (!arg.startsWith('-')) {
      if (!args.labelFilters) {
        args.labelFilters = [];
      }
      args.labelFilters.push(arg);
    }
  }

  // Check environment variable fallback for agent ID
  if (!args.agentId && process.env.MAF_AGENT_ID) {
    args.agentId = process.env.MAF_AGENT_ID;
  }

  return args;
}

/**
 * Set argument value based on flag name
 */
function setArgValue(args: ClaimTaskCliArgs, flag: string, value: string): void {
  switch (flag) {
    case 'agent':
    case 'agent-id':
      args.agentId = value;
      break;

    case 'label':
    case 'filter':
    case 'constraint':
      if (!args.labelFilters) {
        args.labelFilters = [];
      }
      args.labelFilters.push(value);
      break;

    case 'dry-run':
    case 'dryrun':
      args.dryRun = value === 'true' || value === '';
      break;

    case 'release':
    case 'release-file':
      args.releaseFile = value;
      break;

    case 'json':
      args.json = value === 'true' || value === '';
      break;

    case 'verbose':
    case 'v':
      args.verbose = value === 'true' || value === '';
      break;

    case 'help':
    case 'h':
      args.help = value === 'true' || value === '';
      break;

    default:
      throw new Error(`Unknown flag: --${flag}`);
  }
}

/**
 * Parse CLI command and remaining arguments
 */
export function parseCliCommand(argv: string[]): ParsedCliCommand {
  const command = argv[0] || 'help';
  const args = argv.slice(1);
  return { command, args };
}

/**
 * Validate and require agent ID, throwing helpful error if missing
 */
export function requireAgentId(agentId?: string): string {
  if (!agentId) {
    const errorMessage = [
      `${EMOJI.ERROR} Agent ID is required`,
      '',
      'Please specify an agent ID using one of:',
      '  • --agent <agent-id> command line flag',
      '  • MAF_AGENT_ID environment variable',
      '',
      'Examples:',
      '  npm run maf:claim-task -- --agent claude-pair-1',
      '  MAF_AGENT_ID=claude-pair-1 npm run maf:claim-task',
      '',
      'Available agents (check your configuration):',
      '  • claude-pair-1 (Frontend specialist)',
      '  • claude-pair-2 (Backend specialist)',
      '  • claude-backend (Backend infrastructure)',
      ''
    ].join('\n');

    throw new MafCliArgumentError(errorMessage, 'MISSING_AGENT_ID');
  }

  return agentId;
}

/**
 * Format output based on --json flag and operation result
 */
export function formatOutput(result: ClaimTaskResult, options: ClaimTaskCliArgs): void {
  if (options.json) {
    // JSON mode for automation/CI
    const jsonOutput = {
      success: result.success,
      message: result.message,
      claimed: result.task ? {
        id: result.task.beadId,
        title: result.task.title,
        assigned_to: result.task.assignedAgent,
        constraint: result.task.constraint,
        files: result.task.files || []
      } : null,
      lease_conflicts: result.leaseConflicts || [],
      held_leases: result.heldLeases || [],
      ready_tasks: result.readyTasks?.map(task => ({
        id: task.beadId,
        title: task.title,
        constraint: task.constraint,
        files: task.files || []
      })) || []
    };

    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Human-readable agent-optimized format with emoji indicators
  console.log(`${EMOJI.SEARCH} MAF Task Coordinator`);
  console.log('======================');
  console.log('');

  if (result.success && result.task) {
    // Task claimed successfully
    console.log(`${EMOJI.SUCCESS} Task Claimed: ${result.task.beadId} - "${result.task.title}"`);
    console.log(`${EMOJI.TARGET} Assigned to: ${result.task.assignedAgent}`);

    if (result.task.files && result.task.files.length > 0) {
      console.log(`${EMOJI.FILES} Files Leased: ${result.task.files.join(', ')}`);
    }

    if (result.heldLeases && result.heldLeases.length > 0) {
      const expiryTime = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      console.log(`${EMOJI.CLOCK} Leases Expire: ${expiryTime}`);
    }

    console.log('');

    // Show lease conflicts if any
    if (result.leaseConflicts && result.leaseConflicts.length > 0) {
      console.log(`${EMOJI.LOCK} Lease Conflicts: ${result.leaseConflicts.length} file${result.leaseConflicts.length === 1 ? '' : 's'}`);
      result.leaseConflicts.forEach(conflict => {
        const expiryInfo = conflict.expiresAt
          ? ` until ${new Date(conflict.expiresAt).toISOString().replace('T', ' ').slice(0, 19)}Z`
          : '';
        const agentInfo = conflict.holdingAgent
          ? ` - Held by ${conflict.holdingAgent}${expiryInfo}`
          : '';
        console.log(`   • ${conflict.file}${agentInfo}`);
      });
      console.log('');
    }
  } else if (!result.success) {
    // No task claimed
    console.log(`${EMOJI.WARNING} No Task Claimed`);
    console.log(`Message: ${result.message}`);
    console.log('');

    // Show ready tasks if available
    if (result.readyTasks && result.readyTasks.length > 0) {
      console.log(`${EMOJI.INFO} Ready Tasks (${result.readyTasks.length}):`);
      result.readyTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.beadId} - "${task.title}" (${task.constraint})`);
      });
      console.log('');
    }
  }

  // Verbose information
  if (options.verbose) {
    console.log(`${EMOJI.SUMMARY} Debug Information:`);
    console.log(`  • Success: ${result.success}`);
    console.log(`  • Message: ${result.message}`);
    console.log(`  • Held Leases: ${result.heldLeases?.length || 0}`);
    console.log(`  • Lease Conflicts: ${result.leaseConflicts?.length || 0}`);
    console.log(`  • Ready Tasks: ${result.readyTasks?.length || 0}`);
    console.log('');
  }
}

/**
 * Show usage/help information
 */
export function showUsage(command: string = 'claim-task'): void {
  const usage = [
    `${EMOJI.ROCKET} MAF Task Coordinator - ${command}`,
    '================================',
    '',
    'USAGE:',
    `  npm run maf:${command} -- [options] [filters...]`,
    '',
    'OPTIONS:',
    '  --agent <id>          Agent ID requesting the task',
    '  --label <filter>      Constraint filter (can be used multiple times)',
    '  --dry-run             Simulate claiming without acquiring leases',
    '  --release <file>      Path to release file for batch operations',
    '  --json                Output results in JSON format',
    '  --verbose, -v         Enable verbose logging',
    '  --help, -h            Show this help message',
    '',
    'ENVIRONMENT VARIABLES:',
    '  MAF_AGENT_ID          Default agent ID (falls back from --agent)',
    '',
    'EXAMPLES:',
    '  # Claim next available task',
    '  npm run maf:claim-task -- --agent claude-pair-1',
    '',
    '  # Dry run to see available tasks',
    '  npm run maf:claim-task -- --agent claude-pair-1 --dry-run',
    '',
    '  # Filter by constraint',
    '  npm run maf:claim-task -- --agent claude-pair-1 --label constraint-a',
    '',
    '  # JSON output for automation',
    '  npm run maf:claim-task -- --agent claude-pair-1 --json',
    '',
    'EXIT CODES:',
    `  ${EXIT_CODES.SUCCESS}  Success`,
    `  ${EXIT_CODES.ERROR}  General error`,
    `  ${EXIT_CODES.NO_TASKS_AVAILABLE}  No tasks available`,
    `  ${EXIT_CODES.INVALID_ARGUMENTS}  Invalid arguments`,
    `  ${EXIT_CODES.LEASE_CONFLICTS}  Lease conflicts detected`,
    `  ${EXIT_CODES.QUOTA_EXCEEDED}  Quota limits exceeded`,
    ''
  ];

  console.log(usage.join('\n'));
}

/**
 * Handle errors with structured output and appropriate exit codes
 */
export function handleError(error: Error, options: ClaimTaskCliArgs): never {
  if (options.json) {
    // JSON error mode for automation
    const jsonError = {
      success: false,
      error: {
        name: error.name,
        message: error.message,
        code: error instanceof MafCliError ? error.code : 'UNKNOWN_ERROR'
      }
    };

    console.error(JSON.stringify(jsonError, null, 2));
  } else {
    // Human-readable error messages
    if (error instanceof MafCliArgumentError) {
      console.error(error.message);
      showUsage();
    } else if (error instanceof MafCliNoTasksError) {
      console.error(`${EMOJI.WARNING} ${error.message}`);
      console.log('');
      console.log('Suggestions:');
      console.log('  • Use --dry-run to see available tasks');
      console.log('  • Check if all tasks are already assigned');
      console.log('  • Verify constraint filters match available tasks');
    } else if (error instanceof MafCliLeaseError) {
      console.error(`${EMOJI.LOCK} ${error.message}`);
      console.log('');
      console.log('Suggestions:');
      console.log('  • Wait for existing leases to expire');
      console.log('  • Contact agents holding conflicting leases');
      console.log('  • Use --dry-run to check availability');
    } else {
      console.error(`${EMOJI.ERROR} Unexpected error: ${error.message}`);
      if (options.verbose) {
        console.error('');
        console.error('Stack trace:');
        console.error(error.stack);
      }
    }
  }

  // Determine appropriate exit code
  let exitCode = EXIT_CODES.ERROR;

  if (error instanceof MafCliError) {
    switch (error.code) {
      case 'MISSING_AGENT_ID':
      case 'INVALID_ARGUMENTS':
        exitCode = EXIT_CODES.INVALID_ARGUMENTS;
        break;
      case 'NO_TASKS_AVAILABLE':
        exitCode = EXIT_CODES.NO_TASKS_AVAILABLE;
        break;
      case 'LEASE_CONFLICTS':
        exitCode = EXIT_CODES.LEASE_CONFLICTS;
        break;
      default:
        exitCode = EXIT_CODES.ERROR;
    }
  }

  process.exit(exitCode);
}

/**
 * Custom error types for CLI operations
 */
export class MafCliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MafCliError';
  }
}

/**
 * Error for missing or invalid arguments
 */
export class MafCliArgumentError extends MafCliError {
  constructor(message: string, code: string = 'INVALID_ARGUMENTS') {
    super(message, code);
    this.name = 'MafCliArgumentError';
  }
}

/**
 * Error for no available tasks
 */
export class MafCliNoTasksError extends MafCliError {
  constructor(message: string = 'No tasks are currently available for claiming') {
    super(message, 'NO_TASKS_AVAILABLE');
    this.name = 'MafCliNoTasksError';
  }
}

/**
 * Error for lease conflicts
 */
export class MafCliLeaseError extends MafCliError {
  constructor(message: string) {
    super(message, 'LEASE_CONFLICTS');
    this.name = 'MafCliLeaseError';
  }
}

/**
 * Validate argument combinations and throw appropriate errors
 */
export function validateArgs(args: ClaimTaskCliArgs): void {
  // Help flag takes precedence
  if (args.help) {
    return;
  }

  // Require agent ID for non-help operations
  try {
    requireAgentId(args.agentId);
  } catch (error) {
    throw error;
  }

  // Validate label filters if provided
  if (args.labelFilters && args.labelFilters.length > 0) {
    for (const filter of args.labelFilters) {
      if (!filter || filter.trim().length === 0) {
        throw new MafCliArgumentError('Label filters cannot be empty strings');
      }
    }
  }

  // Validate release file if provided
  if (args.releaseFile !== undefined && args.releaseFile.trim().length === 0) {
    throw new MafCliArgumentError('Release file path cannot be empty');
  }
}

/**
 * Log verbose message if verbose mode is enabled
 */
export function verboseLog(message: string, options: ClaimTaskCliArgs): void {
  if (options.verbose) {
    console.error(`${EMOJI.INFO} ${message}`);
  }
}