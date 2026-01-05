#!/usr/bin/env node
// ABOUTME: Example usage of the CLI parser for MAF task claiming operations.
// ABOUTME: This demonstrates how to integrate the CLI parser with the CLI service.

import { join } from 'node:path';
import { parseClaimTaskArgs, validateArgs, formatOutput, handleError, showUsage, createMafCliService } from './index.js';

/**
 * Example function that demonstrates using the CLI parser with the MAF CLI service
 */
async function exampleClaimTask() {
  // Simulate command line arguments
  const processArgs = [
    '--agent', 'claude-pair-1',
    '--label', 'constraint-a',
    '--verbose'
  ];

  try {
    // Step 1: Parse command line arguments
    console.log('🔍 Parsing arguments...');
    const args = parseClaimTaskArgs(processArgs);
    console.log('Parsed arguments:', JSON.stringify(args, null, 2));
    console.log('');

    // Step 2: Validate arguments
    console.log('✅ Validating arguments...');
    validateArgs(args);
    console.log('Arguments validation passed');
    console.log('');

    // Step 3: Create CLI service (example configuration)
    console.log('⚙️  Setting up CLI service...');
    const projectRoot = process.cwd();
    const config = {
      agentMailRoot: join(projectRoot, '.agent-mail'),
      runtime: {
        acquireLease: async ({ filePath, agentId, expiresAt }) => {
          console.log(`📝 Acquiring lease: ${filePath} for ${agentId} until ${new Date(expiresAt).toISOString()}`);
          return { success: true };
        },
        releaseLease: async (filePath) => {
          console.log(`🔓 Releasing lease: ${filePath}`);
        },
        checkLease: async (filePath) => {
          return null; // No existing lease
        }
      }
    };
    const cliService = createMafCliService(config);
    console.log('CLI service configured');
    console.log('');

    // Step 4: Execute task claiming (dry run example)
    console.log('🎯 Claiming task (dry run)...');
    const result = await cliService.claimTask({
      agentId: args.agentId,
      labelFilters: args.labelFilters,
      dryRun: true
    });

    // Step 5: Format output
    console.log('📊 Formatting results...');
    formatOutput(result, args);
    console.log('');

    console.log('✅ Example completed successfully!');

  } catch (error) {
    // Step 6: Handle any errors
    console.log('❌ Error occurred during example:');
    handleError(error, args);
  }
}

/**
 * Example showing error handling for missing agent ID
 */
async function exampleMissingAgentError() {
  console.log('🚨 Example: Missing agent ID error');
  console.log('===================================');

  const invalidArgs = ['--dry-run']; // No agent ID provided

  try {
    const args = parseClaimTaskArgs(invalidArgs);
    validateArgs(args);
  } catch (error) {
    handleError(error, { json: false, verbose: false, dryRun: false, help: false });
  }
}

/**
 * Example showing help output
 */
async function exampleHelpOutput() {
  console.log('📖 Example: Help output');
  console.log('=======================');

  showUsage('claim-task');
}

/**
 * Example showing different output formats
 */
async function exampleOutputFormats() {
  console.log('📊 Example: Different output formats');
  console.log('=====================================');

  const mockResult = {
    success: true,
    task: {
      beadId: 'BD-001',
      constraint: 'constraint-a',
      files: ['lib/constraint.ts', 'tests/constraint.test.ts'],
      assignedAgent: 'claude-pair-1',
      title: 'Implement constraint validation'
    },
    heldLeases: ['lib/constraint.ts'],
    leaseConflicts: [{
      file: 'lib/conflict.ts',
      reason: 'already leased by claude-backend',
      holdingAgent: 'claude-backend',
      expiresAt: Date.now() + 3600000
    }],
    message: 'Task claimed with partial lease acquisition'
  };

  // Human-readable output
  console.log('\n--- Human-readable output ---');
  formatOutput(mockResult, {
    agentId: 'claude-pair-1',
    dryRun: false,
    json: false,
    verbose: false,
    help: false
  });

  // JSON output
  console.log('\n--- JSON output ---');
  formatOutput(mockResult, {
    agentId: 'claude-pair-1',
    dryRun: false,
    json: true,
    verbose: false,
    help: false
  });

  // Verbose output
  console.log('\n--- Verbose output ---');
  formatOutput(mockResult, {
    agentId: 'claude-pair-1',
    dryRun: false,
    json: false,
    verbose: true,
    help: false
  });
}

// Run examples
async function runAllExamples() {
  console.log('🚀 MAF CLI Parser Examples');
  console.log('==========================');
  console.log('');

  try {
    await exampleClaimTask();
    console.log('─'.repeat(50));
    console.log('');

    await exampleMissingAgentError();
    console.log('─'.repeat(50));
    console.log('');

    await exampleHelpOutput();
    console.log('─'.repeat(50));
    console.log('');

    await exampleOutputFormats();

  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run all examples if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  exampleClaimTask,
  exampleMissingAgentError,
  exampleHelpOutput,
  exampleOutputFormats
};
