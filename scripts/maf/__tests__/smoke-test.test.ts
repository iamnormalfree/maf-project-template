import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createCliTestHarness, type CliExecutionResult } from "../../../lib/maf/testing";
import fs from "fs/promises";
import path from "path";

describe('MAF Smoke Test System', () => {
  const TEST_AGENT_MAIL_ROOT = path.join(__dirname, '../../../.agent-mail-test-smoke');
  let harness: ReturnType<typeof createCliTestHarness>;

  beforeEach(async () => {
    harness = createCliTestHarness({
      defaultTimeout: 30000,
    });
    
    // Clean up any existing test directories
    try {
      await fs.rm(TEST_AGENT_MAIL_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(TEST_AGENT_MAIL_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  describe('CLI Parameter Validation', () => {
    it('should validate test-type parameter values', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'invalid-type'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid test-type');
    });
  });

  describe('Smoke Test Execution', () => {
    it('should run directory permissions test successfully', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'directory_permissions', '--agent-id', 'test-agent'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file', MAF_AGENT_MAIL_ROOT: '.agent-mail-test' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Smoke tests completed successfully');
      expect(result.stdout).toContain('Execution ID: smoke_');
      expect(result.stdout).toContain('directory_permissions: passed');
    });

    it('should run inbox_outbox test successfully', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'inbox_outbox', '--agent-id', 'test-agent'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file', MAF_AGENT_MAIL_ROOT: '.agent-mail-test' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Smoke tests completed successfully');
      expect(result.stdout).toContain('inbox_outbox: passed');
    });

    it('should run all smoke tests when test-type is all', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'all', '--agent-id', 'test-agent'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file', MAF_AGENT_MAIL_ROOT: '.agent-mail-test' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Smoke tests completed successfully');
      expect(result.stdout).toContain('4/4 tests passed');
    });
  });

  describe('Machine-Readable Output', () => {
    it('should output JSON format when --json flag is provided', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'directory_permissions', '--agent-id', 'test-agent', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file', MAF_AGENT_MAIL_ROOT: '.agent-mail-test' }
      });

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult).toMatchObject({
        success: true,
        executionId: expect.stringMatching(/^smoke_[\w-]+$/),
        agentId: 'test-agent',
        summary: {
          total: 1,
          passed: 1,
          failed: 0
        },
        results: expect.arrayContaining([
          expect.objectContaining({
            testType: 'directory_permissions',
            status: 'passed'
          })
        ])
      });
    });
  });

  describe('Directory Creation', () => {
    it('should create agent-mail directories if they do not exist', async () => {
      await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'directory_permissions', '--agent-id', 'test-agent'],
        captureOutput: false, // Don't need output for this test
        env: { 
          MAF_RUNTIME: 'file',
          MAF_AGENT_MAIL_ROOT: TEST_AGENT_MAIL_ROOT 
        }
      });

      // Verify directories were created
      expect(fs.access(path.join(TEST_AGENT_MAIL_ROOT, 'messages'))).resolves.not.toThrow();
      expect(fs.access(path.join(TEST_AGENT_MAIL_ROOT, 'outbox'))).resolves.not.toThrow();
    });
  });
});
