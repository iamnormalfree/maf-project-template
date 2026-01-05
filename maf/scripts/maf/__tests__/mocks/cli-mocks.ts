// ABOUTME: Mock factory for CLI command execution (npm scripts, tsx commands)
// ABOUTME: Provides comprehensive CLI command simulation with safety validation

import { jest } from '@jest/globals';

export interface MockCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration?: number;
  timeout?: boolean;
}

export interface MockCommandExecution {
  command: string;
  args: string[];
  result: MockCommandResult;
  timestamp: number;
}

export interface MockCLIState {
  executions: MockCommandExecution[];
  commandHistory: string[];
  dangerousCommands: string[];
  allowedCommands: string[];
  failCommands: Set<string>;
  slowCommands: Set<string>;
  dryRunMode: boolean;
}

export class CLIMockFactory {
  private state: MockCLIState = {
    executions: [],
    commandHistory: [],
    dangerousCommands: [
      'rm -rf',
      'sudo',
      'chmod 777',
      '> /dev/',
      'curl | sh',
      'wget | sh',
      ':(){ :|:& };:',
      'dd if=/dev/zero',
      'mkfs',
      'format'
    ],
    allowedCommands: [
      'npm',
      'bash',
      'tmux',
      'node',
      'tsx',
      'echo',
      'cat',
      'ls'
    ],
    failCommands: new Set(),
    slowCommands: new Set(),
    dryRunMode: false
  };

