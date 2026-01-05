// Debug the last failing test
import { commandRegistry } from '../command-registry';

const projectRoot = process.cwd();

describe('Debug Last Test', () => {
  test('debug each legitimate command individually', () => {
    if (process.env.MAF_RUN_DEBUG_TESTS !== '1') {
      return;
    }
    const allowedCommands = [
      { cmd: 'git', args: ['status'], dir: projectRoot },
      { cmd: 'npm', args: ['test'], dir: projectRoot },
      { cmd: 'node', args: ['script.js'], dir: projectRoot },
      { cmd: 'echo', args: ['hello'], dir: projectRoot }
    ];

    for (const { cmd, args, dir } of allowedCommands) {
      const result = commandRegistry.validateCommand({
        command: cmd,
        args,
        workingDirectory: dir
      });

      console.log(`Command: ${cmd} ${args.join(' ')}`);
      console.log(`  Allowed: ${result.allowed}`);
      if (result.violation) {
        console.log(`  Violation: ${result.violation.type} - ${result.violation.details}`);
      }
      if (result.rule) {
        console.log(`  Rule: ${result.rule.name}, allowed: ${result.rule.allowed}, requiresWorkspace: ${result.rule.requiresWorkspace}`);
      }
      console.log('');
      
      // Only fail if it's not allowed
      expect(result.allowed).toBe(true);
    }
  });
});
