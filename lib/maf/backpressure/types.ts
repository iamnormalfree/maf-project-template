// ABOUTME: Type definitions for MAF backpressure and quota system
// ABOUTME: Enhanced with transitional state events and predictive health indicators

export interface RateLimiterConfig {
  /** Maximum burst capacity (tokens) */
  capacity: number;
  /** Refill rate (tokens per second) */
  refillRate: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining tokens in bucket */
  remainingTokens: number;
  /** When next token will be available (timestamp) */
  nextRefillTime: number;
  /** How long to wait for next token (ms, only if not allowed) */
  waitTimeMs: number;
}

export interface RateLimiterStatus {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current tokens in bucket */
  currentTokens: number;
  /** Remaining tokens in bucket */
  remainingTokens: number;
  /** Maximum capacity */
  capacity: number;
  /** Refill rate (tokens per second) */
  refillRate: number;
  /** Bucket utilization (0-1) */
  utilization: number;
  /** When next token will be available (timestamp) */
  nextRefillTime: number;
  /** How long to wait for next token (ms, only if not allowed) */
  waitTimeMs: number;
}

export interface QueueCapConfig {
  /** Maximum queue depth per priority level */
  high: number;
  medium: number;
  low: number;
}

export interface QueueItem {
  /** Unique identifier for the queued item */
  id: string;
  /** Provider identifier */
  providerId: string;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  /** Task data */
  task: any;
  /** Timestamp when queued */
  queuedAt: number;
  /** Estimated processing time (ms) */
  estimatedTime?: number;
}

export interface QueueResult {
  /** Whether item was queued or dropped */
  queued: boolean;
  /** Position in queue (if queued) */
  position?: number;
  /** Estimated wait time (ms) */
  waitTime?: number;
  /** Reason if dropped */
  reason?: 'QUEUE_FULL' | 'PRIORITY_DROPPED' | 'UNKNOWN';
  /** Item that was queued or null if dropped */
  item?: QueueItem;
}

export interface BackpressureConfig {
  /** Rate limiting configuration per provider type */
  rateLimits: {
    /** Configuration for different provider types */
    [providerType: string]: RateLimiterConfig;
  };
  /** Queue depth caps per priority */
  queueCaps: QueueCapConfig;
  /** Enable backpressure integration with quota manager */
  enableQuotaIntegration: boolean;
  /** Enable queue prioritization */
  enablePrioritization: boolean;
  /** Enable predictive health indicators */
  enablePredictiveHealth: boolean;
  /** Prediction accuracy target (0-100%) */
  predictionAccuracyTarget: number;
  /** Prediction horizon (ms) */
  predictionHorizonMs: number;
}

// Enhanced event types with transitional states
export type BackpressureEventType =
  | 'THROTTLED'      // Request rejected due to rate limiting
  | 'ALLOWED'        // Request allowed through rate limiter
  | 'QUEUED'         // Task queued successfully
  | 'DEFERRED'       // Task deferred due to queue depth
  | 'DROPPED'        // Task dropped due to queue depth
  | 'QUEUE_FULL'     // Queue exceeded capacity
  | 'RETRY'          // Task retried after backpressure
  | 'LIMIT_CONFIG_CHANGED'
  // New transitional state events
  | 'PROVIDER_HEALTH_DEGRADING'    // Provider health transitioning to warning state
  | 'PROVIDER_HEALTH_RECOVERING'   // Provider health transitioning back to healthy
  | 'QUEUE_UTILIZATION_SPIKE'      // Sudden increase in queue utilization
  | 'QUEUE_UTILIZATION_NORMALIZED' // Queue utilization returned to normal
  | 'RATE_LIMIT_APPROACHING'       // Rate limit threshold approaching
  | 'RATE_LIMIT_RECOVERY'          // Rate limit recovering from throttling
  | 'PREDICTIVE_HEALTH_ALERT';     // Predictive health indicator warning

export interface BackpressureEvent {
  /** Unique event identifier */
  id: string;
  /** Timestamp when event occurred */
  timestamp: number;
  /** Event type */
  type: BackpressureEventType;
  /** Provider identifier */
  providerId: string;
  /** Additional event details */
  details: Record<string, any>;
  /** Event severity for prioritization */
  severity?: 'info' | 'warning' | 'error' | 'critical';
  /** Predictive indicators if available */
  predictive?: {
    /** Predicted state in future (ms) */
    futureState: string;
    /** Time horizon for prediction */
    horizonMs: number;
    /** Confidence level (0-100%) */
    confidence: number;
  };
}

