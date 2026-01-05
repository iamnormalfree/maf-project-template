// ABOUTME: Test suite for verification registry including git diff-based test coverage verifier.
// ABOUTME: Validates PASS/FAIL scenarios and evidence capture for metacognitive tag verification.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { runVerifications } from '../registry';

// Mock execa to avoid actual npm test execution during tests
jest.mock('execa', () => ({
  execa: jest.fn(),
}));

const mockExeca = require('execa').execa;

// Mock git diff functionality
const mockGitDiff = jest.fn();
const mockGitStatus = jest.fn();

// Mock child_process for git commands
jest.mock('child_process', () => ({
  execSync: jest.fn((command: string) => {
    if (command.includes('diff --name-only')) {
      return mockGitDiff();
    }
    if (command.includes('status --porcelain')) {
      return mockGitStatus();
    }
    return '';
  }),
}));

const { execSync } = require('child_process');

describe('Verification Registry', () => {
  const mockWorkdir = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Existing Verifiers', () => {
    it('should pass uncertainty:high:code when npm test succeeds', async () => {
      mockExeca.mockResolvedValue({ exitCode: 0 });

      const result = await runVerifications(['uncertainty:high:code'], {
        workdir: '/test/dir',
        payload: {},
      });

      expect(result.pass).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'uncertainty:high:code',
        result: 'PASS',
        details: { tests: 'passed' },
      });
    });

    it('should fail uncertainty:high:code when npm test fails', async () => {
      mockExeca.mockRejectedValue({ exitCode: 1, stderr: 'Test failed' });

      const result = await runVerifications(['uncertainty:high:code'], {
        workdir: '/test/dir',
        payload: {},
      });

      expect(result.pass).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'uncertainty:high:code',
        result: 'FAIL',
        details: { exitCode: 1, stderr: 'Test failed' },
      });
    });

    it('should pass assumption:api when apiDocSnippet is present', async () => {
      const result = await runVerifications(['assumption:api'], {
        workdir: '/test/dir',
        payload: { apiDocSnippet: 'some documentation' },
      });

      expect(result.pass).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'assumption:api',
        result: 'PASS',
        details: { doc: 'present' },
      });
    });

    it('should fail assumption:api when apiDocSnippet is missing', async () => {
      const result = await runVerifications(['assumption:api'], {
        workdir: '/test/dir',
        payload: {},
      });

      expect(result.pass).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'assumption:api',
        result: 'FAIL',
        details: { doc: 'missing' },
      });
    });
  });

  describe('Git Diff Coverage Verifier', () => {
    it('should pass coverage:git-diff when source changes have corresponding test changes', async () => {
      // Mock git diff showing source and test file changes
      mockGitDiff.mockReturnValue(
        'src/calculator.ts\nsrc/calculator.test.ts\nsrc/utils.ts\nsrc/utils.test.ts'
      );
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'coverage:git-diff',
        result: 'PASS',
      });
      const details = result.results[0].details;
      expect(details.sourceFiles).toContain('src/calculator.ts');
      expect(details.sourceFiles).toContain('src/utils.ts');
      expect(details.testFiles).toContain('src/calculator.test.ts');
      expect(details.testFiles).toContain('src/utils.test.ts');
      expect(details.coverageGaps).toEqual([]);
    });

    it('should fail coverage:git-diff when source files changed without test changes', async () => {
      // Mock git diff showing only source file changes
      mockGitDiff.mockReturnValue('src/calculator.ts\nsrc/utils.ts');
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'coverage:git-diff',
        result: 'FAIL',
      });
      const details = result.results[0].details;
      expect(details.sourceFiles).toContain('src/calculator.ts');
      expect(details.sourceFiles).toContain('src/utils.ts');
      expect(details.coverageGaps).toEqual([
        'src/calculator.ts',
        'src/utils.ts',
      ]);
    });

    it('should pass coverage:git-diff when only test files changed', async () => {
      // Mock git diff showing only test file changes
      mockGitDiff.mockReturnValue('src/calculator.test.ts\nsrc/utils.test.ts');
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tag: 'coverage:git-diff',
        result: 'PASS',
      });
      const details = result.results[0].details;
      expect(details.sourceFiles).toEqual([]);
      expect(details.testFiles).toContain('src/calculator.test.ts');
      expect(details.coverageGaps).toEqual([]);
    });

    it('should handle new source files correctly', async () => {
      // Mock git status showing new untracked files
      mockGitDiff.mockReturnValue('');
      mockGitStatus.mockReturnValue('?? src/new-calculator.ts\n?? src/new-calculator.test.ts');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(true);
      expect(result.results[0].result).toBe('PASS');
      const details = result.results[0].details;
      expect(details.sourceFiles).toContain('src/new-calculator.ts');
      expect(details.testFiles).toContain('src/new-calculator.test.ts');
    });

    it('should fail when new source files exist without test files', async () => {
      mockGitDiff.mockReturnValue('');
      mockGitStatus.mockReturnValue('?? src/new-calculator.ts\n?? src/another-file.ts');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(false);
      expect(result.results[0].result).toBe('FAIL');
      const details = result.results[0].details;
      expect(details.coverageGaps).toContain('src/new-calculator.ts');
      expect(details.coverageGaps).toContain('src/another-file.ts');
    });

    it('should ignore non-source files (config, docs, etc.)', async () => {
      mockGitDiff.mockReturnValue(
        'README.md\npackage.json\ndocs/guide.md\n.config.ts'
      );
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(true);
      expect(result.results[0].result).toBe('PASS');
      const details = result.results[0].details;
      expect(details.sourceFiles).toEqual([]);
      expect(details.ignoredFiles).toContain('README.md');
      expect(details.ignoredFiles).toContain('package.json');
    });

    it('should handle mixed test file patterns (.test.ts, __tests__/, .spec.ts)', async () => {
      mockGitDiff.mockReturnValue(
        'src/component.ts\nsrc/component.test.ts\nsrc/utils/__tests__/util.test.ts\nsrc/service.spec.ts'
      );
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(true);
      expect(result.results[0].result).toBe('PASS');
      const details = result.results[0].details;
      // Only actual changed source files should be listed
      expect(details.sourceFiles).toContain('src/component.ts');
      expect(details.sourceFiles).toHaveLength(1); // Only component.ts was actually changed
      expect(details.testFiles).toContain('src/component.test.ts');
      expect(details.testFiles).toContain('src/utils/__tests__/util.test.ts');
      expect(details.testFiles).toContain('src/service.spec.ts');
      expect(details.testFiles).toHaveLength(3); // All 3 test files
      // No coverage gaps because all changed source files have corresponding test changes
      expect(details.coverageGaps).toEqual([]);
    });

    it('should provide detailed evidence for audit trails', async () => {
      mockGitDiff.mockReturnValue('src/calculator.ts');
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(false);
      const details = result.results[0].details;

      // Should include comprehensive evidence
      expect(details).toHaveProperty('timestamp');
      expect(details).toHaveProperty('workdir', mockWorkdir);
      expect(details).toHaveProperty('sourceFiles');
      expect(details).toHaveProperty('testFiles');
      expect(details).toHaveProperty('coverageGaps');
      expect(details).toHaveProperty('ignoredFiles');
      expect(details).toHaveProperty('summary');
      expect(details.summary).toMatch(/Test coverage verification FAILED/);
    });
  });

  describe('Multiple Verifiers', () => {
    it('should run multiple verifiers and return overall PASS when all pass', async () => {
      mockExeca.mockResolvedValue({ exitCode: 0 });
      mockGitDiff.mockReturnValue('src/app.ts\nsrc/app.test.ts');
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(
        ['uncertainty:high:code', 'coverage:git-diff', 'assumption:api'],
        {
          workdir: mockWorkdir,
          payload: { apiDocSnippet: 'present' },
        }
      );

      expect(result.pass).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.result === 'PASS')).toBe(true);
    });

    it('should return overall FAIL when any verifier fails', async () => {
      mockExeca.mockResolvedValue({ exitCode: 0 });
      mockGitDiff.mockReturnValue('src/app.ts'); // No test change
      mockGitStatus.mockReturnValue('');

      const result = await runVerifications(
        ['uncertainty:high:code', 'coverage:git-diff'],
        {
          workdir: mockWorkdir,
          payload: {},
        }
      );

      expect(result.pass).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].result).toBe('PASS'); // uncertainty passes
      expect(result.results[1].result).toBe('FAIL'); // coverage fails
    });
  });

  describe('Error Handling', () => {
    it('should handle git command failures gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const result = await runVerifications(['coverage:git-diff'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(false);
      expect(result.results[0].result).toBe('FAIL');
      expect(result.results[0].details.error).toContain('Git command failed');
    });

    it('should skip unknown verifier tags', async () => {
      const result = await runVerifications(['unknown:verifier'], {
        workdir: mockWorkdir,
        payload: {},
      });

      expect(result.pass).toBe(true); // No failures if no verifiers run
      expect(result.results).toHaveLength(0);
    });
  });
});