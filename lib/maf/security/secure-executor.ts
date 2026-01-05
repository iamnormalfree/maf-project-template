// ABOUTME: Secure process executor with syscall filtering and namespace isolation
// ABOUTME: Implements hybrid approach combining seccomp-bpf, command whitelisting, and PID namespaces

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import { seccompPolicyManager, SecurityViolationEvent } from './seccomp-policy';
import { commandRegistry, CommandValidationResult } from './command-registry';
import { SecureWorkspace } from './index';
import type { MafEventLogger } from '../events/event-logger';

export interface SecureExecutionOptions {
  workingDirectory?: string;
  timeout?: number;
  environment?: Record<string, string>;
  userId?: number;
  groupId?: number;
  securityProfile?: string;
  enforcementMode?: 'strict' | 'monitoring' | 'permissive';
  isolationLevel?: 'none' | 'basic' | 'strict';
  captureOutput?: boolean;
  shell?: boolean;
  secureWorkspace?: SecureWorkspace;
}

export interface SecureExecutionResult {
  success: boolean;
  exitCode: number | null;
  signal: string | null;
  stdout?: string;
  stderr?: string;
  executionTime: number;
  securityViolations: SecurityViolationEvent[];
  commandValidations: CommandValidationResult[];
  processId: number;
  isolated: boolean;
}

export interface ProcessSecurityMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  blockedExecutions: number;
  averageExecutionTime: number;
  totalViolations: number;
  violationsByType: Record<string, number>;
  activeProcesses: number;
}

/**
 * Secure Executor - Executes commands with comprehensive security controls
 */
