#!/usr/bin/env -S node --import tsx

// ABOUTME: MAF escalation manager CLI interface for triggering escalations with agent-id, error-context, bead-id, and target parameters.
// ABOUTME: Routes escalations to minimax-debug-1 and codex-senior targets with SQLite persistence.

import { createMafRuntimeStateFromEnv } from '../../lib/maf/core/runtime-factory';
import type { MafEscalationRequest } from '../../lib/maf/core/protocols';

interface EscalateArgs {
  agentId?: string;
  errorContext?: string;
  beadId?: string;
  target?: 'minimax-debug-1' | 'codex-senior';
  escalationId?: string;
  json?: boolean;
  help?: boolean;
}

/**
 * Parse command line arguments for escalation manager
 */
function parseArgs(argv: string[]): EscalateArgs {
  const args: EscalateArgs = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case '--agent-id':
        args.agentId = argv[++i];
        break;
      case '--error-context':
        args.errorContext = argv[++i];
        break;
      case '--bead-id':
        args.beadId = argv[++i];
        break;
      case '--target':
        const target = argv[++i];
        if (target === 'minimax-debug-1' || target === 'codex-senior') {
          args.target = target;
        } else {
          throw new Error(`Invalid target: ${target}. Must be one of: minimax-debug-1, codex-senior`);
        }
        break;
      case '--escalation-id':
        args.escalationId = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }
  
  return args;
}

/**
 * Show usage information
 */
function showUsage(): void {
  console.log(`
🚀 MAF Escalation Manager
=========================

Triggers escalations with routing to specified targets.

Usage: escalate [options]

Required Options:
  --agent-id <id>        Agent ID triggering the escalation
  --error-context <msg>  Error context/description
  --bead-id <id>         Bead ID associated with the escalation
  --target <channel>     Target channel (minimax-debug-1, codex-senior)

Optional Options:
  --escalation-id <id>   Custom escalation ID (auto-generated if not provided)
  --json                 Output JSON format instead of human-readable
  --help, -h            Show this help message

Examples:
  escalate --agent-id codex-1 --error-context "Build failed" --bead-id bd-demo --target minimax-debug-1
  escalate --agent-id glm-2 --error-context "Test timeout" --bead-id bd-123 --target codex-senior --json
  escalate --agent-id any --error-context "Test" --bead-id bd-demo --target minimax-debug-1
`);
}

/**
 * Generate unique escalation ID
 */
function generateEscalationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `esc_${timestamp}_${random}`;
}

/**
 * Validate required arguments
 */
function validateArgs(args: EscalateArgs): void {
  if (!args.agentId) {
    throw new Error('--agent-id is required');
  }
  if (!args.errorContext) {
    throw new Error('--error-context is required');
  }
  if (!args.beadId) {
    throw new Error('--bead-id is required');
  }
  if (!args.target) {
    throw new Error('--target is required');
  }
}

/**
 * Format output based on --json flag
 */
function formatOutput(result: EscalationResult, json: boolean = false): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log(`✅ Escalation routed to ${result.target}`);
      console.log(`🆔 Escalation ID: ${result.escalationId}`);
      console.log(`🤖 Agent: ${result.agentId}`);
      console.log(`📎 Bead: ${result.beadId}`);
      console.log(`🕒 Timestamp: ${result.timestamp}`);
    } else {
      console.log(`❌ Escalation failed: ${result.error}`);
      process.exit(1);
    }
  }
}

interface EscalationResult {
  success: boolean;
  escalationId?: string;
  agentId?: string;
  target?: string;
  beadId?: string;
  timestamp?: string;
  error?: string;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    showUsage();
    return;
  }
  
  validateArgs(args);
  
  // Generate escalation ID if not provided
  const escalationId = args.escalationId || generateEscalationId();
  
  try {
    // Create runtime state (suppress logs in JSON mode)
    const originalConsoleLog = console.log;
    if (args.json) {
      console.log = () => {}; // Suppress console.log in JSON mode
    }
    
    const runtime = await createMafRuntimeStateFromEnv();
    
    // Restore console.log
    if (args.json) {
      console.log = originalConsoleLog;
    }
    
    // Create escalation request
    const escalationRequest: MafEscalationRequest = {
      type: 'ESCALATION_REQUEST',
      agentId: args.agentId!,
      executionId: `exec_${Date.now()}`,
      escalationId,
      pathId: `path_${args.beadId}`,
      level: 1,
      context: {
        errorContext: args.errorContext!,
        beadId: args.beadId!,
        target: args.target!,
        component: 'escalation-manager',
        error: {
          message: args.errorContext!,
          severity: 'medium',
          category: 'agent_coordination'
        }
      },
      reason: args.errorContext!,
      timestamp: Date.now()
    };
    
    // Persist escalation request to runtime
    await runtime.enqueue(escalationRequest);
    
    // Format and display result
    const result: EscalationResult = {
      success: true,
      escalationId,
      agentId: args.agentId,
      target: args.target,
      beadId: args.beadId,
      timestamp: new Date().toISOString()
    };
    
    formatOutput(result, args.json);
    
  } catch (error) {
    const result: EscalationResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`❌ Error: ${result.error}`);
    }
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error in escalate.ts:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { main };
