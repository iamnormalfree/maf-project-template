// ABOUTME: Unit tests for CLI argument parsing and utilities for MAF coordinator helper.

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  parseClaimTaskArgs,
  requireAgentId,
  formatOutput,
  parseCliCommand,
  validateArgs,
  EXIT_CODES,
  EMOJI,
  ClaimTaskCliArgs,
  MafCliArgumentError,
  MafCliNoTasksError,
  MafCliLeaseError,
  MafCliError,
  type ClaimTaskResult
} from './cli-parser';

describe('parseClaimTaskArgs', () => {
  beforeEach(() => {
    // Clear environment variable
    delete process.env.MAF_AGENT_ID;
  });

  it('should parse empty arguments', () => {
    const args = parseClaimTaskArgs([]);
    expect(args).toEqual({
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    });
  });

  it('should parse --agent flag', () => {
    const args = parseClaimTaskArgs(['--agent', 'claude-pair-1']);
    expect(args.agentId).toBe('claude-pair-1');
  });

  it('should parse --agent=value format', () => {
    const args = parseClaimTaskArgs(['--agent=claude-pair-1']);
    expect(args.agentId).toBe('claude-pair-1');
  });

  it('should parse boolean flags', () => {
    const args = parseClaimTaskArgs(['--dry-run', '--json', '--verbose']);
    expect(args.dryRun).toBe(true);
    expect(args.json).toBe(true);
    expect(args.verbose).toBe(true);
  });

  it('should parse label filters', () => {
    const args = parseClaimTaskArgs(['--label', 'constraint-a', '--label', 'constraint-b']);
    expect(args.labelFilters).toEqual(['constraint-a', 'constraint-b']);
  });

  it('should parse positional arguments as label filters', () => {
    const args = parseClaimTaskArgs(['constraint-a', 'constraint-b']);
    expect(args.labelFilters).toEqual(['constraint-a', 'constraint-b']);
  });

  it('should use environment variable for agent ID', () => {
    process.env.MAF_AGENT_ID = 'claude-backend';
    const args = parseClaimTaskArgs([]);
    expect(args.agentId).toBe('claude-backend');
  });

  it('should prefer command line flag over environment variable', () => {
    process.env.MAF_AGENT_ID = 'claude-backend';
    const args = parseClaimTaskArgs(['--agent', 'claude-pair-1']);
    expect(args.agentId).toBe('claude-pair-1');
  });

  it('should parse release file', () => {
    const args = parseClaimTaskArgs(['--release', '/path/to/release.json']);
    expect(args.releaseFile).toBe('/path/to/release.json');
  });

  it('should throw error for unknown flag', () => {
    expect(() => {
      parseClaimTaskArgs(['--unknown-flag']);
    }).toThrow('Unknown flag: --unknown-flag');
  });
});

describe('parseCliCommand', () => {
  it('should parse command and arguments', () => {
    const result = parseCliCommand(['claim-task', '--agent', 'test', '--dry-run']);
    expect(result.command).toBe('claim-task');
    expect(result.args).toEqual(['--agent', 'test', '--dry-run']);
  });

  it('should handle empty input', () => {
    const result = parseCliCommand([]);
    expect(result.command).toBe('help');
    expect(result.args).toEqual([]);
  });
});

describe('requireAgentId', () => {
  it('should return valid agent ID', () => {
    const agentId = requireAgentId('claude-pair-1');
    expect(agentId).toBe('claude-pair-1');
  });

  it('should throw error for missing agent ID', () => {
    expect(() => {
      requireAgentId();
    }).toThrow(MafCliArgumentError);
  });

  it('should throw error for empty agent ID', () => {
    expect(() => {
      requireAgentId('');
    }).toThrow(MafCliArgumentError);
  });
});

describe('validateArgs', () => {
  beforeEach(() => {
    delete process.env.MAF_AGENT_ID;
  });

  it('should pass validation with valid arguments', () => {
    const args: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };
    expect(() => validateArgs(args)).not.toThrow();
  });

  it('should allow help flag without agent ID', () => {
    const args: ClaimTaskCliArgs = {
      dryRun: false,
      json: false,
      verbose: false,
      help: true
    };
    expect(() => validateArgs(args)).not.toThrow();
  });

  it('should require agent ID for non-help operations', () => {
    const args: ClaimTaskCliArgs = {
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };
    expect(() => validateArgs(args)).toThrow(MafCliArgumentError);
  });

  it('should reject empty label filters', () => {
    const args: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      labelFilters: ['valid-filter', ''],
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };
    expect(() => validateArgs(args)).toThrow('Label filters cannot be empty strings');
  });

  it('should reject empty release file', () => {
    const args: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      releaseFile: '',
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };
    expect(() => validateArgs(args)).toThrow('Release file path cannot be empty');
  });
});

