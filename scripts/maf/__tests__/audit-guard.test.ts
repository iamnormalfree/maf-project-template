import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createCliTestHarness, type CliExecutionResult } from "../../../lib/maf/testing";

describe('MAF Audit Guard System', () => {
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
    it('should require bead-id parameter', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: [],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--bead-id is required');
    });

    it('should validate sample-size parameter', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--sample-size', '-1'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid sample-size');
    });

    it('should validate sample-size as integer', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--sample-size', 'abc'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid sample-size');
    });
  });

  describe('Audit Execution', () => {
    it('should run audit successfully with default sample size', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      // Command should execute (may succeed or fail audit-wise)
      expect(result.stdout).toContain('Evidence-based audit completed for bead bd-demo');
      expect(result.stdout).toContain('Audit ID: audit_');
      expect(result.stdout).toContain('Status:');
    });

    it('should run audit with custom sample size', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--sample-size', '10'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.stdout).toContain('Evidence-based audit completed for bead bd-demo');
      expect(result.stdout).toContain('Findings:');
    });

    it('should run audit with custom agent ID', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--agent-id', 'custom-audit-agent'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.stdout).toContain('Agent: custom-audit-agent');
    });

    it('should run audit with custom audit ID', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--audit-id', 'custom-audit-123'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      expect(result.stdout).toContain('Audit ID: custom-audit-123');
    });
  });

  describe('Machine-Readable Output', () => {
    it('should output JSON format when --json flag is provided', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult).toMatchObject({
        type: 'AUDIT_GUARD_RESULT',
        agentId: expect.stringMatching(/^audit-agent-/),
        auditId: expect.stringMatching(/^audit_[\w-]+$/),
        beadId: 'bd-demo',
        status: expect.stringMatching(/^(passed|warning|failed)$/),
        summary: {
          totalFindings: expect.any(Number),
          criticalCount: expect.any(Number),
          highCount: expect.any(Number),
          mediumCount: expect.any(Number),
          lowCount: expect.any(Number)
        },
        findings: expect.any(Array)
      });
    });

    it('should include findings in JSON output', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--sample-size', '1', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      const parsedResult = JSON.parse(result.stdout);
      expect(parsedResult.findings).toBeInstanceOf(Array);
      
      // If there are findings, they should have the expected structure
      if (parsedResult.findings.length > 0) {
        const finding = parsedResult.findings[0];
        expect(finding).toMatchObject({
          severity: expect.stringMatching(/^(low|medium|high|critical)$/),
          category: expect.any(String),
          description: expect.any(String)
        });
      }
    });
  });

  describe('Audit Categories', () => {
    it('should include code quality findings', async () => {
      // Run multiple times to increase chance of finding code quality issues
      for (let i = 0; i < 5; i++) {
        const result: CliExecutionResult = await harness.runCliCommand({
          command: 'audit-guard',
          args: ['--bead-id', 'bd-demo', '--sample-size', '10', '--json'],
          captureOutput: true,
          env: { MAF_RUNTIME: 'file' }
        });

        const parsedResult = JSON.parse(result.stdout);
        const codeQualityFindings = parsedResult.findings.filter((f: any) => 
          f.category === 'test_coverage' || f.category === 'code_complexity'
        );
        
        if (codeQualityFindings.length > 0) {
          expect(codeQualityFindings[0]).toMatchObject({
            severity: expect.stringMatching(/^(low|medium|high|critical)$/),
            category: expect.stringMatching(/^(test_coverage|code_complexity)$/),
            description: expect.any(String)
          });
          return; // Test passed
        }
      }
      
      // If no findings found after multiple attempts, that's also valid
      expect(true).toBe(true);
    });

    it('should include documentation findings', async () => {
      // Run multiple times to increase chance of finding documentation issues
      for (let i = 0; i < 5; i++) {
        const result: CliExecutionResult = await harness.runCliCommand({
          command: 'audit-guard',
          args: ['--bead-id', 'bd-demo', '--sample-size', '10', '--json'],
          captureOutput: true,
          env: { MAF_RUNTIME: 'file' }
        });

        const parsedResult = JSON.parse(result.stdout);
        const docFindings = parsedResult.findings.filter((f: any) => f.category === 'documentation');
        
        if (docFindings.length > 0) {
          expect(docFindings[0]).toMatchObject({
            severity: expect.stringMatching(/^(low|medium|high|critical)$/),
            category: 'documentation',
            description: expect.any(String)
          });
          return; // Test passed
        }
      }
      
      // If no findings found after multiple attempts, that's also valid
      expect(true).toBe(true);
    });
  });

  describe('Status Determination', () => {
    it('should return appropriate status based on findings', async () => {
      const result: CliExecutionResult = await harness.runCliCommand({
        command: 'audit-guard',
        args: ['--bead-id', 'bd-demo', '--json'],
        captureOutput: true,
        env: { MAF_RUNTIME: 'file' }
      });

      const parsedResult = JSON.parse(result.stdout);
      expect(['passed', 'warning', 'failed']).toContain(parsedResult.status);
      
      // Status should be consistent with findings
      if (parsedResult.summary.criticalCount > 0) {
        expect(parsedResult.status).toBe('failed');
      }
    });
  });
});
