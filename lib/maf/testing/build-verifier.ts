import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import type { BuildStatus, BuildVerifierOptions } from './types';

const DEFAULT_BUILD_DIR = 'dist';
const DEFAULT_SOURCE_DIRS = ['scripts/maf', 'lib/maf'];
const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TARGETS = [
  'dist/scripts/maf/preflight-check.js',
  'dist/scripts/maf/audit-guard.js',
  'dist/scripts/maf/escalate.js',
  'dist/scripts/maf/claim-task.js',
  'dist/scripts/maf/smoke-test.js',
  'dist/scripts/maf/top.js',
  'dist/scripts/maf/dashboard.js',
  'dist/scripts/maf/ci/review-gates.js'
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function getMostRecentMtime(paths: string[]): Promise<Date | null> {
  let latest = 0;

  for (const filePath of paths) {
    try {
      const stat = await fs.stat(filePath);
      latest = Math.max(latest, stat.mtimeMs);
    } catch {
      // Ignore missing files
    }
  }

  return latest > 0 ? new Date(latest) : null;
}

async function collectFiles(dir: string, predicate: (file: string) => boolean): Promise<string[]> {
  const collected: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectFiles(fullPath, predicate);
        collected.push(...nested);
      } else if (predicate(entry.name)) {
        collected.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist; treat as empty
  }

  return collected;
}

export class BuildVerifier {
  private readonly buildDirectory: string;
  private readonly sourceDirectories: string[];
  private readonly staleThresholdMs: number;
  private readonly requiredTargets: string[];

  constructor(options: BuildVerifierOptions = {}) {
    this.buildDirectory = options.buildDirectory || DEFAULT_BUILD_DIR;
    this.sourceDirectories = options.sourceDirectories || DEFAULT_SOURCE_DIRS;
    this.staleThresholdMs = options.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
    this.requiredTargets = options.requiredTargets || DEFAULT_TARGETS;
  }

  async checkBuildStatus(): Promise<BuildStatus> {
    const buildIndicatorFiles = await collectFiles(this.buildDirectory, (name) => name.endsWith('.js'));
    const lastBuildTime = await getMostRecentMtime(buildIndicatorFiles);
    const missingTargets = await this.getMissingTargets();
    const modifiedSources = await this.getModifiedSourcesSince(lastBuildTime ?? undefined);
    const timedOut = lastBuildTime
      ? Date.now() - lastBuildTime.getTime() > this.staleThresholdMs
      : true;

    const needsRebuild = timedOut || modifiedSources.length > 0 || missingTargets.length > 0;

    return {
      buildDirectory: this.buildDirectory,
      lastBuildTime: lastBuildTime?.getTime(),
      sourceFilesModified: modifiedSources,
      missingTargets,
      isFresh: !needsRebuild,
      needsRebuild
    };
  }

  async isBuildStale(): Promise<boolean> {
    const status = await this.checkBuildStatus();
    return status.needsRebuild;
  }

  private async getMissingTargets(): Promise<string[]> {
    const missing: string[] = [];

    for (const target of this.requiredTargets) {
      const exists = await fileExists(target);
      if (!exists) {
        missing.push(target);
      }
    }

    return missing;
  }

  private async getModifiedSourcesSince(lastBuildTime?: Date): Promise<string[]> {
    if (!lastBuildTime) {
      // If we don't have a build timestamp yet, treat all source files as modified.
      const allSources = await this.getAllSourceFiles();
      return allSources.map((path) => relative(process.cwd(), path));
    }

    const modified: string[] = [];
    for (const sourceDir of this.sourceDirectories) {
      const files = await collectFiles(sourceDir, (name) => name.endsWith('.ts'));
      for (const file of files) {
        try {
          const stat = await fs.stat(file);
          if (stat.mtime > lastBuildTime) {
            modified.push(relative(process.cwd(), file));
          }
        } catch {
          // Ignore missing files
        }
      }
    }

    return modified;
  }

  private async getAllSourceFiles(): Promise<string[]> {
    const files: string[] = [];
    for (const dir of this.sourceDirectories) {
      const dirFiles = await collectFiles(dir, (name) => name.endsWith('.ts'));
      files.push(...dirFiles);
    }
    return files;
  }
}

export function createBuildVerifier(options?: BuildVerifierOptions): BuildVerifier {
  return new BuildVerifier(options);
}

function runBuild(): void {
  execSync('npm run maf:build-scripts', {
    stdio: 'inherit',
    env: { ...process.env }
  });
}

export async function rebuildWithValidationIfNeeded(options?: BuildVerifierOptions): Promise<boolean> {
  const verifier = createBuildVerifier(options);
  const status = await verifier.checkBuildStatus();

  if (!status.needsRebuild) {
    return false;
  }

  runBuild();

  const after = await verifier.checkBuildStatus();
  if (after.needsRebuild) {
    throw new Error('Build is still stale after rebuild attempt');
  }

  return true;
}
