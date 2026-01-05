import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createCliTestHarness, type CliExecutionResult } from "../../../lib/maf/testing";

describe('Phase 3d Integration Tests', () => {
  let harness: ReturnType<typeof createCliTestHarness>;

  beforeEach(() => {
    harness = createCliTestHarness({
      defaultTimeout: 30000,
    });
  });

  afterEach(() => {
    // Clean up any harness state if needed
  });

  describe('CLI Tool Availability', () => {
    it('should have escalation manager available', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'escalate',
        args: ['--help'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('MAF Escalation Manager');
    });

    it('should have smoke test system available', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--help'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('MAF Smoke Test System');
    });

    it('should have audit guard system available', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--help'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('MAF Audit Guard System');
    });
  });

  describe('Basic Functionality', () => {
    it('should execute escalation commands with JSON output', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'escalate',
        args: ['--agent-id', 'test', '--error-context', 'test', '--bead-id', 'bd-demo', '--target', 'minimax-debug-1', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.target).toBe('minimax-debug-1');
    });

    it('should execute smoke test commands with JSON output', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'smoke-test',
        args: ['--test-type', 'directory_permissions', '--agent-id', 'test', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.summary.total).toBe(1);
    });

    it('should execute audit guard commands with JSON output', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.stdout).toContain('AUDIT_GUARD_RESULT'); // Command executes, may succeed or fail audit-wise
      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult.type).toBe('AUDIT_GUARD_RESULT');
      expect(parsedResult.beadId).toBe('bd-demo');
    });
  });
});
