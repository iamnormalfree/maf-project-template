// ABOUTME: Seccomp-bpf syscall filtering policy for MAF process security
// ABOUTME: Implements hybrid approach with whitelist and blacklist syscall rules

import { EventEmitter } from 'events';

export interface SyscallRule {
  action: 'allow' | 'deny' | 'log';
  syscall: number | string;
  args?: Array<{
    index: number;
    op: 'eq' | 'ne' | 'gt' | 'lt' | 'masked_eq';
    value: number | string;
    mask?: number;
  }>;
}

export interface SeccompProfile {
  name: string;
  description: string;
  defaultAction: 'allow' | 'deny';
  rules: SyscallRule[];
  enforcementMode: 'strict' | 'monitoring' | 'permissive';
}

export interface SecurityViolationEvent {
  violation_type: 'privilege_escalation' | 'unauthorized_syscall' | 'resource_access';
  syscall: string;
  pid: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action_taken: 'blocked' | 'logged' | 'modified';
  args?: any[];
  timestamp: number;
}

/**
 * Seccomp Policy Manager - Provides syscall filtering profiles for different security contexts
 */
export class SeccompPolicyManager extends EventEmitter {
  private profiles: Map<string, SeccompProfile> = new Map();
  private activeProfile?: SeccompProfile;
  private metrics = {
    totalSyscalls: 0,
    blockedSyscalls: 0,
    loggedViolations: 0,
    violationsByType: new Map<string, number>()
  };

  constructor() {
    super();
    this.initializeDefaultProfiles();
  }

