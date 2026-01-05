// ABOUTME: Focused tests for shell-free Python validation
// ABOUTME: Ensures MafPreflightCoordinator doesn't rely on /bin/sh for Python checks

import { describe, it, expect, jest } from '@jest/globals';

describe('MafPreflightCoordinator shell-free Python validation', () => {
  it('should validate python and pip using execFile without invoking a shell', async () => {
    const childProcess = require('node:child_process');
    const mockExecFileSync = jest.spyOn(childProcess, 'execFileSync');
    const mockExecSync = jest.spyOn(childProcess, 'execSync');

    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      if (command === 'python3' && args?.includes('--version')) {
        return 'Python 3.12.3\n';
      }
      if (command === 'pip' && args?.includes('--version')) {
        return 'pip 24.0 from /usr/lib/python3/dist-packages/pip (python 3.12)\n';
      }
      return '';
    });

    mockExecSync.mockImplementation(() => {
      throw new Error('execSync should not be used for python validation');
    });

    const { MafPreflightCoordinator } = await import('../preflight-coordinator');
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validatePython();

    expect(result.valid).toBe(true);
    expect(result.pythonVersion).toBe('3.12.3');
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    expect(mockExecSync).not.toHaveBeenCalled();

    mockExecFileSync.mockRestore();
    mockExecSync.mockRestore();
  });

  it('should treat sandbox EPERM responses with stdout as success', async () => {
    const childProcess = require('node:child_process');
    const mockExecFileSync = jest.spyOn(childProcess, 'execFileSync');

    mockExecFileSync.mockImplementation((command: string) => {
      const error = new Error('spawn EPERM');
      (error as any).stdout = command === 'python3' ? 'Python 3.12.3\n' : 'pip 24.0\n';
      throw error;
    });

    const { MafPreflightCoordinator } = await import('../preflight-coordinator');
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validatePython();

    expect(result.valid).toBe(true);
    expect(result.pythonVersion).toBe('3.12.3');
    expect(result.pipAvailable).toBe(true);

    mockExecFileSync.mockRestore();
  });
});
