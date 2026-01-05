// Debug test for command validation
import { commandRegistry } from '../command-registry';

const projectRoot = process.cwd();

describe('Command Validation Debug', () => {
  test('debug git command validation', () => {
    console.log('=== Debug Git Command ===');
    
    // Check if git rule exists
    const gitRule = commandRegistry.getRule('git');
    console.log('Git rule:', {
      name: gitRule?.name,
      allowed: gitRule?.allowed,
      requiresWorkspace: gitRule?.requiresWorkspace,
      securityLevel: gitRule?.securityLevel
    });

    // Validate with working directory
    const result1 = commandRegistry.validateCommand({
      command: 'git',
      args: ['status'],
      workingDirectory: projectRoot
    });
    console.log('With workdir:', {
      allowed: result1.allowed,
      violation: result1.violation
    });

    // Validate without working directory
    const result2 = commandRegistry.validateCommand({
      command: 'git',
      args: ['status']
    });
    console.log('Without workdir:', {
      allowed: result2.allowed,
      violation: result2.violation
    });

    expect(true).toBe(true); // Always pass - this is just for debugging
  });
});
