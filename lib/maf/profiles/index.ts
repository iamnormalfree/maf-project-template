// ABOUTME: Module entry point for MAF multi-Codex account profile management

import { CodexProfileManager } from './profile-manager';
import { ProfileLoaderOptions } from './types';

export type {
  CodexProfile,
  CodexProfileSelection,
  CodexProfileMetadata,
  CodexProfilesConfig,
  UsageTracker,
  ProfileManager,
  ProfileValidationError,
  ProfileValidationResult,
  ProfileLoaderOptions,
  InheritanceResolver,
  RateLimitWindow,
  ProfileUsageData
} from './types';

export { CodexProfileManager } from './profile-manager';
export { CodexInheritanceResolver } from './inheritance-resolver';
export { CodexUsageTracker } from './usage-tracker';

// Convenience factory function
export function createProfileManager(options?: ProfileLoaderOptions): CodexProfileManager {
  return new CodexProfileManager(options);
}
