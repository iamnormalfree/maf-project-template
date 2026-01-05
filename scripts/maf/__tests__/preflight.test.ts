/**
 * ABOUTME: Tests for preflight-check CLI command using environment-adaptive test harness.
 * ABOUTME: Validates that preflight validation works in both development (tsx) and CI (compiled JS) environments.
 */

import { createCliTestHarness, CliTestHarness } from '../../../lib/maf/testing';

describe('Preflight CLI Command', () => {
  let harness: CliTestHarness;

  beforeEach(() => {
    harness = createCliTestHarness();
  });

  describe('Basic functionality', () => {
    it('should display help information', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--help'],
        captureOutput: true
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('MAF Preflight Check CLI');
      expect(result.stdout).toContain('USAGE:');
      expect(result.stdout).toContain('npm run maf:preflight:ts');
    });

    it('should run preflight validation on current workspace', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: [],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('MAF Preflight Check Results:');
      expect(result.stdout).toContain('Status:');
      expect(result.stdout).toContain('Summary:');
      // Should contain validation results
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('Argument handling', () => {
    it('should accept --workspace argument', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--workspace', '.'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should accept --full-validation flag', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--full-validation'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('MAF Preflight Check Results:');
    });

    it('should accept --json output format', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);

      // Should be valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();

      const jsonResult = JSON.parse(result.stdout);
      expect(jsonResult).toHaveProperty('status');
      expect(jsonResult).toHaveProperty('timestamp');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid workspace path gracefully', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--workspace', '/nonexistent/path'],
        captureOutput: true
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr.length > 0 || result.stdout.includes('error')).toBe(true);
    });

    it('should handle invalid arguments', async () => {
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--invalid-flag'],
        captureOutput: true
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe('Environment compatibility', () => {
    it('should work in both development and CI environments', async () => {
      // Test should pass regardless of environment
      const result = await harness.runCliCommand({
        command: 'preflight',
        args: ['--help'],
        captureOutput: true
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.environment).toMatch(/^(tsx|compiled-js)$/);
    });
  });

  describe('Execution time and performance', () => {
    it('should complete preflight check within reasonable time', async () => {
      const startTime = Date.now();

      const result = await harness.runCliCommand({
        command: 'preflight',
        args: [],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      const executionTime = result.executionTime || (Date.now() - startTime);

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });
});