  private initializeDefaultProfiles(): void {
    // Git operations profile - allows git-specific syscalls
    this.profiles.set('git-operations', {
      name: 'git-operations',
      description: 'Syscall filtering for git operations (clone, checkout, status, diff)',
      defaultAction: 'deny',
      enforcementMode: 'strict',
      rules: [
        // File operations
        { action: 'allow', syscall: 'openat' },
        { action: 'allow', syscall: 'read' },
        { action: 'allow', syscall: 'write' },
        { action: 'allow', syscall: 'close' },
        { action: 'allow', syscall: 'lseek' },
        { action: 'allow', syscall: 'fstat' },
        { action: 'allow', syscall: 'statx' },
        { action: 'allow', syscall: 'newfstatat' },
        
        // Directory operations
        { action: 'allow', syscall: 'getdents64' },
        { action: 'allow', syscall: 'mkdir' },
        { action: 'allow', syscall: 'rmdir' },
        { action: 'allow', syscall: 'unlink' },
        { action: 'allow', syscall: 'rename' },
        { action: 'allow', syscall: 'symlink' },
        { action: 'allow', syscall: 'readlink' },
        
        // Process operations
        { action: 'allow', syscall: 'exit_group' },
        { action: 'allow', syscall: 'exit' },
        { action: 'allow', syscall: 'rt_sigaction' },
        { action: 'allow', syscall: 'rt_sigprocmask' },
        { action: 'allow', syscall: 'rt_sigreturn' },
        
        // Memory operations
        { action: 'allow', syscall: 'mmap' },
        { action: 'allow', syscall: 'munmap' },
        { action: 'allow', syscall: 'mprotect' },
        { action: 'allow', syscall: 'brk' },
        
        // Network operations (for remote git repos)
        { action: 'allow', syscall: 'socket' },
        { action: 'allow', syscall: 'connect' },
        { action: 'allow', syscall: 'bind' },
        { action: 'allow', syscall: 'listen' },
        { action: 'allow', syscall: 'accept' },
        { action: 'allow', syscall: 'sendto' },
        { action: 'allow', syscall: 'recvfrom' },
        { action: 'allow', syscall: 'shutdown' },
        
        // Exec operations (for spawning git processes)
        { action: 'allow', syscall: 'execve', args: [
          { index: 0, op: 'masked_eq', value: '/usr/bin/git', mask: 0xfff }
        ]},
        
        // Time operations
        { action: 'allow', syscall: 'clock_gettime' },
        { action: 'allow', syscall: 'nanosleep' },
        
        // Information
        { action: 'allow', syscall: 'uname' },
        { action: 'allow', syscall: 'getpid' },
        { action: 'allow', syscall: 'getuid' },
        { action: 'allow', syscall: 'geteuid' },
        { action: 'allow', syscall: 'getgid' },
        { action: 'allow', syscall: 'getegid' },
        
        // explicitly block privilege escalation
        { action: 'deny', syscall: 'setuid' },
        { action: 'deny', syscall: 'seteuid' },
        { action: 'deny', syscall: 'setgid' },
        { action: 'deny', syscall: 'setegid' },
        { action: 'deny', syscall: 'setreuid' },
        { action: 'deny', syscall: 'setregid' },
        { action: 'deny', syscall: 'setresuid' },
        { action: 'deny', syscall: 'setresgid' },
        { action: 'deny', syscall: 'chroot' },
        { action: 'deny', syscall: 'pivot_root' },
      ]
    });

    // NPM test profile - allows npm and node execution
    this.profiles.set('npm-test', {
      name: 'npm-test',
      description: 'Syscall filtering for npm test execution',
      defaultAction: 'deny',
      enforcementMode: 'strict',
      rules: [
        // File operations
        { action: 'allow', syscall: 'openat' },
        { action: 'allow', syscall: 'read' },
        { action: 'allow', syscall: 'write' },
        { action: 'allow', syscall: 'close' },
        { action: 'allow', syscall: 'lseek' },
        { action: 'allow', syscall: 'fstat' },
        { action: 'allow', syscall: 'statx' },
        { action: 'allow', syscall: 'newfstatat' },
        
        // Directory operations
        { action: 'allow', syscall: 'getdents64' },
        { action: 'allow', syscall: 'mkdir' },
        { action: 'allow', syscall: 'rmdir' },
        { action: 'allow', syscall: 'unlink' },
        { action: 'allow', syscall: 'rename' },
        
        // Process operations
        { action: 'allow', syscall: 'exit_group' },
        { action: 'allow', syscall: 'exit' },
        { action: 'allow', syscall: 'rt_sigaction' },
        { action: 'allow', syscall: 'rt_sigprocmask' },
        { action: 'allow', syscall: 'rt_sigreturn' },
        { action: 'allow', syscall: 'clone' },
        { action: 'allow', syscall: 'fork' },
        { action: 'allow', syscall: 'vfork' },
        { action: 'allow', syscall: 'wait4' },
        { action: 'allow', syscall: 'waitpid' },
        { action: 'allow', syscall: 'kill' },
        
        // Memory operations
        { action: 'allow', syscall: 'mmap' },
        { action: 'allow', syscall: 'munmap' },
        { action: 'allow', syscall: 'mprotect' },
        { action: 'allow', syscall: 'brk' },
        
        // Exec operations (for npm and node)
        { action: 'allow', syscall: 'execve', args: [
          { index: 0, op: 'masked_eq', value: '/usr/bin/npm', mask: 0xfff }
        ]},
        { action: 'allow', syscall: 'execve', args: [
          { index: 0, op: 'masked_eq', value: '/usr/bin/node', mask: 0xfff }
        ]},
        { action: 'allow', syscall: 'execve', args: [
          { index: 0, op: 'masked_eq', value: '/bin/sh', mask: 0xfff }
        ]},
        
        // Time operations
        { action: 'allow', syscall: 'clock_gettime' },
        { action: 'allow', syscall: 'nanosleep' },
        
        // System information
        { action: 'allow', syscall: 'uname' },
        { action: 'allow', syscall: 'getpid' },
        { action: 'allow', syscall: 'getuid' },
        { action: 'allow', syscall: 'geteuid' },
        { action: 'allow', syscall: 'getgid' },
        { action: 'allow', syscall: 'getegid' },
        { action: 'allow', syscall: 'getrlimit' },
        { action: 'allow', syscall: 'getrusage' },
        
        // Threading (for Jest)
        { action: 'allow', syscall: 'futex' },
        { action: 'allow', syscall: 'set_robust_list' },
        { action: 'allow', syscall: 'get_robust_list' },
        
        // explicitly block privilege escalation
        { action: 'deny', syscall: 'setuid' },
        { action: 'deny', syscall: 'seteuid' },
        { action: 'deny', syscall: 'setgid' },
        { action: 'deny', syscall: 'setegid' },
        { action: 'deny', syscall: 'setreuid' },
        { action: 'deny', syscall: 'setregid' },
        { action: 'deny', syscall: 'setresuid' },
        { action: 'deny', syscall: 'setresgid' },
        { action: 'deny', syscall: 'chroot' },
        { action: 'deny', syscall: 'pivot_root' },
        { action: 'deny', syscall: 'acct' },
      ]
    });

    // Restricted profile - minimal syscall set
    this.profiles.set('restricted', {
      name: 'restricted',
      description: 'Highly restrictive profile for sensitive operations',
      defaultAction: 'deny',
      enforcementMode: 'strict',
      rules: [
        // Basic file operations only
        { action: 'allow', syscall: 'read' },
        { action: 'allow', syscall: 'write' },
        { action: 'allow', syscall: 'close' },
        { action: 'allow', syscall: 'exit_group' },
        { action: 'allow', syscall: 'exit' },
        { action: 'allow', syscall: 'mmap' },
        { action: 'allow', syscall: 'munmap' },
        { action: 'allow', syscall: 'brk' },
        
        // Information only
        { action: 'allow', syscall: 'getpid' },
        { action: 'allow', syscall: 'getuid' },
        { action: 'allow', syscall: 'geteuid' },
        { action: 'allow', syscall: 'getgid' },
        { action: 'allow', syscall: 'getegid' },
        
        // Everything else is blocked by defaultAction: 'deny'
      ]
    });
  }