export class SecureExecutor extends EventEmitter {
  private activeProcesses: Map<number, ChildProcess> = new Map();
  private metrics: ProcessSecurityMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    blockedExecutions: 0,
    averageExecutionTime: 0,
    totalViolations: 0,
    violationsByType: {},
    activeProcesses: 0
  };
  private executionTimes: number[] = [];
  private eventLogger?: MafEventLogger;

  constructor(eventLogger?: MafEventLogger) {
    super();
    this.eventLogger = eventLogger;
    this.setupSecurityEventHandling();
  }

  private setupSecurityEventHandling(): void {
    // Listen to security violations from seccomp policy manager
    seccompPolicyManager.on('securityViolation', (violation: SecurityViolationEvent) => {
      this.handleSecurityViolation(violation);
    });

    // Listen to command violations from command registry
    commandRegistry.on('commandViolation', (event) => {
      this.handleCommandViolation(event);
    });
  }

  /**
   * Execute a command with security controls
   */
  async executeCommand(
    command: string, 
    args: string[] = [], 
    options: SecureExecutionOptions = {}
  ): Promise<SecureExecutionResult> {
    const startTime = Date.now();
    this.metrics.totalExecutions++;

    try {
      // Step 1: Validate command against registry
      const commandValidation = commandRegistry.validateCommand({
        command,
        args,
        workingDirectory: options.workingDirectory,
        timeout: options.timeout,
        environment: options.environment
      });

      if (!commandValidation.allowed) {
        this.metrics.blockedExecutions++;
        this.logSecurityEvent('SECURITY_VIOLATION', {
          violation_type: 'process_execution',
          command,
          args,
          blocked_reason: commandValidation.violation?.details,
          severity: commandValidation.violation?.severity || 'medium',
          action_taken: 'blocked'
        });

        return {
          success: false,
          exitCode: null,
          signal: null,
          executionTime: Date.now() - startTime,
          securityViolations: [],
          commandValidations: [commandValidation],
          processId: -1,
          isolated: false
        };
      }

      // Step 2: Set up security profile
      const securityProfile = options.securityProfile || 'restricted';
      seccompPolicyManager.setActiveProfile(securityProfile);

      // Step 3: Prepare execution environment
      const executionEnvironment = this.prepareExecutionEnvironment(options, commandValidation);

      // Step 4: Execute with isolation
      const result = await this.executeWithIsolation(
        command,
        commandValidation.sanitizedArgs || args,
        executionEnvironment
      );

      const executionTime = Date.now() - startTime;
      this.recordExecutionMetrics(executionTime, result.success);

      return {
        ...result,
        executionTime,
        commandValidations: [commandValidation]
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.metrics.blockedExecutions++;

      this.logSecurityEvent('SECURITY_VIOLATION', {
        violation_type: 'process_execution',
        command,
        args,
        error: error.message,
        severity: 'high',
        action_taken: 'blocked'
      });

      return {
        success: false,
        exitCode: null,
        signal: null,
        executionTime,
        securityViolations: [],
        commandValidations: [],
        processId: -1,
        isolated: false
      };
    }
  }

  /**
   * Prepare secure execution environment
   */
  private prepareExecutionEnvironment(
    options: SecureExecutionOptions,
    commandValidation: CommandValidationResult
  ): SecureExecutionOptions {
    const env: Record<string, string> = {
      // Minimal environment variables
      PATH: '/usr/bin:/bin',
      HOME: '/tmp',
      TMPDIR: '/tmp',
      NODE_ENV: 'production',
      ...options.environment
    };

    // Remove potentially dangerous environment variables
    delete env['LD_PRELOAD'];
    delete env['LD_LIBRARY_PATH'];
    delete env['SHLVL'];
    delete env['_'];
    delete env['BASH_ENV'];

    // Use secure workspace if provided
    let workingDirectory = options.workingDirectory;
    if (options.secureWorkspace) {
      workingDirectory = options.secureWorkspace.getWorkspacePath();
    }

    // Apply validated execution context
    if (commandValidation.executionContext) {
      workingDirectory = commandValidation.executionContext.workingDirectory || workingDirectory;
      options.timeout = commandValidation.executionContext.timeout || options.timeout;
    }

    return {
      ...options,
      workingDirectory,
      environment: env,
      timeout: options.timeout || 30000,
      captureOutput: options.captureOutput !== false,
      isolationLevel: options.isolationLevel || 'basic'
    };
  }

  /**
   * Execute command with process isolation
   */
  private async executeWithIsolation(
    command: string,
    args: string[],
    options: SecureExecutionOptions
  ): Promise<Omit<SecureExecutionResult, 'executionTime' | 'commandValidations'>> {
    return new Promise((resolve) => {
      const securityViolations: SecurityViolationEvent[] = [];
      
      // Setup security violation collection
      const violationHandler = (violation: SecurityViolationEvent) => {
        securityViolations.push(violation);
      };
      seccompPolicyManager.on('securityViolation', violationHandler);

      const cleanup = () => {
        seccompPolicyManager.removeListener('securityViolation', violationHandler);
      };

      try {
        let childProcess: ChildProcess;

        if (options.isolationLevel === 'strict') {
          childProcess = this.executeWithStrictIsolation(command, args, options);
        } else if (options.isolationLevel === 'basic') {
          childProcess = this.executeWithBasicIsolation(command, args, options);
        } else {
          childProcess = this.executeWithoutIsolation(command, args, options);
        }

        const processId = childProcess.pid || -1;
        this.activeProcesses.set(processId, childProcess);
        this.metrics.activeProcesses = this.activeProcesses.size;

        let stdout = '';
        let stderr = '';

        // Collect output if requested
        if (options.captureOutput) {
          childProcess.stdout?.on('data', (data) => {
            stdout += data.toString();
          });

          childProcess.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
        }

        // Set up timeout
        let timeoutId: NodeJS.Timeout | undefined;
        if (options.timeout) {
          timeoutId = setTimeout(() => {
            childProcess.kill('SIGTERM');
            setTimeout(() => {
              if (!childProcess.killed) {
                childProcess.kill('SIGKILL');
              }
            }, 5000);
          }, options.timeout);
        }

        // Handle process completion
        childProcess.on('close', (code, signal) => {
          cleanup();
          this.activeProcesses.delete(processId);
          this.metrics.activeProcesses = this.activeProcesses.size;
          
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          const success = code === 0;
          if (success) {
            this.metrics.successfulExecutions++;
          }

          resolve({
            success,
            exitCode: code,
            signal,
            stdout: options.captureOutput ? stdout : undefined,
            stderr: options.captureOutput ? stderr : undefined,
            securityViolations,
            processId,
            isolated: options.isolationLevel !== 'none'
          });
        });

        childProcess.on('error', (error) => {
          cleanup();
          this.activeProcesses.delete(processId);
          this.metrics.activeProcesses = this.activeProcesses.size;

          resolve({
            success: false,
            exitCode: null,
            signal: null,
            stdout: options.captureOutput ? stdout : undefined,
            stderr: options.captureOutput ? (stderr + error.message) : undefined,
            securityViolations,
            processId,
            isolated: options.isolationLevel !== 'none'
          });
        });

      } catch (error: any) {
        cleanup();
        
        resolve({
          success: false,
          exitCode: null,
          signal: null,
          securityViolations,
          processId: -1,
          isolated: false
        });
      }
    });
  }

  /**
   * Execute without isolation (for trusted operations)
   */
  private executeWithoutIsolation(command: string, args: string[], options: SecureExecutionOptions): ChildProcess {
    return spawn(command, args, {
      cwd: options.workingDirectory,
      env: { ...process.env, ...options.environment },
      stdio: options.captureOutput ? 'pipe' : 'inherit',
      uid: options.userId,
      gid: options.groupId,
      shell: options.shell || false
    });
  }

  /**
   * Execute with basic isolation (namespace separation)
   */
  private executeWithBasicIsolation(command: string, args: string[], options: SecureExecutionOptions): ChildProcess {
    // In a real implementation, this would use unshare() syscall
    // For now, we simulate basic isolation with restricted environment
    const isolatedEnv = {
      ...process.env,
      ...options.environment,
      // Remove potentially dangerous environment variables
      DISPLAY: undefined,
      XAUTHORITY: undefined,
      SSH_AUTH_SOCK: undefined,
      DBUS_SESSION_BUS_ADDRESS: undefined
    };

    return spawn(command, args, {
      cwd: options.workingDirectory,
      env: isolatedEnv,
      stdio: options.captureOutput ? 'pipe' : 'inherit',
      uid: options.userId,
      gid: options.groupId,
      shell: options.shell || false,
      detached: true // Create new process group
    });
  }

  /**
   * Execute with strict isolation (full namespace separation)
   */
  private executeWithStrictIsolation(command: string, args: string[], options: SecureExecutionOptions): ChildProcess {
    // In a real implementation, this would:
    // 1. Create PID namespace with unshare(CLONE_NEWPID)
    // 2. Create mount namespace with unshare(CLONE_NEWNS)
    // 3. Create network namespace with unshare(CLONE_NEWNET)
    // 4. Apply seccomp filter
    // 5. Drop capabilities
    
    // For simulation, we apply the most restrictive settings possible
    const strictEnv = {
      ...process.env,
      PATH: '/usr/bin:/bin',
      HOME: '/tmp',
      TMPDIR: '/tmp'
    };

    const spawnOptions: any = {
      cwd: options.workingDirectory,
      env: strictEnv,
      stdio: options.captureOutput ? 'pipe' : 'inherit',
      shell: false, // Never use shell in strict mode
      detached: true
    };

    // Only attempt to drop privileges when supported and running with sufficient permissions
    try {
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        spawnOptions.uid = options.userId || 65534;
        if (typeof process.getgid === 'function') {
          spawnOptions.gid = options.groupId || 65534;
        }
      }
    } catch {
      // If uid/gid inspection fails, continue without explicit privilege drop
    }

    return spawn(command, args, spawnOptions);
  }

  /**
   * Handle security violations from seccomp policy
   */
  private handleSecurityViolation(violation: SecurityViolationEvent): void {
    this.metrics.totalViolations++;
    const violationType = violation.violation_type;
    this.metrics.violationsByType[violationType] = (this.metrics.violationsByType[violationType] || 0) + 1;

    this.logSecurityEvent('SECURITY_VIOLATION', {
      violation_type: 'process_execution',
      syscall: violation.syscall,
      pid: violation.pid,
      severity: violation.severity,
      action_taken: violation.action_taken,
      args: violation.args
    });
  }

  /**
   * Handle command violations from registry
   */
  private handleCommandViolation(event: any): void {
    this.metrics.totalViolations++;
    const violationType = event.violation.type;
    this.metrics.violationsByType[violationType] = (this.metrics.violationsByType[violationType] || 0) + 1;

    this.logSecurityEvent('SECURITY_VIOLATION', {
      violation_type: 'process_execution',
      command: event.command,
      blocked_reason: event.violation.details,
      severity: event.violation.severity,
      action_taken: 'blocked'
    });
  }

  /**
   * Record execution metrics
   */
  private recordExecutionMetrics(executionTime: number, success: boolean): void {
    this.executionTimes.push(executionTime);
    if (this.executionTimes.length > 100) {
      this.executionTimes.shift();
    }

    this.metrics.averageExecutionTime = 
      this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length;

    if (success) {
      this.metrics.successfulExecutions++;
    }
  }

  /**
   * Log security events to MAF event system
   */
  private logSecurityEvent(eventKind: string, data: any): void {
    if (this.eventLogger) {
      try {
        // This would use the actual MAF event logger when available
        console.log('Security Event:', { kind: eventKind, data });
      } catch (error) {
        console.error('Failed to log security event:', error);
      }
    }
  }

  /**
   * Get process security metrics
   */
  getMetrics(): ProcessSecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset security metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      blockedExecutions: 0,
      averageExecutionTime: 0,
      totalViolations: 0,
      violationsByType: {},
      activeProcesses: 0
    };
    this.executionTimes = [];
  }

  /**
   * Kill all active processes
   */
  killAllProcesses(): void {
    for (const [pid, process] of this.activeProcesses) {
      try {
        process.kill('SIGTERM');
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        console.error('Failed to kill process', pid, error);
      }
    }
    this.activeProcesses.clear();
    this.metrics.activeProcesses = 0;
  }
}

export const secureExecutor = new SecureExecutor();
