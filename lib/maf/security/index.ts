// ABOUTME: MAF Security Module - Application-level filesystem security controls
// ABOUTME: Centralized export point for all MAF security components

import { promises as fs } from 'fs';
import { join, dirname, resolve, normalize } from 'path';

export interface PathValidationResult {
  isValid: boolean;
  normalizedPath?: string;
  violation?: {
    type: 'traversal' | 'sensitive' | 'permission' | 'size_limit';
    details: string;
    riskLevel: 'high' | 'medium' | 'low';
  };
}

export interface SecureWorkspaceOptions {
  taskId: string;
  basePath?: string;
  maxFileSize?: number;
  autoCleanup?: boolean;
}

export class SecureWorkspace {
  private readonly workspacePath: string;
  private readonly options: Required<SecureWorkspaceOptions>;
  private metrics = { totalOperations: 0, blockedOperations: 0 };

  constructor(options: SecureWorkspaceOptions) {
    this.options = {
      basePath: options.basePath || '/tmp',
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024,
      autoCleanup: options.autoCleanup !== false,
      taskId: options.taskId
    };

    this.workspacePath = join(this.options.basePath, `maf-${this.options.taskId}`);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workspacePath, { recursive: true });
    await fs.chmod(this.workspacePath, 0o700);
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }

  async writeFile(filePath: string, data: string | Buffer): Promise<void> {
    this.metrics.totalOperations++;
    
    if (!this.validatePath(filePath).isValid) {
      this.metrics.blockedOperations++;
      throw new Error('Path validation failed');
    }

    const fullPath = join(this.workspacePath, filePath);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
  }

  async readFile(filePath: string): Promise<Buffer> {
    this.metrics.totalOperations++;
    
    if (!this.validatePath(filePath).isValid) {
      this.metrics.blockedOperations++;
      throw new Error('Path validation failed');
    }

    const fullPath = join(this.workspacePath, filePath);
    return await fs.readFile(fullPath);
  }

  async exists(filePath: string): Promise<boolean> {
    this.metrics.totalOperations++;
    
    if (!this.validatePath(filePath).isValid) {
      this.metrics.blockedOperations++;
      return false;
    }

    const fullPath = join(this.workspacePath, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(dirPath: string = '.'): Promise<string[]> {
    this.metrics.totalOperations++;
    
    if (!this.validatePath(dirPath).isValid) {
      this.metrics.blockedOperations++;
      throw new Error('Path validation failed');
    }

    const fullPath = join(this.workspacePath, dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => entry.name);
  }

  private validatePath(filePath: string): PathValidationResult {
    // Basic path traversal protection
    if (filePath.includes('../') || filePath.includes('..\\')) {
      return {
        isValid: false,
        violation: {
          type: 'traversal',
          details: `Path traversal detected: ${filePath}`,
          riskLevel: 'high'
        }
      };
    }

    // Check for absolute paths trying to escape
    if (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)) {
      return {
        isValid: false,
        violation: {
          type: 'permission',
          details: `Absolute paths not allowed: ${filePath}`,
          riskLevel: 'medium'
        }
      };
    }

    return { isValid: true };
  }

  getSecurityMetrics() {
    return { ...this.metrics };
  }

  async cleanup(): Promise<void> {
    try {
      if (this.options.autoCleanup) {
        await fs.rmdir(this.workspacePath, { recursive: true });
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

export function createSecureWorkspace(taskId: string): SecureWorkspace {
  return new SecureWorkspace({ taskId });
}

export function createSecureWorkdir(taskId: string): string {
  return `/tmp/maf-${taskId}`;
}

export const SECURITY_CONSTANTS = {
  DEFAULT_MAX_FILE_SIZE: 50 * 1024 * 1024,
  SECURITY_OVERHEAD_TARGET: 0.05,
  BLOCKED_PATHS: ['/etc/passwd', '/etc/shadow', '/root', '/sys', '/proc']
} as const;

// Process Security Components
export { seccompPolicyManager, SeccompPolicyManager } from './seccomp-policy';
export { commandRegistry, CommandRegistry } from './command-registry';
export { secureExecutor, SecureExecutor } from './secure-executor';

export type {
  SyscallRule,
  SeccompProfile,
  SecurityViolationEvent
} from './seccomp-policy';

export type {
  CommandRule,
  CommandExecutionContext,
  CommandValidationResult,
  CommandSecurityMetrics
} from './command-registry';

export type {
  SecureExecutionOptions,
  SecureExecutionResult,
  ProcessSecurityMetrics
} from './secure-executor';

// Path validator for secure file operations
export function createSecurePathValidator() {
  return {
    validatePath: (path: string): PathValidationResult => {
      // Basic path traversal protection
      if (path.includes('../') || path.includes('..\\')) {
        return {
          isValid: false,
          violation: {
            type: 'traversal',
            details: 'Path traversal detected: ' + path,
            riskLevel: 'high'
          }
        };
      }

      // Check for absolute paths trying to escape
      if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
        return {
          isValid: false,
          violation: {
            type: 'permission',
            details: 'Absolute paths not allowed: ' + path,
            riskLevel: 'medium'
          }
        };
      }

      return { isValid: true, normalizedPath: path };
    }
  };
}