  /**
   * Get a security profile by name
   */
  getProfile(name: string): SeccompProfile | undefined {
    return this.profiles.get(name);
  }

  /**
   * Set active security profile
   */
  setActiveProfile(name: string): boolean {
    const profile = this.profiles.get(name);
    if (profile) {
      this.activeProfile = profile;
      return true;
    }
    return false;
  }

  /**
   * Get active security profile
   */
  getActiveProfile(): SeccompProfile | undefined {
    return this.activeProfile;
  }

  /**
   * Check if syscall is allowed under current profile
   */
  isSyscallAllowed(syscall: string, args?: any[]): {
    allowed: boolean;
    rule?: SyscallRule;
    violation?: SecurityViolationEvent;
  } {
    if (!this.activeProfile) {
      return { allowed: true }; // No profile = no filtering
    }

    this.metrics.totalSyscalls++;

    // Find matching rule
    const rule = this.activeProfile.rules.find(r => {
      if (typeof r.syscall === 'string') {
        return r.syscall === syscall;
      }
      return false; // Numeric syscall comparison would require system mapping
    });

    let action = rule?.action || this.activeProfile.defaultAction;
    let violation: SecurityViolationEvent | undefined;

    // Check args if rule has constraints
    if (rule && args && rule.args) {
      for (const argConstraint of rule.args) {
        if (args[argConstraint.index] !== undefined) {
          const argValue = args[argConstraint.index];
          let matches = false;

          switch (argConstraint.op) {
            case 'eq':
              matches = argValue === argConstraint.value;
              break;
            case 'ne':
              matches = argValue !== argConstraint.value;
              break;
            case 'gt':
              matches = argValue > argConstraint.value;
              break;
            case 'lt':
              matches = argValue < argConstraint.value;
              break;
            case 'masked_eq':
              matches = (argValue & (argConstraint.mask || 0xffffffff)) === argConstraint.value;
              break;
          }

          if (!matches) {
            action = this.activeProfile.defaultAction; // Fall back to default
          }
        }
      }
    }

    const allowed = action === 'allow';

    if (!allowed && this.activeProfile.enforcementMode !== 'permissive') {
      this.metrics.blockedSyscalls++;
      
      violation = {
        violation_type: 'unauthorized_syscall',
        syscall,
        pid: process.pid,
        severity: this.getViolationSeverity(syscall),
        action_taken: this.activeProfile.enforcementMode === 'monitoring' ? 'logged' : 'blocked',
        args,
        timestamp: Date.now()
      };

      const violationCount = this.metrics.violationsByType.get(syscall) || 0;
      this.metrics.violationsByType.set(syscall, violationCount + 1);
      this.metrics.loggedViolations++;

      this.emit('securityViolation', violation);
    }

    return { allowed, rule, violation };
  }

  /**
   * Get severity level for syscall violation
   */
  private getViolationSeverity(syscall: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalSyscalls = ['execve', 'setuid', 'setgid', 'chroot', 'ptrace'];
    const highSyscalls = ['open', 'write', 'socket', 'connect', 'bind'];
    const mediumSyscalls = ['read', 'stat', 'lseek'];

    if (criticalSyscalls.includes(syscall)) return 'critical';
    if (highSyscalls.includes(syscall)) return 'high';
    if (mediumSyscalls.includes(syscall)) return 'medium';
    return 'low';
  }

  /**
   * Get security metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      violationsByType: Object.fromEntries(this.metrics.violationsByType),
      activeProfile: this.activeProfile?.name
    };
  }

  /**
   * Reset security metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalSyscalls: 0,
      blockedSyscalls: 0,
      loggedViolations: 0,
      violationsByType: new Map()
    };
  }
}

export const seccompPolicyManager = new SeccompPolicyManager();
