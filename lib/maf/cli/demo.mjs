#!/usr/bin/env node
// ABOUTME: Demo script to show CLI parsing functionality for MAF coordinator helper.

import { parseClaimTaskArgs, formatOutput, handleError, showUsage } from './cli-parser.js';

// Demo data
const demoResult = {
  success: true,
  task: {
    beadId: 'BD-001',
    constraint: 'constraint-a',
    files: ['lib/constraint.ts', 'tests/constraint.test.ts'],
    assignedAgent: 'claude-pair-1',
    title: 'Implement constraint validation'
  },
  heldLeases: ['lib/constraint.ts', 'tests/constraint.test.ts'],
  message: 'Task claimed successfully with 2 file leases.'
};

async function runDemo() {
  console.log('🚀 MAF CLI Parser Demo');
  console.log('======================');
  console.log('');

  // Demo 1: Parse mixed argument formats
  console.log('📝 Demo 1: Parsing different argument formats');
  console.log('---------------------------------------------');

  const testArgs = [
    '--agent=claude-pair-1',
    '--label', 'constraint-a',
    '--dry-run',
    '--json'
  ];

  console.log('Input arguments:', testArgs);
  const parsed = parseClaimTaskArgs(testArgs);
  console.log('Parsed result:', JSON.stringify(parsed, null, 2));
  console.log('');

  // Demo 2: Environment variable fallback
  console.log('🌍 Demo 2: Environment variable fallback');
  console.log('----------------------------------------');

  process.env.MAF_AGENT_ID = 'claude-backend';
  const envArgs = ['--label', 'constraint-b', '--verbose'];
  console.log('MAF_AGENT_ID:', process.env.MAF_AGENT_ID);
  console.log('Input arguments:', envArgs);
  const envParsed = parseClaimTaskArgs(envArgs);
  console.log('Parsed result:', JSON.stringify(envParsed, null, 2));
  console.log('');

  // Demo 3: Output formatting comparison
  console.log('📊 Demo 3: Output formatting comparison');
  console.log('--------------------------------------');

  // Human-readable output
  console.log('Human-readable output:');
  formatOutput(demoResult, {
    agentId: 'claude-pair-1',
    dryRun: false,
    json: false,
    verbose: false,
    help: false
  });

  console.log('');
  console.log('JSON output:');
  formatOutput(demoResult, {
    agentId: 'claude-pair-1',
    dryRun: false,
    json: true,
    verbose: false,
    help: false
  });
  console.log('');

  // Demo 4: Help output
  console.log('📖 Demo 4: Help output');
  console.log('---------------------');
  showUsage('claim-task');
}

// Run the demo
runDemo().catch(error => {
  handleError(error, { json: false, verbose: true, dryRun: false, help: false });
});