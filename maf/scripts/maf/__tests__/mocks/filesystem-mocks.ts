// ABOUTME: Mock factory for filesystem operations (.maf/agents.json reads/writes)
// ABOUTME: Provides in-memory filesystem simulation for agent registry operations

import { jest } from '@jest/globals';

export interface MockFileSystemState {
  files: Map<string, string>;
  directories: Set<string>;
  accessErrors: Set<string>;
  readErrors: Set<string>;
  writeErrors: Set<string>;
}

export class FileSystemMockFactory {
  private state: MockFileSystemState = {
    files: new Map(),
    directories: new Set(),
    accessErrors: new Set(),
    readErrors: new Set(),
    writeErrors: new Set()
  };

  /**
   * Create mock for fs/promises.access
   */
  createMockAccess() {
    return jest.fn().mockImplementation((path: string) => {
      if (this.state.accessErrors.has(path)) {
        return Promise.reject(new Error(`ENOENT: no such file or directory, access '${path}'`));
      }

      const exists = this.state.files.has(path) || this.state.directories.has(path);
      if (exists) {
        return Promise.resolve();
      } else {
        return Promise.reject(new Error(`ENOENT: no such file or directory, access '${path}'`));
      }
    });
  }

  /**
   * Create mock for fs/promises.readFile
   */
  createMockReadFile() {
    return jest.fn().mockImplementation((path: string, encoding?: string) => {
      if (this.state.readErrors.has(path)) {
        return Promise.reject(new Error(`EIO: i/o error, read '${path}'`));
      }

      const content = this.state.files.get(path);
      if (content !== undefined) {
        return Promise.resolve(content);
      } else {
        return Promise.reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
      }
    });
  }

  /**
   * Create mock for fs/promises.writeFile
   */
  createMockWriteFile() {
    return jest.fn().mockImplementation((path: string, data: string | Buffer, encoding?: any) => {
      if (this.state.writeErrors.has(path)) {
        return Promise.reject(new Error(`EACCES: permission denied, open '${path}'`));
      }

      const content = typeof data === 'string' ? data : data.toString();
      this.state.files.set(path, content);
      
      // Ensure parent directory exists
      const parts = path.split('/');
      parts.pop(); // Remove filename
      const parentDir = parts.join('/');
      if (parentDir && !this.state.directories.has(parentDir)) {
        this.state.directories.add(parentDir);
      }

      return Promise.resolve();
    });
  }

  /**
   * Create mock for fs.existsSync
   */
  createMockExistsSync() {
    return jest.fn().mockImplementation((path: string) => {
      return this.state.files.has(path) || this.state.directories.has(path);
    });
  }

  /**
   * Create mock for fs.mkdirSync
   */
  createMockMkdirSync() {
    return jest.fn().mockImplementation((path: string, options?: any) => {
      this.state.directories.add(path);
    });
  }

  /**
   * Create mock for fs.rmSync
   */
  createMockRmSync() {
    return jest.fn().mockImplementation((path: string, options?: any) => {
      if (options?.recursive) {
        // Remove directory and all contents
        const prefix = path.endsWith('/') ? path : path + '/';
        const keysToDelete: string[] = [];
        
        for (const filePath of this.state.files.keys()) {
          if (filePath === path || filePath.startsWith(prefix)) {
            keysToDelete.push(filePath);
          }
        }
        
        for (const key of keysToDelete) {
          this.state.files.delete(key);
        }
        
        for (const dirPath of this.state.directories) {
          if (dirPath === path || dirPath.startsWith(prefix)) {
            this.state.directories.delete(dirPath);
          }
        }
      } else {
        this.state.files.delete(path);
        this.state.directories.delete(path);
      }
    });
  }

  /**
   * Set file content
   */
  setFile(path: string, content: string): void {
    this.state.files.set(path, content);
  }

  /**
   * Get file content
   */
  getFile(path: string): string | undefined {
    return this.state.files.get(path);
  }

  /**
   * Delete file
   */
  deleteFile(path: string): boolean {
    return this.state.files.delete(path);
  }

  /**
   * Check if file exists
   */
  hasFile(path: string): boolean {
    return this.state.files.has(path);
  }

  /**
   * Create directory
   */
  createDirectory(path: string): void {
    this.state.directories.add(path);
  }

  /**
   * Check if directory exists
   */
  hasDirectory(path: string): boolean {
    return this.state.directories.has(path);
  }

  /**
   * Set access error for path
   */
  setAccessError(path: string): void {
    this.state.accessErrors.add(path);
  }

  /**
   * Set read error for path
   */
  setReadError(path: string): void {
    this.state.readErrors.add(path);
  }

  /**
   * Set write error for path
   */
  setWriteError(path: string): void {
    this.state.writeErrors.add(path);
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.state.accessErrors.clear();
    this.state.readErrors.clear();
    this.state.writeErrors.clear();
  }

  /**
   * Get all files
   */
  getAllFiles(): Map<string, string> {
    return new Map(this.state.files);
  }

  /**
   * Get all directories
   */
  getAllDirectories(): Set<string> {
    return new Set(this.state.directories);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.state.files.clear();
    this.state.directories.clear();
    this.state.accessErrors.clear();
    this.state.readErrors.clear();
    this.state.writeErrors.clear();
  }

  /**
   * Create realistic test scenarios
   */
  static createTestScenarios() {
    return {
      normalRegistry: () => {
        const factory = new FileSystemMockFactory();
        factory.setFile(
          '.maf/agents.json',
          JSON.stringify({
            agents: [
              {
                agentId: 'worker-001',
                agentType: 'claude-worker',
                status: 'active',
                lastSeen: Date.now(),
                tmuxSession: 'maf-agent-worker-001'
              }
            ]
          }, null, 2)
        );
        factory.createDirectory('.maf');
        return factory;
      },

      emptyRegistry: () => {
        const factory = new FileSystemMockFactory();
        factory.setFile(
          '.maf/agents.json',
          JSON.stringify({ agents: [] }, null, 2)
        );
        factory.createDirectory('.maf');
        return factory;
      },

      missingRegistry: () => {
        const factory = new FileSystemMockFactory();
        factory.createDirectory('.maf');
        return factory;
      },

      corruptedRegistry: () => {
        const factory = new FileSystemMockFactory();
        factory.setFile('.maf/agents.json', 'invalid json {');
        factory.createDirectory('.maf');
        return factory;
      },

      permissionDenied: () => {
        const factory = new FileSystemMockFactory();
        factory.setWriteError('.maf/agents.json');
        factory.createDirectory('.maf');
        return factory;
      }
    };
  }

  /**
   * Create agent registry data helper
   */
  static createAgentRegistryData(agents: any[]) {
    return JSON.stringify({ agents }, null, 2);
  }

  /**
   * Parse agent registry data helper
   */
  static parseAgentRegistryData(data: string): { agents: any[] } {
    try {
      return JSON.parse(data);
    } catch {
      return { agents: [] };
    }
  }
}

/**
 * Utility function to create filesystem mock for tests
 */
export function createFileSystemMock(): FileSystemMockFactory {
  return new FileSystemMockFactory();
}

/**
 * Pre-configured mock scenarios
 */
export const FILESYSTEM_SCENARIOS = FileSystemMockFactory.createTestScenarios();
