// ABOUTME: Command registry and whitelist for MAF process security
// ABOUTME: Manages allowed commands with validation and security controls

import { EventEmitter } from 'events';

export interface CommandRule {
  name: string;
  allowed: boolean;
  description: string;
  allowedArgs?: string[];
  blockedArgs?: string[];
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresWorkspace?: boolean;
  maxExecutionTime?: number; // milliseconds
  allowedPaths?: string[];
  blockedPaths?: string[];
}

export interface CommandExecutionContext {
  command: string;
  args: string[];
  workingDirectory?: string;
  userId?: number;
  groupId?: number;
  environment?: Record<string, string>;
  timeout?: number;
}

export interface CommandValidationResult {
  allowed: boolean;
  rule?: CommandRule;
  violation?: {
    type: 'command_blocked' | 'args_blocked' | 'path_blocked' | 'timeout_exceeded' | 'privilege_escalation';
    details: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  sanitizedArgs?: string[];
  executionContext?: Partial<CommandExecutionContext>;
}

export interface CommandSecurityMetrics {
  totalCommands: number;
  allowedCommands: number;
  blockedCommands: number;
  violationsByType: Record<string, number>;
  violationsByCommand: Record<string, number>;
  averageExecutionTime: number;
  activeCommands: number;
}

/**
 * Command Registry - Manages whitelisted commands and validates execution requests
 */
export class CommandRegistry extends EventEmitter {
  private rules: Map<string, CommandRule> = new Map();
  private metrics: CommandSecurityMetrics = {
    totalCommands: 0,
    allowedCommands: 0,
    blockedCommands: 0,
    violationsByType: {},
    violationsByCommand: {},
    averageExecutionTime: 0,
    activeCommands: 0
  };
  private executionTimes: number[] = [];
  private activeExecutions = new Set<string>();

  constructor() {
    super();
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    // Git commands - allowed for MAF operations
    this.addRule({
      name: 'git',
      allowed: true,
      description: 'Git version control operations',
      securityLevel: 'medium',
      requiresWorkspace: true,
      maxExecutionTime: 30000,
      allowedArgs: [
        'clone', 'checkout', 'status', 'diff', 'add', 'commit', 'push', 'pull',
        'fetch', 'log', 'show', 'branch', 'merge', 'rebase', 'reset', 'remote',
        'init', 'config', 'ls-files', 'ls-tree', 'cat-file', 'hash-object',
        'rev-parse', 'name-rev', 'describe', 'tag', 'stash', 'clean'
      ],
      blockedArgs: [
        'config --global', 'config --system', 'gc', 'prune', 'fsck',
        'receive-pack', 'upload-pack', 'daemon', 'shell', 'imap-send'
      ]
    });

    // NPM commands - allowed for development
    this.addRule({
      name: 'npm',
      allowed: true,
      description: 'Node Package Manager operations',
      securityLevel: 'medium',
      requiresWorkspace: true,
      maxExecutionTime: 60000,
      allowedArgs: [
        'test', 'install', 'run', 'start', 'build', 'clean-install',
        'ci', 'audit', 'ls', 'view', 'pack', 'version', 'help'
      ],
      blockedArgs: [
        'config set', 'config delete', 'unlink', 'uninstall', 'publish',
        'access', 'owner', 'team', 'org', 'token', 'login', 'logout', 'adduser'
      ]
    });

    // Node.js - allowed for script execution
    this.addRule({
      name: 'node',
      allowed: true,
      description: 'Node.js runtime',
      securityLevel: 'medium',
      requiresWorkspace: true,
      maxExecutionTime: 120000,
      allowedArgs: [],
      blockedArgs: [
        '--inspect', '--inspect-brk', '--debug', '--debug-brk',
        '--expose-gc', '--prof', '--prof-process'
      ]
    });

    // Echo command - allowed for basic output
    this.addRule({
      name: 'echo',
      allowed: true,
      description: 'Echo command for basic output',
      securityLevel: 'low',
      requiresWorkspace: false,
      maxExecutionTime: 5000,
      allowedArgs: [],
      blockedArgs: []
    });

    // Shell commands - limited set
    this.addRule({
      name: 'sh',
      allowed: true,
      description: 'Shell interpreter (limited usage)',
      securityLevel: 'high',
      requiresWorkspace: true,
      maxExecutionTime: 10000,
      allowedArgs: ['-c'],
      blockedArgs: []
    });

    this.addRule({
      name: 'bash',
      allowed: true,
      description: 'Bash interpreter (limited usage)',
      securityLevel: 'high',
      requiresWorkspace: true,
      maxExecutionTime: 10000,
      allowedArgs: ['-c'],
      blockedArgs: []
    });

    // System information commands - blocked
    ['whoami', 'id', 'uname', 'hostname', 'env', 'printenv', 'export'].forEach(cmd => {
      this.addRule({
        name: cmd,
        allowed: false,
        description: 'Blocked system command: ' + cmd,
        securityLevel: 'critical',
        requiresWorkspace: false
      });
    });

    // Privileged commands - blocked
    ['sudo', 'su', 'doas', 'pkexec'].forEach(cmd => {
      this.addRule({
        name: cmd,
        allowed: false,
        description: 'Blocked privilege escalation command: ' + cmd,
        securityLevel: 'critical',
        requiresWorkspace: false
      });
    });

    // Network reconnaissance commands - blocked
    ['netstat', 'ss', 'lsof', 'nmap', 'ping', 'traceroute', 'dig', 'nslookup'].forEach(cmd => {
      this.addRule({
        name: cmd,
        allowed: false,
        description: 'Blocked network reconnaissance command: ' + cmd,
        securityLevel: 'high',
        requiresWorkspace: false
      });
    });

    // File system commands - limited
    this.addRule({
      name: 'ls',
      allowed: true,
      description: 'List directory contents',
      securityLevel: 'low',
      requiresWorkspace: true,
      allowedArgs: ['-la', '-l', '-a'],
      blockedArgs: ['-R', '--recursive']
    });

    this.addRule({
      name: 'cat',
      allowed: true,
      description: 'Display file contents',
      securityLevel: 'medium',
      requiresWorkspace: true,
      blockedPaths: [
        '/etc/passwd', '/etc/shadow', '/etc/sudoers', '/etc/hosts',
        '/root/', '/home/', '/proc/', '/sys/', '/dev/'
      ]
    });

    this.addRule({
      name: 'find',
      allowed: false,
      description: 'Find command - blocked for security',
      securityLevel: 'high',
      requiresWorkspace: false
    });

    // Package managers - limited
    this.addRule({
      name: 'apt',
      allowed: false,
      description: 'APT package manager - blocked',
      securityLevel: 'critical',
      requiresWorkspace: false
    });

    this.addRule({
      name: 'yum',
      allowed: false,
      description: 'YUM package manager - blocked',
      securityLevel: 'critical',
      requiresWorkspace: false
    });

    // Development tools - allowed
    this.addRule({
      name: 'tsc',
      allowed: true,
      description: 'TypeScript compiler',
      securityLevel: 'low',
      requiresWorkspace: true,
      maxExecutionTime: 30000
    });

    this.addRule({
      name: 'jest',
      allowed: true,
      description: 'Jest test runner',
      securityLevel: 'low',
      requiresWorkspace: true,
      maxExecutionTime: 60000
    });
  }

