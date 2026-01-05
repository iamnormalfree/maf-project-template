import { commandRegistry } from '../command-registry';

describe('Individual Command Tests', () => {
  test('git command should be allowed', () => {
    const result = commandRegistry.validateCommand({
      command: 'git',
      args: ['status'],
      workingDirectory: '/tmp/test-workspace'
    });
    expect(result.allowed).toBe(true);
  });

  test('npm command should be allowed', () => {
    const result = commandRegistry.validateCommand({
      command: 'npm',
      args: ['test'],
      workingDirectory: '/tmp/test-workspace'
    });
    expect(result.allowed).toBe(true);
  });

  test('node command should be allowed', () => {
    const result = commandRegistry.validateCommand({
      command: 'node',
      args: ['script.js'],
      workingDirectory: '/tmp/test-workspace'
    });
    expect(result.allowed).toBe(true);
  });

  test('echo command should be allowed', () => {
    const result = commandRegistry.validateCommand({
      command: 'echo',
      args: ['hello']
    });
    expect(result.allowed).toBe(true);
  });
});
