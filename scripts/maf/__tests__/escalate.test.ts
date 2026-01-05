import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createCliTestHarness, type CliExecutionResult } from "../../../lib/maf/testing";

describe('MAF Escalation Manager', () => {
  let harness: ReturnType<typeof createCliTestHarness>;

  beforeEach(() => {
    harness = createCliTestHarness({
      defaultTimeout: 30000,
    });
  });

  afterEach(() => {
    // Clean up any harness state if needed
  });

  describe('CLI Parameter Validation', () => {
    it('should require agent-id parameter', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'escalate',
        args: ['--error-context', 'test', '--bead-id', 'bd-demo', '--target', 'minimax-debug-1'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('agent-id is required');
    });

    it('should validate target parameter values', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'escalate',
        args: ['--agent-id', 'test-agent', '--error-context', 'test', '--bead-id', 'bd-demo', '--target', 'invalid-target'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid target');
    });
  });

  describe('Escalation Target Routing', () => {
    it('should route escalation to minimax-debug-1 target', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'escalate',
        args: ['--agent-id', 'test-agent', '--error-context', 'test error', '--bead-id', 'bd-demo', '--target', 'minimax-debug-1'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Escalation routed to minimax-debug-1');
      expect(result.stdout).toContain('Escalation ID: esc_');
    });
  });

  describe('Machine-Readable Output', () => {
    it('should output JSON format when --json flag is provided', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'escalate',
        args: ['--agent-id', 'test-agent', '--error-context', 'test error', '--bead-id', 'bd-demo', '--target', 'minimax-debug-1', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult).toMatchObject({
        success: true,
        escalationId: expect.stringMatching(/^esc_[\w-]+$/),
        agentId: 'test-agent',
        target: 'minimax-debug-1',
        timestamp: expect.any(String)
      });
    });
  });
});
