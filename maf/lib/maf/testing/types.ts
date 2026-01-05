export interface BuildVerifierOptions {
  buildDirectory?: string;
  sourceDirectories?: string[];
  staleThresholdMs?: number;
  requiredTargets?: string[];
}

export interface BuildStatus {
  buildDirectory: string;
  lastBuildTime?: number;
  sourceFilesModified: string[];
  missingTargets: string[];
  isFresh: boolean;
  needsRebuild: boolean;
}

export interface CliEnvironmentInfo {
  isCI: boolean;
  runtime: 'tsx' | 'compiled-js';
  workspace: string;
}