  /**
   * Add a command rule to the registry
   */
  addRule(rule: CommandRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Get a command rule by name
   */
  getRule(name: string): CommandRule | undefined {
    return this.rules.get(name);
  }

  /**
   * Get all rules
   */
  getAllRules(): CommandRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Check if a command execution is allowed
   */
  validateCommand(context: CommandExecutionContext): CommandValidationResult {
    this.metrics.totalCommands++;

    const command = this.extractCommandName(context.command);
    const rule = this.rules.get(command);

    if (!rule) {
      // Unknown command - block by default
      const violation = {
        type: 'command_blocked' as const,
        details: 'Unknown command: ' + command,
        severity: 'high' as const
      };

      this.recordViolation(command, violation);
      return { allowed: false, violation };
    }

    if (!rule.allowed) {
      const violation = {
        type: 'command_blocked' as const,
        details: 'Command explicitly blocked: ' + command,
        severity: rule.securityLevel
      };

      this.recordViolation(command, violation);
      return { allowed: false, rule, violation };
    }

    // Check arguments
    const argsValidation = this.validateArguments(command, context.args, rule);
    if (!argsValidation.allowed) {
      this.recordViolation(command, argsValidation.violation!);
      return { allowed: false, rule, violation: argsValidation.violation };
    }

    // Check working directory if required
    if (rule.requiresWorkspace && !context.workingDirectory) {
      const violation = {
        type: 'path_blocked' as const,
        details: 'Command ' + command + ' requires working directory',
        severity: 'medium' as const
      };

      this.recordViolation(command, violation);
      return { allowed: false, rule, violation };
    }

    // Check execution timeout
    const timeout = context.timeout || rule.maxExecutionTime || 30000;
    if (timeout > (rule.maxExecutionTime || 60000)) {
      const violation = {
        type: 'timeout_exceeded' as const,
        details: 'Execution timeout ' + timeout + 'ms exceeds maximum ' + (rule.maxExecutionTime || 60000) + 'ms',
        severity: 'medium' as const
      };

      this.recordViolation(command, violation);
      return { allowed: false, rule, violation };
    }

    // Check paths
    if (context.workingDirectory) {
      const pathValidation = this.validatePaths(context.workingDirectory, rule);
      if (!pathValidation.allowed) {
        this.recordViolation(command, pathValidation.violation!);
        return { allowed: false, rule, violation: pathValidation.violation };
      }
    }

    this.metrics.allowedCommands++;
    return {
      allowed: true,
      rule,
      sanitizedArgs: argsValidation.sanitizedArgs,
      executionContext: {
        ...context,
        timeout: Math.min(timeout, rule.maxExecutionTime || 60000)
      }
    };
  }

  /**
   * Extract base command name from full path
   */
  private extractCommandName(command: string): string {
    // Handle full paths like /usr/bin/git
    const parts = command.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Validate command arguments
   */
  /**
   * Validate command arguments
   */
  private validateArguments(command: string, args: string[], rule: CommandRule): {
    allowed: boolean;
    sanitizedArgs?: string[];
    violation?: any;
  } {
    const sanitizedArgs: string[] = [];

    for (const arg of args) {
      // Sanitize dangerous patterns FIRST - this applies to ALL commands
      if (arg.includes('..') || arg.includes('$(') || arg.includes('`') || arg.includes('|')) {
        return {
          allowed: false,
          violation: {
            type: 'args_blocked',
            details: 'Dangerous argument pattern detected: \'' + arg + '\'',
            severity: 'high'
          }
        };
      }

      // Check blocked arguments
      if (rule.blockedArgs?.some(blocked => arg.includes(blocked))) {
        return {
          allowed: false,
          violation: {
            type: 'args_blocked',
            details: 'Blocked argument \'' + arg + '\' for command ' + command,
            severity: rule.securityLevel
          }
        };
      }

      // Check if argument is explicitly allowed (only if allowedArgs is specified)
      if (rule.allowedArgs && rule.allowedArgs.length > 0) {
        const isAllowed = rule.allowedArgs.some(allowed => {
          if (allowed === arg) return true;
          if (allowed.endsWith('*') && arg.startsWith(allowed.slice(0, -1))) return true;
          return false;
        });

        if (!isAllowed) {
          return {
            allowed: false,
            violation: {
              type: 'args_blocked',
              details: 'Argument \'' + arg + '\' not in allowed list for command ' + command,
              severity: 'medium'
            }
          };
        }
      }

      sanitizedArgs.push(arg);
    }

    return { allowed: true, sanitizedArgs };
  }

  /**
   * Validate working directory paths
   */
  private validatePaths(workingDir: string, rule: CommandRule): {
    allowed: boolean;
    violation?: any;
  } {
    // Check blocked paths
    if (rule.blockedPaths) {
      for (const blockedPath of rule.blockedPaths) {
        if (workingDir.startsWith(blockedPath) || workingDir.includes(blockedPath)) {
          return {
            allowed: false,
            violation: {
              type: 'path_blocked',
              details: 'Access to blocked path \'' + blockedPath + '\' denied',
              severity: 'high'
            }
          };
        }
      }
    }

    // Ensure working directory is within reasonable bounds
    if (workingDir.includes('..') || workingDir.startsWith('/etc') || 
        workingDir.startsWith('/root') || workingDir.startsWith('/home')) {
      return {
        allowed: false,
        violation: {
          type: 'path_blocked',
          details: 'Access to sensitive path \'' + workingDir + '\' denied',
          severity: 'high'
        }
      };
    }

    return { allowed: true };
  }

  /**
   * Record a security violation
   */
  private recordViolation(command: string, violation: any): void {
    this.metrics.blockedCommands++;

    const violationType = violation.type;
    this.metrics.violationsByType[violationType] = (this.metrics.violationsByType[violationType] || 0) + 1;
    this.metrics.violationsByCommand[command] = (this.metrics.violationsByCommand[command] || 0) + 1;

    this.emit('commandViolation', {
      command,
      violation,
      timestamp: Date.now()
    });
  }

  /**
   * Track command execution start
   */
  trackExecutionStart(command: string): string {
    const executionId = command + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.activeExecutions.add(executionId);
    this.metrics.activeCommands = this.activeExecutions.size;
    return executionId;
  }

  /**
   * Track command execution completion
   */
  trackExecutionEnd(executionId: string, executionTime: number): void {
    this.activeExecutions.delete(executionId);
    this.metrics.activeCommands = this.activeExecutions.size;
    
    this.executionTimes.push(executionTime);
    // Keep only last 100 execution times for average calculation
    if (this.executionTimes.length > 100) {
      this.executionTimes.shift();
    }
    
    this.metrics.averageExecutionTime = 
      this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length;
  }

  /**
   * Get security metrics
   */
  getMetrics(): CommandSecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset security metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalCommands: 0,
      allowedCommands: 0,
      blockedCommands: 0,
      violationsByType: {},
      violationsByCommand: {},
      averageExecutionTime: 0,
      activeCommands: 0
    };
    this.executionTimes = [];
  }
}

export const commandRegistry = new CommandRegistry();