  /**
   * Create mock for child_process.exec
   */
  createMockExec() {
    return jest.fn().mockImplementation(async (command: string, options?: any) => {
      this.state.commandHistory.push(command);
      
      const startTime = Date.now();
      
      try {
        // Check for dangerous commands
        this.validateCommandSafety(command);
        
        // Check if command should fail
        if (this.shouldFailCommand(command)) {
          throw new Error(`Command failed: ${command}`);
        }
        
        // Check if command should be slow
        if (this.shouldSlowCommand(command)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const result = this.simulateCommandExecution(command);
        const duration = Date.now() - startTime;
        
        this.recordExecution(command, [], {
          ...result,
          duration
        });
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorResult: MockCommandResult = {
          success: false,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          duration
        };
        
        this.recordExecution(command, [], errorResult);
        throw error;
      }
    });
  }

  /**
   * Create mock for child_process.spawnSync
   */
  createMockSpawnSync() {
    return jest.fn().mockImplementation((command: string, args?: string[], options?: any) => {
      const fullCommand = command + ' ' + (args || []).join(' ');
      this.state.commandHistory.push(fullCommand);
      
      try {
        // Check for dangerous commands
        this.validateCommandSafety(command, args);
        
        // Check if command should fail
        if (this.shouldFailCommand(fullCommand)) {
          return {
            status: 1,
            stdout: '',
            stderr: `Command failed: ${fullCommand}`,
            error: new Error(`Command failed: ${fullCommand}`)
          } as any;
        }
        
        const result = this.simulateCommandExecution(fullCommand);
        
        this.recordExecution(command, args || [], result);
        
        return {
          status: result.success ? 0 : result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.success ? undefined : new Error(result.stderr)
        } as any;
        
      } catch (error) {
        const errorResult: MockCommandResult = {
          success: false,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1
        };
        
        this.recordExecution(command, args || [], errorResult);
        
        return {
          status: 1,
          stdout: '',
          stderr: errorResult.stderr,
          error: new Error(errorResult.stderr)
        } as any;
      }
    });
  }

  /**
   * Validate command safety
   */
  private validateCommandSafety(command: string, args?: string[]): void {
    const fullCommand = command + ' ' + (args || []).join(' ');
    
    // Check for dangerous patterns
    for (const pattern of this.state.dangerousCommands) {
      if (fullCommand.includes(pattern)) {
        throw new Error(`Command not allowed for safety: ${pattern}`);
      }
    }
    
    // Check allowed commands
    const commandBase = command.split(' ')[0];
    if (!this.state.allowedCommands.includes(commandBase)) {
      throw new Error(`Command not allowed: ${commandBase}`);
    }
  }

  /**
   * Simulate command execution
   */
  private simulateCommandExecution(command: string): MockCommandResult {
    if (command.includes('npm run maf:bootstrap-agent-mail')) {
      return {
        success: true,
        stdout: 'Mail bootstrap completed successfully\nProcessed 5 messages\n',
        stderr: '',
        exitCode: 0
      };
    }
    
    if (command.includes('tsx scripts/maf/claim-task.ts')) {
      return {
        success: true,
        stdout: 'Task claimed successfully\nTask ID: task-' + Math.random().toString(36).substr(2, 9) + '\n',
        stderr: '',
        exitCode: 0
      };
    }
    
    if (command.includes('list_agent_sessions')) {
      return {
        success: true,
        stdout: 'maf-agent-worker-001\n  Agent ID: worker-001\n  Windows: 4\n\nmaf-agent-reviewer-002\n  Agent ID: reviewer-002\n  Windows: 2\n',
        stderr: '',
        exitCode: 0
      };
    }
    
    if (command.includes('npm run')) {
      return {
        success: true,
        stdout: 'Script executed successfully\n',
        stderr: '',
        exitCode: 0
      };
    }
    
    if (command.includes('tmux')) {
      return {
        success: true,
        stdout: 'tmux operation completed\n',
        stderr: '',
        exitCode: 0
      };
    }
    
    // Default response
    return {
      success: true,
      stdout: 'Command executed\n',
      stderr: '',
      exitCode: 0
    };
  }

  /**
   * Check if command should fail
   */
  private shouldFailCommand(command: string): boolean {
    for (const failCommand of this.state.failCommands) {
      if (command.includes(failCommand)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if command should be slow
   */
  private shouldSlowCommand(command: string): boolean {
    for (const slowCommand of this.state.slowCommands) {
      if (command.includes(slowCommand)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Record command execution
   */
  private recordExecution(command: string, args: string[], result: MockCommandResult): void {
    const execution: MockCommandExecution = {
      command,
      args,
      result,
      timestamp: Date.now()
    };
    
    this.state.executions.push(execution);
  }

  /**
   * Set command to fail
   */
  setFailCommand(pattern: string): void {
    this.state.failCommands.add(pattern);
  }

  /**
   * Remove command failure
   */
  removeFailCommand(pattern: string): void {
    this.state.failCommands.delete(pattern);
  }

  /**
   * Set command to be slow
   */
  setSlowCommand(pattern: string): void {
    this.state.slowCommands.add(pattern);
  }

  /**
   * Remove slow command
   */
  removeSlowCommand(pattern: string): void {
    this.state.slowCommands.delete(pattern);
  }

  /**
   * Set dry run mode
   */
  setDryRunMode(enabled: boolean): void {
    this.state.dryRunMode = enabled;
  }

  /**
   * Add allowed command
   */
  addAllowedCommand(command: string): void {
    this.state.allowedCommands.push(command);
  }

  /**
   * Add dangerous command pattern
   */
  addDangerousCommand(pattern: string): void {
    this.state.dangerousCommands.push(pattern);
  }

  /**
   * Get command history
   */
  getCommandHistory(): string[] {
    return [...this.state.commandHistory];
  }

  /**
   * Get executions
   */
  getExecutions(): MockCommandExecution[] {
    return [...this.state.executions];
  }

  /**
   * Get execution count
   */
  getExecutionCount(): number {
    return this.state.executions.length;
  }

  /**
   * Get successful executions
   */
  getSuccessfulExecutions(): MockCommandExecution[] {
    return this.state.executions.filter(exec => exec.result.success);
  }

  /**
   * Get failed executions
   */
  getFailedExecutions(): MockCommandExecution[] {
    return this.state.executions.filter(exec => !exec.result.success);
  }

  /**
   * Clear command history
   */
  clearCommandHistory(): void {
    this.state.commandHistory = [];
    this.state.executions = [];
  }

  /**
   * Verify command was executed
   */
  wasCommandExecuted(pattern: string): boolean {
    return this.state.commandHistory.some(cmd => cmd.includes(pattern));
  }

  /**
   * Get execution count for pattern
   */
  getExecutionCount(pattern: string): number {
    return this.state.commandHistory.filter(cmd => cmd.includes(pattern)).length;
  }

  /**
   * Create realistic test scenarios
   */
  static createTestScenarios() {
    return {
      normalExecution: () => {
        return new CLIMockFactory();
      },

      withFailures: () => {
        const factory = new CLIMockFactory();
        factory.setFailCommand('npm run maf:bootstrap-agent-mail');
        factory.setFailCommand('tsx scripts/maf/claim-task.ts');
        return factory;
      },

      withSlowCommands: () => {
        const factory = new CLIMockFactory();
        factory.setSlowCommand('tmux');
        return factory;
      },

      dryRunMode: () => {
        const factory = new CLIMockFactory();
        factory.setDryRunMode(true);
        return factory;
      }
    };
  }

  /**
   * Create command result helper
   */
  static createCommandResult(options: Partial<MockCommandResult> = {}): MockCommandResult {
    return {
      success: true,
      stdout: '',
      stderr: '',
      exitCode: 0,
      ...options
    };
  }

  /**
   * Create failure result helper
   */
  static createFailureResult(message: string, exitCode = 1): MockCommandResult {
    return {
      success: false,
      stdout: '',
      stderr: message,
      exitCode
    };
  }
}

/**
 * Utility function to create CLI mock for tests
 */
export function createCLIMock(): CLIMockFactory {
  return new CLIMockFactory();
}

/**
 * Pre-configured mock scenarios
 */
export const CLI_SCENARIOS = CLIMockFactory.createTestScenarios();