describe('formatOutput', () => {
  let mockConsole: {
    log: jest.MockedFunction<typeof console.log>;
    error: jest.MockedFunction<typeof console.error>;
  };

  beforeEach(() => {
    mockConsole = {
      log: jest.fn(),
      error: jest.fn()
    };
    // Mock console methods
    global.console = {
      ...console,
      log: mockConsole.log,
      error: mockConsole.error
    } as any;
  });

  it('should format successful task claim in default mode', () => {
    const result: ClaimTaskResult = {
      success: true,
      task: {
        beadId: 'BD-001',
        constraint: 'constraint-a',
        files: ['lib/test.ts', 'tests/test.test.ts'],
        assignedAgent: 'claude-pair-1',
        title: 'Test task'
      },
      heldLeases: ['lib/test.ts', 'tests/test.test.ts'],
      message: 'Task claimed successfully'
    };

    const options: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };

    formatOutput(result, options);

    expect(mockConsole.log).toHaveBeenCalledWith(`${EMOJI.SEARCH} MAF Task Coordinator`);
    expect(mockConsole.log).toHaveBeenCalledWith('======================');
    expect(mockConsole.log).toHaveBeenCalledWith(`${EMOJI.SUCCESS} Task Claimed: BD-001 - "Test task"`);
  });

  it('should format successful task claim in JSON mode', () => {
    const result: ClaimTaskResult = {
      success: true,
      task: {
        beadId: 'BD-001',
        constraint: 'constraint-a',
        files: ['lib/test.ts'],
        assignedAgent: 'claude-pair-1',
        title: 'Test task'
      },
      message: 'Task claimed successfully'
    };

    const options: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      dryRun: false,
      json: true,
      verbose: false,
      help: false
    };

    formatOutput(result, options);

    const loggedOutput = mockConsole.log.mock.calls[0][0];
    const jsonOutput = JSON.parse(loggedOutput as string);
    expect(jsonOutput.success).toBe(true);
    expect(jsonOutput.claimed.id).toBe('BD-001');
    expect(jsonOutput.claimed.title).toBe('Test task');
  });

  it('should format failed task claim with ready tasks', () => {
    const result: ClaimTaskResult = {
      success: false,
      message: 'No tasks available',
      readyTasks: [
        {
          beadId: 'BD-002',
          constraint: 'constraint-b',
          files: ['lib/other.ts'],
          assignedAgent: null,
          title: 'Another task'
        }
      ]
    };

    const options: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };

    formatOutput(result, options);

    expect(mockConsole.log).toHaveBeenCalledWith(`${EMOJI.WARNING} No Task Claimed`);
    expect(mockConsole.log).toHaveBeenCalledWith(`${EMOJI.INFO} Ready Tasks (1):`);
  });

  it('should include lease conflicts in output', () => {
    const result: ClaimTaskResult = {
      success: true,
      task: {
        beadId: 'BD-001',
        constraint: 'constraint-a',
        files: ['lib/test.ts', 'lib/conflict.ts'],
        assignedAgent: 'claude-pair-1',
        title: 'Test task'
      },
      heldLeases: ['lib/test.ts'],
      leaseConflicts: [
        {
          file: 'lib/conflict.ts',
          reason: 'already leased by claude-backend',
          holdingAgent: 'claude-backend',
          expiresAt: Date.now() + 3600000
        }
      ],
      message: 'Task claimed with partial lease acquisition'
    };

    const options: ClaimTaskCliArgs = {
      agentId: 'claude-pair-1',
      dryRun: false,
      json: false,
      verbose: false,
      help: false
    };

    formatOutput(result, options);

    expect(mockConsole.log).toHaveBeenCalledWith(`${EMOJI.LOCK} Lease Conflicts: 1 file`);
  });
});

describe('Constants', () => {
  it('should have correct exit codes', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.ERROR).toBe(1);
    expect(EXIT_CODES.NO_TASKS_AVAILABLE).toBe(2);
    expect(EXIT_CODES.INVALID_ARGUMENTS).toBe(3);
    expect(EXIT_CODES.LEASE_CONFLICTS).toBe(4);
  });

  it('should have emoji constants', () => {
    expect(EMOJI.SUCCESS).toBe('✅');
    expect(EMOJI.ERROR).toBe('❌');
    expect(EMOJI.WARNING).toBe('⚠️');
    expect(EMOJI.INFO).toBe('ℹ️');
    expect(EMOJI.SEARCH).toBe('🔍');
  });
});

describe('Error Classes', () => {
  it('should create MafCliError with code', () => {
    const error = new MafCliError('Test error', 'TEST_CODE', { detail: 'test' });
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ detail: 'test' });
    expect(error.name).toBe('MafCliError');
  });

  it('should create MafCliArgumentError', () => {
    const error = new MafCliArgumentError('Invalid argument');
    expect(error.name).toBe('MafCliArgumentError');
    expect(error.code).toBe('INVALID_ARGUMENTS');
  });

  it('should create MafCliNoTasksError with default message', () => {
    const error = new MafCliNoTasksError();
    expect(error.name).toBe('MafCliNoTasksError');
    expect(error.code).toBe('NO_TASKS_AVAILABLE');
    expect(error.message).toBe('No tasks are currently available for claiming');
  });

  it('should create MafCliLeaseError', () => {
    const error = new MafCliLeaseError('Lease conflict detected');
    expect(error.name).toBe('MafCliLeaseError');
    expect(error.code).toBe('LEASE_CONFLICTS');
  });
});