// ABOUTME: Quota tracking extensions for MAF profile management system
// ABOUTME: Extends existing CodexProfile interfaces while maintaining backward compatibility

export interface QuotaLimits {
  /** Daily request limit */
  daily: number;
  
  /** Weekly request limit */
  weekly: number;
  
  /** Monthly request limit */
  monthly: number;
  
  /** Custom limits for specific time windows */
  custom?: {
    [windowName: string]: {
      limit: number;
      windowHours: number;
    };
  };
}

export interface QuotaUsage {
  /** Requests used in current window */
  used: number;
  
  /** Total limit for window */
  limit: number;
  
  /** Percentage of quota used (0-100) */
  percentage: number;
  
  /** Window start timestamp */
  windowStart: number;
  
  /** Window end timestamp */
  windowEnd: number;
  
  /** Timestamp of last usage */
  lastUsed: number;
}

export interface QuotaStatus {
  /** Current daily quota usage */
  daily: QuotaUsage;
  
  /** Current weekly quota usage */
  weekly: QuotaUsage;
  
  /** Current monthly quota usage */
  monthly: QuotaUsage;
  
  /** Health indicator based on highest usage percentage */
  health: 'healthy' | 'warning' | 'critical' | 'exceeded';
  
  /** Health indicator emoji */
  healthEmoji: '🟢' | '🟡' | '🔴' | '🚨';
  
  /** Rolling 5-hour windows for granular tracking */
  rollingWindows: RollingWindow[];
  
  /** Timestamp when status was last calculated */
  lastCalculated: number;
}

export interface RollingWindow {
  /** Window start timestamp */
  start: number;
  
  /** Window end timestamp */
  end: number;
  
  /** Number of requests in this window */
  requests: number;
  
  /** Window duration in hours (always 5) */
  durationHours: number;
}

export interface QuotaEvent {
  /** Unique event identifier */
  id: string;
  
  /** Profile name */
  profileName: string;
  
  /** Event timestamp */
  timestamp: number;
  
  /** Event type */
  type: 'request' | 'quota_reset' | 'limit_adjusted' | 'profile_created' | 'profile_deleted';
  
  /** Request details for 'request' type */
  requestDetails?: {
    endpoint?: string;
    model?: string;
    tokens?: number;
    cost?: number;
  };
  
  /** Previous quota values for changes */
  previousQuota?: Partial<QuotaLimits>;
  
  /** New quota values for changes */
  newQuota?: Partial<QuotaLimits>;
  
  /** Additional event metadata */
  metadata?: {
    [key: string]: any;
  };
}

export interface QuotaState {
  /** Profile name */
  profileName: string;
  
  /** Current quota limits */
  limits: QuotaLimits;
  
  /** Current quota status */
  status: QuotaStatus;
  
  /** Event log for audit trail */
  events: QuotaEvent[];
  
  /** Configuration for quota tracking */
  configuration: QuotaConfiguration;
  
  /** State metadata */
  metadata: {
    version: string;
    createdAt: number;
    lastUpdated: number;
    lastSync: number;
  };
}

export interface QuotaConfiguration {
  /** Cache TTL for quota status in seconds */
  cacheTTL: number;
  
  /** Rolling window duration in hours */
  rollingWindowHours: number;
  
  /** Maximum events to retain in memory */
  maxEventsInMemory: number;
  
  /** Maximum events to retain in persistent storage */
  maxEventsInStorage: number;
  
  /** Health thresholds */
  healthThresholds: {
    warning: number;  // 50-75%
    critical: number; // 75-90%
    exceeded: number; // >90%
  };
  
  /** Enable detailed event logging */
  enableEventLogging: boolean;
  
  /** Enable batch API call optimization */
  enableBatchOptimization: boolean;
}

// Extend existing CodexProfile to include quota configuration
export interface CodexProfileWithQuota {
  /** Quota limits for this profile */
  quota_limits?: QuotaLimits;
  
  /** Enable quota tracking for this profile */
  quota_tracking_enabled?: boolean;
  
  /** Quota tracking configuration override */
  quota_configuration?: Partial<QuotaConfiguration>;
}

// Manager interfaces for quota tracking

export interface IQuotaStatePersistence {
  /** Save quota state to file */
  saveState(state: { [profileName: string]: QuotaState }): Promise<void>;
  
  /** Load quota state from file */
  loadState(): Promise<{ [profileName: string]: QuotaState }>;
  
  /** Create backup of current state */
  createBackup(): Promise<string>;
  
  /** Restore state from backup */
  restoreFromBackup(backupPath: string): Promise<void>;
  
  /** Check if state file exists */
  stateExists(): Promise<boolean>;
}

// Validation interfaces
export interface QuotaValidationError {
  field: string;
  message: string;
  value?: any;
  quotaField?: 'daily' | 'weekly' | 'monthly' | 'custom';
}

export interface QuotaValidationResult {
  valid: boolean;
  errors: QuotaValidationError[];
  warnings?: QuotaValidationError[];
}

// Event filtering and querying
export interface QuotaEventFilter {
  /** Profile name filter */
  profileName?: string;
  
  /** Event type filter */
  type?: QuotaEvent['type'];
  
  /** Time range filter */
  timeRange?: {
    start: number;
    end: number;
  };
  
  /** Limit number of results */
  limit?: number;
}

export interface QuotaAnalytics {
  /** Total requests in time period */
  totalRequests: number;
  
  /** Average requests per day */
  avgRequestsPerDay: number;
  
  /** Peak usage day */
  peakUsageDay: {
    date: string;
    requests: number;
  };
  
  /** Usage trend */
  usageTrend: 'increasing' | 'decreasing' | 'stable';
  
  /** Projected usage for remainder of period */
  projectedUsage: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

// Re-export existing types for convenience
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

// Manager interfaces for quota tracking
export interface QuotaManager {
  /** Initialize quota tracking for a profile */
  initializeProfileQuota(profileName: string, limits: QuotaLimits): Promise<void>;
  
  /** Record a request against quota */
  recordRequest(profileName: string, details?: QuotaEvent['requestDetails']): Promise<void>;
  
  /** Get current quota status */
  getQuotaStatus(profileName: string): Promise<QuotaStatus | null>;
  
  /** Get quota usage for specific time window */
  getQuotaUsage(profileName: string, window: 'daily' | 'weekly' | 'monthly'): Promise<QuotaUsage | null>;
  
  /** Check if profile is within quota limits */
  isWithinQuota(profileName: string): Promise<boolean>;
  
  /** Get health indicator for profile */
  getHealthIndicator(profileName: string): Promise<'🟢' | '🟡' | '🔴' | '🚨'>;
  
  /** Get rolling window usage */
  getRollingWindows(profileName: string): Promise<RollingWindow[]>;
  
  /** Update quota limits */
  updateQuotaLimits(profileName: string, limits: Partial<QuotaLimits>): Promise<void>;
  
  /** Get quota event history */
  getEventHistory(profileName: string, limit?: number): Promise<QuotaEvent[]>;
  
  /** Reset quota for a profile */
  resetQuota(profileName: string): Promise<void>;
  
  /** Sync quota state to persistent storage */
  syncToStorage(): Promise<void>;
  
  /** Load quota state from persistent storage */
  loadFromStorage(): Promise<void>;
  
  /** Clean up old events and data */
  cleanup(): Promise<void>;

  /** Generate analytics summary for profile usage */
  getAnalytics(profileName: string, days: number): Promise<QuotaAnalytics | null>;

  /** Filter raw quota events with simple criteria */
  filterEvents(filter: QuotaEventFilter): Promise<QuotaEvent[]>;
}