export interface PredictiveHealthIndicator {
  /** Provider being monitored */
  providerId: string;
  /** Current health state */
  currentHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNAVAILABLE';
  /** Predicted health state */
  predictedHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNAVAILABLE';
  /** Time until predicted state (ms) */
  timeToPredictedState: number;
  /** Confidence in prediction (0-100%) */
  predictionConfidence: number;
  /** Key indicators driving prediction */
  indicators: {
    rateLimitTrend: 'improving' | 'stable' | 'degrading';
    queueUtilizationTrend: 'improving' | 'stable' | 'degrading';
    errorRateTrend: 'improving' | 'stable' | 'degrading';
    quotaUtilizationTrend: 'improving' | 'stable' | 'degrading';
  };
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface BackpressureMetrics {
  /** Total events processed */
  totalEvents: number;
  /** Throttled events count */
  throttledCount: number;
  /** Queued events count */
  queuedCount: number;
  /** Dropped events count */
  droppedCount: number;
  /** Average queue wait time */
  avgQueueWaitTime: number;
  /** Current queue depths */
  queueDepths: {
    high: number;
    medium: number;
    low: number;
  };
  /** Provider-specific metrics */
  providerMetrics: {
    [providerId: string]: {
      allowed: number;
      throttled: number;
      avgWaitTime: number;
      lastActivity: number;
      // Enhanced with trend metrics
      trends?: {
        rateLimitUtilization: 'improving' | 'stable' | 'degrading';
        queueUtilization: 'improving' | 'stable' | 'degrading';
        errorRate: 'improving' | 'stable' | 'degrading';
      };
    };
  };
  // New predictive metrics
  predictiveMetrics?: {
    predictionAccuracy: number;
    alertsGenerated: number;
    alertsResolved: number;
    falsePositiveRate: number;
    lastPredictionUpdate: number;
  };
}

export interface RoutingDecision {
  /** Whether to route the request */
  shouldRoute: boolean;
  /** If shouldRoute is false, the reason */
  reason?: 'RATE_LIMITED' | 'QUEUE_FULL' | 'QUOTA_EXCEEDED' | 'SYSTEM_OVERLOADED';
  /** Estimated wait time if shouldRoute is false */
  waitTimeMs?: number;
  /** Recommended action */
  action: 'ROUTE' | 'THROTTLE' | 'DEFER' | 'DROP';
  /** Provider health status */
  providerHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNAVAILABLE';
  // Enhanced with predictive information
  predictive?: {
    /** Predicted wait time */
    predictedWaitTimeMs?: number;
    /** Recommended action timing */
    recommendedActionTime?: number;
    /** Confidence in decision */
    decisionConfidence: number;
  };
}

export interface ProviderQuotaStatus {
  /** Provider identifier */
  providerId: string;
  /** Overall health indicator */
  healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
  /** Whether provider is within quota */
  withinQuota: boolean;
  /** Quota usage percentages */
  usage: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  /** Last update timestamp */
  lastUpdated: number;
  // Enhanced with predictive information
  predictedExhaustion?: {
    /** Time until quota exhaustion (ms) */
    timeToExhaustion: number;
    /** Confidence in prediction */
    confidence: number;
    /** Usage trend driving prediction */
    usageTrend: 'increasing' | 'stable' | 'decreasing';
  };
}

export interface BackpressureManagerConfig {
  /** Backpressure system configuration */
  backpressure: BackpressureConfig;
  /** Enable observability events */
  enableObservability: boolean;
  /** Event retention period (ms) */
  eventRetentionMs: number;
  /** Metrics collection interval (ms) */
  metricsIntervalMs: number;
  // Enhanced configuration for signal freshness
  signalRefreshConfig?: {
    /** Cache invalidation threshold for critical changes (ms) */
    criticalChangeThresholdMs: number;
    /** Background refresh interval (ms) */
    backgroundRefreshIntervalMs: number;
    /** Predictive health update interval (ms) */
    predictiveHealthUpdateIntervalMs: number;
    /** Enable real-time signal processing */
    enableRealTimeProcessing: boolean;
  };
}

// CLI cache invalidation types
export interface CliCacheEntry {
  /** Cache key */
  key: string;
  /** Cached data */
  data: any;
  /** Cache timestamp */
  timestamp: number;
  /** Cache validity duration (ms) */
  ttlMs: number;
  /** Priority for invalidation */
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface CliCacheManager {
  /** Get cached data with intelligent invalidation */
  get(key: string): any | null;
  /** Set cache data with priority-based invalidation */
  set(key: string, data: any, ttlMs: number, priority: 'low' | 'medium' | 'high' | 'critical'): void;
  /** Invalidate cache entries based on critical changes */
  invalidateOnCriticalChange(eventType: BackpressureEventType): void;
  /** Background refresh of cache entries */
  refreshBackground(): void;
  /** Get cache statistics */
  getStats(): {
    totalEntries: number;
    hitRate: number;
    invalidationCount: number;
    lastInvalidation: number;
  };
}
