// ABOUTME: Helper utilities for creating and managing temporary repositories for beads testing.
// ABOUTME: Provides isolated testing environments with git and beads initialization.

import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TempRepoOptions {
  /**
   * Base directory for creating temp repositories.
   * Defaults to current working directory.
   */
  baseDir?: string;
  /**
   * Whether to initialize git repository.
   * @default true
   */
  initGit?: boolean;
  /**
   * Whether to initialize beads.
   * @default true
   */
  initBeads?: boolean;
  /**
   * Git user name for configuration.
   * @default "Test User"
   */
  gitUserName?: string;
  /**
   * Git user email for configuration.
   * @default "test@example.com"
   */
  gitUserEmail?: string;
}

export interface TempRepo {
  /**
   * Path to the temporary repository.
   */
  path: string;
  /**
   * Initialize the repository with git and beads.
   */
  init(): Promise<void>;
  /**
   * Clean up the temporary repository.
   */
  cleanup(): Promise<void>;
  /**
   * Execute a command in the repository.
   */
  execCommand(command: string, args: string[]): Promise<string>;
  /**
   * Create a beads task.
   */
  createBeadsTask(title: string, options?: { constraint?: string; files?: string[] }): Promise<void>;
  /**
   * Get beads tasks.
   */
  getBeadsTasks(options?: { constraint?: string }): Promise<any[]>;
}

/**
 * Create a temporary repository for testing.
 */
export async function createTempRepo(options: TempRepoOptions = {}): Promise<TempRepo> {
  const {
    baseDir = process.cwd(),
    initGit = true,
    initBeads = true,
    gitUserName = 'Test User',
    gitUserEmail = 'test@example.com',
  } = options;

  // Create temporary directory
  const path = await mkdtemp(join(baseDir, '.maf-test-repo-'));

  const tempRepo: TempRepo = {
    path,
    
    async init(): Promise<void> {
      if (initGit) {
        await this.execCommand('git', ['init']);
        await this.execCommand('git', ['config', 'user.name', gitUserName]);
        await this.execCommand('git', ['config', 'user.email', gitUserEmail]);
      }

      if (initBeads) {
        await this.execCommand('bd', ['init']);
      }
    },

    async cleanup(): Promise<void> {
      try {
        await rm(path, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup temp repo:', error);
      }
    },

    async execCommand(command: string, args: string[]): Promise<string> {
      const { stdout } = await execFileAsync(command, args, { cwd: path });
      return stdout.trim();
    },

    async createBeadsTask(title: string, options?: { constraint?: string; files?: string[] }): Promise<void> {
      const args = ['create', title];
      if (options?.constraint) {
        args.push('--label', options.constraint);
      }
      if (options?.files && options.files.length > 0) {
        args.push('--files', options.files.join(','));
      }
      await this.execCommand('bd', args);
    },

    async getBeadsTasks(options?: { constraint?: string }): Promise<any[]> {
      const args = ['ready', '--json'];
      if (options?.constraint) {
        args.push('--label', options.constraint);
      }
      
      const output = await this.execCommand('bd', args);
      if (!output) {
        return [];
      }
      
      try {
        return JSON.parse(output);
      } catch (error) {
        throw new Error('Failed to parse beads ready output: ' + (error as Error).message + '\\n' + output);
      }
    },
  };

  return tempRepo;
}

/**
 * Create a temporary repository with automatic cleanup.
 * Useful for test setup/teardown.
 */
export async function withTempRepo<T>(
  testFn: (repo: TempRepo) => Promise<T>,
  options?: TempRepoOptions
): Promise<T> {
  const repo = await createTempRepo(options);
  
  try {
    await repo.init();
    return await testFn(repo);
  } finally {
    await repo.cleanup();
  }
}

/**
 * Create multiple temporary repositories for multi-agent testing.
 */
export async function createTempRepos(count: number, options?: TempRepoOptions): Promise<TempRepo[]> {
  const repos: TempRepo[] = [];
  
  try {
    for (let i = 0; i < count; i++) {
      const repo = await createTempRepo(options);
      await repo.init();
      repos.push(repo);
    }
    return repos;
  } catch (error) {
    // Cleanup any repos that were created if there is an error
    await Promise.all(repos.map(repo => repo.cleanup()));
    throw error;
  }
}

/**
 * Utility to create beads tasks in bulk for testing.
 */
export interface BeadsTaskTemplate {
  title: string;
  constraint?: string;
  files?: string[];
}

export async function createBeadsTasks(
  repo: TempRepo,
  templates: BeadsTaskTemplate[]
): Promise<void> {
  await Promise.all(
    templates.map(template => 
      repo.createBeadsTask(template.title, {
        constraint: template.constraint,
        files: template.files,
      })
    )
  );
}

/**
 * Utility to validate beads workflow in a repository.
 */
export async function validateBeadsWorkflow(repo: TempRepo): Promise<{
  hasGit: boolean;
  hasBeads: boolean;
  canCreateTasks: boolean;
  canListTasks: boolean;
}> {
  const results = {
    hasGit: false,
    hasBeads: false,
    canCreateTasks: false,
    canListTasks: false,
  };

  try {
    // Check git
    await repo.execCommand('git', ['rev-parse', '--git-dir']);
    results.hasGit = true;
  } catch (error) {
    // Git not available
  }

  try {
    // Check beads
    const beadsDir = join(repo.path, '.beads');
    await readFile(join(beadsDir, 'config.json'), 'utf-8');
    results.hasBeads = true;
  } catch (error) {
    // Beads not available
  }

  try {
    // Test task creation
    await repo.createBeadsTask('Test task for validation', { constraint: 'validation' });
    results.canCreateTasks = true;

    // Test task listing
    const tasks = await repo.getBeadsTasks({ constraint: 'validation' });
    results.canListTasks = tasks.length > 0;
  } catch (error) {
    // Task operations not working
  }

  return results;
}
