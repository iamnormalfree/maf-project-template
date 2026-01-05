// ABOUTME: TypeScript interfaces for MAF multi-Codex account profile management system

export interface CodexProfile {
  /** Human-readable name for the profile */
  name: string;

  /** Profile priority for selection (lower = higher priority) */
  priority: number;

  /** Parent profile for inheritance (optional) */
  extends?: string;

  /** Environment variables loaded for this profile */
  environment: {
    [key: string]: string;
  };

  /** Maximum requests per time window */
  rate_limit?: {
    requests: number;
    window: number; // seconds
  };

  /** Profile status */
  active: boolean;

  /** Contact for rotation notifications */
  owner?: string;

  /** When profile was last used */
  last_used?: string;
}

export interface CodexProfileSelection {
  /** Algorithm for selecting profiles */
  algorithm: 'round-robin' | 'priority' | 'random';

  /** Priority override when algorithm is 'priority' */
  priority?: number;

  /** Enforce rate limiting */
  enforce_rate_limit: boolean;

  /** Fallback priority override */
  fallback_priority?: number;
}

export interface CodexProfileMetadata {
  /** Global enable flag */
  enable: boolean;

  /** Default profile for non-codex agents */
  default_profile: string;

  /** Current active profile */
  current_profile?: string;

  /** Profile selection configuration */
  selection: CodexProfileSelection;

  /** Rotation monitoring interval (minutes) */
  rotation_monitoring: number;

  /** Maximum rotation attempts before escalation */
  max_rotation_attempts: number;

  /** Rotation state tracking */
  rotation_state: {
    current_attempt: number;
    last_rotation: string;
    escalation_notified: boolean;
  };
}

export interface CodexProfilesConfig {
  /** Profile metadata and configuration */
  codex_profiles: CodexProfileMetadata;

  /** Profile definitions */
  profiles: {
    [profileName: string]: CodexProfile;
  };
}

export interface UsageTracker {
  /** Track API usage for rate limiting */
  recordUsage(profileName: string, timestamp: number): void;

  /** Check if profile is rate limited */
  isRateLimited(profileName: string): boolean;

  /** Get usage statistics */
  getUsageStats(profileName: string): {
    requests: number;
    window: number;
    currentUsage: number;
    remainingRequests: number;
    resetTime: number;
  } | null;

  /** Reset usage counters */
  resetUsage(profileName: string): void;
}

export interface ProfileManager {
  /** Load all profiles from config */
  loadProfiles(): Promise<void>;

  /** Get specific profile by name */
  getProfile(name: string): CodexProfile | null;

  /** Get all active profiles */
  getActiveProfiles(): CodexProfile[];

  /** Select best profile based on configuration */
  selectProfile(agentType?: string): CodexProfile | null;

  /** Get profile with resolved inheritance */
  getResolvedProfile(name: string): CodexProfile | null;

  /** Get profile environment variables */
  getProfileEnvironment(name: string): { [key: string]: string } | null;

  /** Mark profile as used */
  markProfileUsed(name: string): void;

  /** Rotate to next available profile */
  rotateProfile(currentProfile?: string): CodexProfile | null;

  /** Update profile metadata */
  updateMetadata(updates: Partial<CodexProfileMetadata>): void;

  /** Get current configuration */
  getConfig(): CodexProfilesConfig;

  /** Save configuration to file */
  saveConfig(): Promise<void>;
}

export interface ProfileValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: ProfileValidationError[];
}

export interface ProfileLoaderOptions {
  /** Configuration file path */
  configPath?: string;

  /** Environment file path */
  envPath?: string;

  /** Enable validation */
  validate?: boolean;

  /** Strict mode (fail on errors) */
  strict?: boolean;
}

export interface InheritanceResolver {
  /** Resolve profile inheritance chain */
  resolveInheritance(
    profileName: string,
    profiles: { [name: string]: CodexProfile }
  ): CodexProfile | null;

  /** Detect circular inheritance */
  detectCircularInheritance(
    profileName: string,
    profiles: { [name: string]: CodexProfile }
  ): string[];

  /** Merge parent and child properties */
  mergeProfiles(parent: CodexProfile, child: CodexProfile): CodexProfile;
}

export interface RateLimitWindow {
  /** Start timestamp */
  start: number;

  /** End timestamp */
  end: number;

  /** Request count in window */
  count: number;
}

export interface ProfileUsageData {
  /** Profile name */
  profileName: string;

  /** Rate limit windows */
  windows: RateLimitWindow[];

  /** Total usage tracking */
  totalRequests: number;

  /** First use timestamp */
  firstUsed: number;

  /** Last use timestamp */
  lastUsed: number;
}

// ===== QUOTA TRACKING EXTENSIONS =====
// Re-export quota types for convenience
export type {
  QuotaLimits,
  QuotaUsage,
  QuotaStatus,
  RollingWindow,
  QuotaEvent,
  QuotaState,
  QuotaConfiguration,
  CodexProfileWithQuota,

  QuotaValidationError,
  QuotaValidationResult,
  QuotaEventFilter,
  QuotaAnalytics
} from './quota-types';

export { QuotaStatePersistence } from './quota-manager';

export { QuotaStateManager } from './quota-state';
export { QuotaManager, createQuotaManager, createQuotaManagerWithDefaults } from './quota-manager';
