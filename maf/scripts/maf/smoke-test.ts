#!/usr/bin/env -S node --import tsx

// ABOUTME: MAF smoke test system for inbox/outbox message testing, thread management, and directory validation.
// ABOUTME: Tests agent communication patterns and provides machine-readable output for audit trails.

import { createMafRuntimeStateFromEnv } from '../../lib/maf/core/runtime-factory';
import type { MafSmokeTestRequest, MafSmokeTestResult } from '../../lib/maf/core/protocols';
import fs from 'fs/promises';
import path from 'path';

interface SmokeTestArgs {
  testType?: 'inbox_outbox' | 'thread_management' | 'directory_permissions' | 'agent_communication' | 'all';
  agentId?: string;
  json?: boolean;
  help?: boolean;
}

/**
 * Parse command line arguments for smoke test
 */
function parseArgs(argv: string[]): SmokeTestArgs {
  const args: SmokeTestArgs = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case '--test-type':
        const testType = argv[++i];
        if (['inbox_outbox', 'thread_management', 'directory_permissions', 'agent_communication', 'all'].includes(testType)) {
          args.testType = testType as any;
        } else {
          throw new Error(`Invalid test-type: ${testType}. Must be one of: inbox_outbox, thread_management, directory_permissions, agent_communication, all`);
        }
        break;
      case '--agent-id':
        args.agentId = argv[++i];
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
🧪 MAF Smoke Test System
=======================

Tests Agent-Mail system functionality and communication patterns.

Usage: smoke-test [options]

Options:
  --test-type <type>     Test type to run (inbox_outbox, thread_management, directory_permissions, agent_communication, all)
  --agent-id <id>        Agent ID for the test (auto-generated if not provided)
  --json                 Output JSON format instead of human-readable
  --help, -h            Show this help message

Examples:
  smoke-test --test-type all
  smoke-test --test-type inbox_outbox --agent-id test-agent
  smoke-test --test-type directory_permissions --json
`);
}

/**
 * Generate unique execution ID
 */
function generateExecutionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `smoke_${timestamp}_${random}`;
}

/**
 * Test directory creation and permissions
 */
async function testDirectoryPermissions(agentMailRoot: string): Promise<{ passed: boolean; details: any }> {
  const results = {
    messagesDir: path.join(agentMailRoot, 'messages'),
    outboxDir: path.join(agentMailRoot, 'outbox'),
    tests: [] as any[]
  };

  try {
    // Test messages directory
    try {
      await fs.mkdir(results.messagesDir, { recursive: true });
      await fs.access(results.messagesDir, fs.constants.R_OK | fs.constants.W_OK);
      results.tests.push({
        name: 'messages_directory',
        status: 'passed',
        message: 'Messages directory is accessible'
      });
    } catch (error) {
      results.tests.push({
        name: 'messages_directory',
        status: 'failed',
        message: `Messages directory error: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    // Test outbox directory
    try {
      await fs.mkdir(results.outboxDir, { recursive: true });
      await fs.access(results.outboxDir, fs.constants.R_OK | fs.constants.W_OK);
      results.tests.push({
        name: 'outbox_directory',
        status: 'passed',
        message: 'Outbox directory is accessible'
      });
    } catch (error) {
      results.tests.push({
        name: 'outbox_directory',
        status: 'failed',
        message: `Outbox directory error: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    const allPassed = results.tests.every((test: any) => test.status === 'passed');
    return { passed: allPassed, details: results };

  } catch (error) {
    return {
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Test inbox/outbox message functionality
 */
async function testInboxOutbox(agentMailRoot: string): Promise<{ passed: boolean; details: any }> {
  const results = {
    messageSend: false,
    messageRead: false,
    testMessageId: `test_msg_${Date.now()}`,
    tests: [] as any[]
  };

  try {
    const messagesDir = path.join(agentMailRoot, 'messages');
    const outboxDir = path.join(agentMailRoot, 'outbox');

    // Ensure directories exist
    await fs.mkdir(messagesDir, { recursive: true });
    await fs.mkdir(outboxDir, { recursive: true });

    // Test message creation (simulate sending)
    const testMessage = {
      id: results.testMessageId,
      type: 'test_message',
      from: 'smoke-test-agent',
      to: 'test-recipient',
      content: 'Test message for smoke test',
      timestamp: new Date().toISOString()
    };

    const messageFile = path.join(outboxDir, `${results.testMessageId}.json`);
    await fs.writeFile(messageFile, JSON.stringify(testMessage, null, 2));
    results.messageSend = true;
    results.tests.push({
      name: 'message_send',
      status: 'passed',
      message: 'Test message created successfully'
    });

    // Test message reading (simulate receiving)
    const messageData = await fs.readFile(messageFile, 'utf8');
    const parsedMessage = JSON.parse(messageData);
    
    if (parsedMessage.id === results.testMessageId) {
      results.messageRead = true;
      results.tests.push({
        name: 'message_read',
        status: 'passed',
        message: 'Test message read successfully'
      });
    } else {
      results.tests.push({
        name: 'message_read',
        status: 'failed',
        message: 'Message content mismatch'
      });
    }

    // Cleanup test message
    await fs.unlink(messageFile);

    const allPassed = results.tests.every((test: any) => test.status === 'passed');
    return { passed: allPassed, details: results };

  } catch (error) {
    return {
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Test thread management functionality
 */
async function testThreadManagement(agentMailRoot: string): Promise<{ passed: boolean; details: any }> {
  const results = {
    threadCreate: false,
    threadFetch: false,
    threadId: `thread_${Date.now()}`,
    tests: [] as any[]
  };

  try {
    const messagesDir = path.join(agentMailRoot, 'messages');
    await fs.mkdir(messagesDir, { recursive: true });

    // Create thread metadata file
    const threadMetadata = {
      id: results.threadId,
      participants: ['agent-1', 'agent-2'],
      subject: 'Test thread for smoke test',
      created: new Date().toISOString(),
      messageCount: 0
    };

    const threadFile = path.join(messagesDir, `${results.threadId}.meta.json`);
    await fs.writeFile(threadFile, JSON.stringify(threadMetadata, null, 2));
    results.threadCreate = true;
    results.tests.push({
      name: 'thread_create',
      status: 'passed',
      message: 'Thread metadata created successfully'
    });

    // Test thread fetching
    const threadData = await fs.readFile(threadFile, 'utf8');
    const parsedThread = JSON.parse(threadData);
    
    if (parsedThread.id === results.threadId && parsedThread.participants.length === 2) {
      results.threadFetch = true;
      results.tests.push({
        name: 'thread_fetch',
        status: 'passed',
        message: 'Thread metadata retrieved successfully'
      });
    } else {
      results.tests.push({
        name: 'thread_fetch',
        status: 'failed',
        message: 'Thread metadata validation failed'
      });
    }

    // Cleanup test thread
    await fs.unlink(threadFile);

    const allPassed = results.tests.every((test: any) => test.status === 'passed');
    return { passed: allPassed, details: results };

  } catch (error) {
    return {
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Test agent communication validation
 */
async function testAgentCommunication(agentMailRoot: string): Promise<{ passed: boolean; details: any }> {
  const results = {
    channelsValidated: [] as string[],
    tests: [] as any[]
  };

  try {
    // Test basic file-based communication
    const communicationTest = {
      agentId: 'smoke-test-agent',
      timestamp: Date.now(),
      message: 'Communication validation test',
      type: 'ping'
    };

    const commFile = path.join(agentMailRoot, 'communication_test.json');
    await fs.writeFile(commFile, JSON.stringify(communicationTest, null, 2));
    
    const readBack = await fs.readFile(commFile, 'utf8');
    const parsed = JSON.parse(readBack);
    
    if (parsed.agentId === communicationTest.agentId && parsed.type === 'ping') {
      results.channelsValidated.push('file_based');
      results.tests.push({
        name: 'agent_communication_file',
        status: 'passed',
        message: 'File-based agent communication validated'
      });
    } else {
      results.tests.push({
        name: 'agent_communication_file',
        status: 'failed',
        message: 'File-based communication validation failed'
      });
    }

    // Cleanup
    await fs.unlink(commFile);

    const allPassed = results.tests.every((test: any) => test.status === 'passed');
    return { passed: allPassed, details: results };

  } catch (error) {
    return {
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Run specific smoke test
 */
async function runSmokeTest(testType: string, agentId: string, executionId: string, agentMailRoot: string): Promise<MafSmokeTestResult> {
  const startTime = Date.now();
  let testResult: { passed: boolean; details: any };

  switch (testType) {
    case 'directory_permissions':
      testResult = await testDirectoryPermissions(agentMailRoot);
      break;
    case 'inbox_outbox':
      testResult = await testInboxOutbox(agentMailRoot);
      break;
    case 'thread_management':
      testResult = await testThreadManagement(agentMailRoot);
      break;
    case 'agent_communication':
      testResult = await testAgentCommunication(agentMailRoot);
      break;
    default:
      throw new Error(`Unknown test type: ${testType}`);
  }

  const duration = Date.now() - startTime;

  return {
    type: 'SMOKE_TEST_RESULT',
    agentId,
    executionId,
    testType,
    status: testResult.passed ? 'passed' : 'failed',
    result: testResult.details,
    duration,
    timestamp: Date.now()
  };
}

/**
 * Format output based on --json flag
 */
function formatOutput(results: SmokeTestOutput, json: boolean = false): void {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    if (results.success) {
      console.log(`✅ Smoke tests completed successfully`);
      console.log(`🧪 Execution ID: ${results.executionId}`);
      console.log(`🤖 Agent: ${results.agentId}`);
      console.log(`📊 Results: ${results.summary.passed}/${results.summary.total} tests passed`);
      
      if (results.results.length > 0) {
        console.log('');
        console.log('Test Results:');
        results.results.forEach(result => {
          const status = result.status === 'passed' ? '✅' : '❌';
          console.log(`  ${status} ${result.testType}: ${result.status}`);
        });
      }
    } else {
      console.log(`❌ Smoke tests failed: ${results.error}`);
      process.exit(1);
    }
  }
}

interface SmokeTestOutput {
  success: boolean;
  executionId: string;
  agentId: string;
  results: MafSmokeTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
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

  const agentId = args.agentId || `smoke-test-agent-${Date.now()}`;
  const executionId = generateExecutionId();
  
  try {
    // Create runtime state (suppress logs in JSON mode)
    const originalConsoleLog = console.log;
    if (args.json) {
      console.log = () => {}; // Suppress console.log in JSON mode
    }
    
    const runtime = await createMafRuntimeStateFromEnv();
    const agentMailRoot = process.env.MAF_AGENT_MAIL_ROOT || '.agent-mail';
    
    // Restore console.log
    if (args.json) {
      console.log = originalConsoleLog;
    }
    
    // Determine which tests to run
    const testTypes = args.testType === 'all' 
      ? ['directory_permissions', 'inbox_outbox', 'thread_management', 'agent_communication']
      : [args.testType || 'directory_permissions'];

    const results: MafSmokeTestResult[] = [];

    // Run smoke tests
    for (const testType of testTypes) {
      console.error(`Running ${testType} test...`);
      const result = await runSmokeTest(testType, agentId, executionId, agentMailRoot);
      
      // Persist result to runtime
      await runtime.enqueue(result);
      
      results.push(result);
    }

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length
    };

    const allPassed = summary.failed === 0;
    const output: SmokeTestOutput = {
      success: allPassed,
      executionId,
      agentId,
      results,
      summary
    };

    formatOutput(output, args.json);
    
    if (!allPassed) {
      process.exit(1);
    }

  } catch (error) {
    const output: SmokeTestOutput = {
      success: false,
      executionId,
      agentId,
      results: [],
      summary: { total: 0, passed: 0, failed: 0 },
      error: error instanceof Error ? error.message : String(error)
    };
    
    if (args.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error(`❌ Error: ${output.error}`);
    }
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error in smoke-test.ts:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { main };
