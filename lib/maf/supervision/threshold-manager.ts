// ABOUTME: ThresholdManager for MAF supervision framework.
// ABOUTME: Checks system and agent metrics against configurable thresholds with alert triggering.
// #PATH_DECISION: Using percentage-based thresholds for CPU/memory/disk, absolute values for context tokens (assumption verified - SystemMetrics structure correct)

import type { SupervisionContext, AgentState } from './types';

// ============================================================================
// Threshold Configuration Types
// ============================================================================

/**
 * Resource usage metrics for an agent or system
 */
export interface ResourceUsage {
  /** Current context tokens used */
  contextTokens: number;
  /** Total context token capacity */
  contextCapacity: number;
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage in megabytes */
  memoryMb: number;
  /** Disk usage percentage (0-100) - optional for per-agent checks */
  diskUsagePercent?: number;
  /** Response time in milliseconds - optional for performance monitoring */
  responseTimeMs?: number;
}

/**
 * Threshold definitions for a specific metric
 */
export interface Threshold {
  /** Threshold identifier */
  id: string;

  /** Metric name to monitor */
  metric: keyof ResourceUsage;

  /** Warning threshold value */
  warning: number;

  /** Critical threshold value */
  critical: number;

  /** Comparison operator */
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';

  /** Whether this threshold applies to system-wide or per-agent */
  scope: 'system' | 'agent';

  /** Optional: specific agent IDs this applies to (empty = all agents) */
  agentIds?: string[];
}

/**
 * Complete threshold configuration
 */
export interface ThresholdConfig {
  /** CPU usage threshold (%) */
  cpu: {
    warning: number;
    critical: number;
  };

  /** Memory usage threshold (MB) */
  memory: {
    warning: number;
    critical: number;
  };

  /** Disk usage threshold (%) */
  disk: {
    warning: number;
    critical: number;
  };

  /** Context token usage threshold (%) */
  context: {
    warning: number;
    critical: number;
  };

  /** Response time threshold (ms) - optional */
  responseTime?: {
    warning: number;
    critical: number;
  };

  /** Custom thresholds for specific agents */
  agentSpecific?: Map<string, Omit<Partial<ThresholdConfig>, 'agentSpecific'>>;
}

/**
 * Result of a threshold check
 */
export interface ThresholdCheckResult {
  /** Whether all thresholds are within limits */
  withinLimits: boolean;

  /** List of threshold violations */
  violations: ThresholdViolation[];

  /** List of warnings (threshold exceeded but not critical) */
  warnings: ThresholdViolation[];

  /** Timestamp of the check */
  checkedAt: number;
}

/**
 * A single threshold violation
 */
export interface ThresholdViolation {
  /** Threshold that was violated */
  threshold: Threshold;

  /** Current value */
  currentValue: number;

  /** Threshold value that was exceeded */
  thresholdValue: number;

  /** Severity level */
  severity: 'warning' | 'critical';

  /** Agent ID (if agent-specific) */
  agentId?: string;

  /** System-wide flag */
  isSystemWide: boolean;

  /** Timestamp of violation */
  timestamp: number;
}

/**
 * Alert triggered by threshold violation
 */
export interface ThresholdAlert {
  /** Alert identifier */
  id: string;

  /** Severity level */
  severity: 'warning' | 'critical';

  /** Violation details */
  violation: ThresholdViolation;

  /** Suggested action */
  suggestedAction: string;

  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Default Threshold Configuration
// ============================================================================

/**
 * Default threshold configuration for MAF supervision
 */
export const DEFAULT_THRESHOLD_CONFIG: ThresholdConfig = {
  cpu: {
    warning: 75,
    critical: 90
  },
  memory: {
    warning: 1024,  // 1 GB
    critical: 2048  // 2 GB
  },
  disk: {
    warning: 80,
    critical: 90
  },
  context: {
    warning: 75,
    critical: 90
  },
  responseTime: {
    warning: 5000,   // 5 seconds
    critical: 10000  // 10 seconds
  }
};

// ============================================================================
// ThresholdManager Implementation
// ============================================================================

/**
 * ThresholdManager - Check system and agent metrics against configurable thresholds
 *
 * Features:
 * - Configurable warning and critical thresholds for CPU, memory, disk, context usage
 * - Support for system-wide and per-agent thresholds
 * - Automatic alert generation when thresholds exceeded
 * - Graceful handling of missing metrics
 * - Type-safe implementation with full TypeScript support
 */
export class ThresholdManager {
  private config: ThresholdConfig;
  private alerts: ThresholdAlert[] = [];
  private violationHistory: ThresholdViolation[] = [];
  private maxHistorySize: number;

  /**
   * Create a new ThresholdManager
   *
   * @param config - Threshold configuration (uses DEFAULT_THRESHOLD_CONFIG if not provided)
   * @param maxHistorySize - Maximum number of violations to keep in history (default: 1000)
   */
  constructor(config?: Partial<ThresholdConfig>, maxHistorySize: number = 1000) {
    // Merge provided config with defaults
    this.config = {
      cpu: config?.cpu ?? DEFAULT_THRESHOLD_CONFIG.cpu,
      memory: config?.memory ?? DEFAULT_THRESHOLD_CONFIG.memory,
      disk: config?.disk ?? DEFAULT_THRESHOLD_CONFIG.disk,
      context: config?.context ?? DEFAULT_THRESHOLD_CONFIG.context,
      responseTime: config?.responseTime ?? DEFAULT_THRESHOLD_CONFIG.responseTime,
      agentSpecific: config?.agentSpecific ?? new Map()
    };

    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Check thresholds for the entire supervision context
   *
   * @param context - Supervision context with system and agent data
   * @param resourceUsage - Optional resource usage data (if not in context)
   * @returns ThresholdCheckResult with violations and warnings
   */
  checkThresholds(
    context: SupervisionContext,
    resourceUsage?: ResourceUsage
  ): ThresholdCheckResult {
    const violations: ThresholdViolation[] = [];
    const warnings: ThresholdViolation[] = [];
    const checkedAt = Date.now();

    // Check system-wide thresholds if resource usage provided
    if (resourceUsage) {
      this.checkResourceThresholds(
        resourceUsage,
        this.config,
        violations,
        warnings,
        checkedAt,
        true // system-wide
      );
    }

    // Check per-agent thresholds
    // Note: AgentState doesn't have full resource usage, so we check what's available
    for (const agent of context.agents) {
      if (agent.contextUsage !== undefined) {
        // Check context usage for each agent
        this.checkAgentContextUsage(
          agent,
          violations,
          warnings,
          checkedAt
        );
      }
    }

    // Store violations in history
    this.addToHistory([...violations, ...warnings]);

    // Generate alerts for critical violations
    for (const violation of violations) {
      this.generateAlert(violation);
    }

    // Determine if all thresholds are within limits
    const withinLimits = violations.length === 0;

    return {
      withinLimits,
      violations,
      warnings,
      checkedAt
    };
  }

  /**
   * Check thresholds for a single agent
   *
   * @param agentId - Agent identifier
   * @param resourceUsage - Resource usage data for the agent
   * @returns ThresholdCheckResult for the agent
   */
  checkAgentThresholds(
    agentId: string,
    resourceUsage: ResourceUsage
  ): ThresholdCheckResult {
    const violations: ThresholdViolation[] = [];
    const warnings: ThresholdViolation[] = [];
    const checkedAt = Date.now();

    // Check if agent has specific thresholds
    const agentConfig = this.config.agentSpecific?.get(agentId);
    const effectiveConfig = agentConfig
      ? { ...this.config, ...agentConfig }
      : this.config;

    this.checkResourceThresholds(
      resourceUsage,
      effectiveConfig,
      violations,
      warnings,
      checkedAt,
      false, // not system-wide
      agentId
    );

    // Store in history
    this.addToHistory([...violations, ...warnings]);

    // Generate alerts for critical violations
    for (const violation of violations) {
      this.generateAlert(violation);
    }

    return {
      withinLimits: violations.length === 0,
      violations,
      warnings,
      checkedAt
    };
  }

  /**
   * Check system-wide thresholds
   *
   * @param resourceUsage - System resource usage data
   * @returns ThresholdCheckResult for the system
   */
  checkSystemThresholds(resourceUsage: ResourceUsage): ThresholdCheckResult {
    const violations: ThresholdViolation[] = [];
    const warnings: ThresholdViolation[] = [];
    const checkedAt = Date.now();

    this.checkResourceThresholds(
      resourceUsage,
      this.config,
      violations,
      warnings,
      checkedAt,
      true // system-wide
    );

    // Store in history
    this.addToHistory([...violations, ...warnings]);

    // Generate alerts for critical violations
    for (const violation of violations) {
      this.generateAlert(violation);
    }

    return {
      withinLimits: violations.length === 0,
      violations,
      warnings,
      checkedAt
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check resource usage against thresholds
   */
  private checkResourceThresholds(
    usage: ResourceUsage,
    config: ThresholdConfig,
    violations: ThresholdViolation[],
    warnings: ThresholdViolation[],
    timestamp: number,
    isSystemWide: boolean,
    agentId?: string
  ): void {
    // Check CPU
    if (usage.cpuPercent !== undefined) {
      this.checkMetric(
        'cpuPercent' as keyof ResourceUsage,
        usage.cpuPercent,
        config.cpu.warning,
        config.cpu.critical,
        'gt',
        violations,
        warnings,
        timestamp,
        isSystemWide,
        agentId
      );
    }

    // Check memory
    if (usage.memoryMb !== undefined) {
      this.checkMetric(
        'memoryMb' as keyof ResourceUsage,
        usage.memoryMb,
        config.memory.warning,
        config.memory.critical,
        'gt',
        violations,
        warnings,
        timestamp,
        isSystemWide,
        agentId
      );
    }

    // Check disk
    if (usage.diskUsagePercent !== undefined) {
      this.checkMetric(
        'diskUsagePercent' as keyof ResourceUsage,
        usage.diskUsagePercent,
        config.disk.warning,
        config.disk.critical,
        'gt',
        violations,
        warnings,
        timestamp,
        isSystemWide,
        agentId
      );
    }

    // Check context usage (convert to percentage)
    if (usage.contextTokens !== undefined && usage.contextCapacity > 0) {
      const contextPercent = (usage.contextTokens / usage.contextCapacity) * 100;
      this.checkMetric(
        'contextTokens' as keyof ResourceUsage,
        contextPercent,
        config.context.warning,
        config.context.critical,
        'gt',
        violations,
        warnings,
        timestamp,
        isSystemWide,
        agentId
      );
    }

    // Check response time
    if (usage.responseTimeMs !== undefined && config.responseTime) {
      this.checkMetric(
        'responseTimeMs' as keyof ResourceUsage,
        usage.responseTimeMs,
        config.responseTime.warning,
        config.responseTime.critical,
        'gt',
        violations,
        warnings,
        timestamp,
        isSystemWide,
        agentId
      );
    }
  }

  /**
   * Check a single metric against thresholds
   */
  private checkMetric(
    metric: keyof ResourceUsage,
    value: number,
    warningThreshold: number,
    criticalThreshold: number,
    operator: string,
    violations: ThresholdViolation[],
    warnings: ThresholdViolation[],
    timestamp: number,
    isSystemWide: boolean,
    agentId?: string
  ): void {
    const exceedsWarning = this.compare(value, warningThreshold, operator);
    const exceedsCritical = this.compare(value, criticalThreshold, operator);

    if (exceedsCritical) {
      violations.push({
        threshold: {
          id: `${metric}-critical`,
          metric,
          warning: warningThreshold,
          critical: criticalThreshold,
          operator: operator as any,
          scope: isSystemWide ? 'system' : 'agent',
          agentIds: agentId ? [agentId] : undefined
        },
        currentValue: value,
        thresholdValue: criticalThreshold,
        severity: 'critical',
        agentId,
        isSystemWide,
        timestamp
      });
    } else if (exceedsWarning) {
      warnings.push({
        threshold: {
          id: `${metric}-warning`,
          metric,
          warning: warningThreshold,
          critical: criticalThreshold,
          operator: operator as any,
          scope: isSystemWide ? 'system' : 'agent',
          agentIds: agentId ? [agentId] : undefined
        },
        currentValue: value,
        thresholdValue: warningThreshold,
        severity: 'warning',
        agentId,
        isSystemWide,
        timestamp
      });
    }
  }

  /**
   * Check agent context usage specifically
   */
  private checkAgentContextUsage(
    agent: AgentState,
    violations: ThresholdViolation[],
    warnings: ThresholdViolation[],
    timestamp: number
  ): void {
    const contextPercent = agent.contextUsage ?? 0;
    const config = this.config.agentSpecific?.get(agent.id) ?? this.config;

    this.checkMetric(
      'contextTokens' as keyof ResourceUsage,
      contextPercent,
      config.context.warning,
      config.context.critical,
      'gt',
      violations,
      warnings,
      timestamp,
      false, // not system-wide
      agent.id
    );
  }

  /**
   * Compare value against threshold using operator
   */
  private compare(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Generate alert for threshold violation
   */
  private generateAlert(violation: ThresholdViolation): void {
    const alert: ThresholdAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      severity: violation.severity,
      violation,
      suggestedAction: this.suggestAction(violation),
      timestamp: Date.now()
    };

    this.alerts.push(alert);

    // #SUGGEST_LOGGING: Consider logging alerts to external system
    // #SUGGEST_CONFIGURABLE_ALERTS: Allow custom alert handlers via configuration
  }

  /**
   * Suggest action for a violation
   */
  private suggestAction(violation: ThresholdViolation): string {
    const { metric } = violation.threshold;
    const severity = violation.severity;

    switch (metric) {
      case 'cpuPercent':
        return severity === 'critical'
          ? 'Scale up resources or reduce workload'
          : 'Monitor CPU usage closely';

      case 'memoryMb':
        return severity === 'critical'
          ? 'Free memory or restart affected services'
          : 'Monitor memory usage';

      case 'diskUsagePercent':
        return severity === 'critical'
          ? 'Clean up disk space immediately'
          : 'Plan disk cleanup';

      case 'contextTokens':
        return severity === 'critical'
          ? 'Reduce context window or clear conversation history'
          : 'Monitor context usage';

      case 'responseTimeMs':
        return severity === 'critical'
          ? 'Investigate performance bottleneck'
          : 'Monitor response times';

      default:
        return 'Review system metrics';
    }
  }

  /**
   * Add violations to history
   */
  private addToHistory(violations: ThresholdViolation[]): void {
    this.violationHistory.push(...violations);

    // Trim history if exceeds max size
    if (this.violationHistory.length > this.maxHistorySize) {
      this.violationHistory = this.violationHistory.slice(-this.maxHistorySize);
    }
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Get all alerts generated since last check
   */
  getAlerts(): ThresholdAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Get violation history
   */
  getViolationHistory(): ThresholdViolation[] {
    return [...this.violationHistory];
  }

  /**
   * Clear violation history
   */
  clearHistory(): void {
    this.violationHistory = [];
  }

  /**
   * Update threshold configuration
   */
  updateConfig(config: Partial<ThresholdConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      agentSpecific: config.agentSpecific ?? this.config.agentSpecific
    };
  }

  /**
   * Get current threshold configuration
   */
  getConfig(): ThresholdConfig {
    return { ...this.config };
  }

  /**
   * Set agent-specific thresholds
   */
  setAgentThresholds(agentId: string, config: Partial<ThresholdConfig>): void {
    if (!this.config.agentSpecific) {
      this.config.agentSpecific = new Map();
    }
    this.config.agentSpecific.set(agentId, config);
  }

  /**
   * Get thresholds for a specific agent
   */
  getAgentThresholds(agentId: string): Omit<Partial<ThresholdConfig>, 'agentSpecific'> | undefined {
    return this.config.agentSpecific?.get(agentId);
  }

  /**
   * Remove agent-specific thresholds
   */
  removeAgentThresholds(agentId: string): boolean {
    return this.config.agentSpecific?.delete(agentId) ?? false;
  }

  /**
   * Get statistics about threshold violations
   */
  getStatistics(): {
    totalViolations: number;
    criticalViolations: number;
    warningViolations: number;
    systemViolations: number;
    agentViolations: number;
    byMetric: Record<string, number>;
  } {
    const stats = {
      totalViolations: this.violationHistory.length,
      criticalViolations: 0,
      warningViolations: 0,
      systemViolations: 0,
      agentViolations: 0,
      byMetric: {} as Record<string, number>
    };

    for (const violation of this.violationHistory) {
      if (violation.severity === 'critical') {
        stats.criticalViolations++;
      } else {
        stats.warningViolations++;
      }

      if (violation.isSystemWide) {
        stats.systemViolations++;
      } else {
        stats.agentViolations++;
      }

      const metric = violation.threshold.metric;
      stats.byMetric[metric] = (stats.byMetric[metric] || 0) + 1;
    }

    return stats;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a ThresholdManager with default configuration
 */
export function createThresholdManager(
  config?: Partial<ThresholdConfig>,
  maxHistorySize?: number
): ThresholdManager {
  return new ThresholdManager(config, maxHistorySize);
}

/**
 * Create a ThresholdManager with custom configuration
 */
export function createThresholdManagerWithDefaults(
  defaults: Partial<ThresholdConfig>,
  config?: Partial<ThresholdConfig>,
  maxHistorySize?: number
): ThresholdManager {
  const mergedConfig = { ...defaults, ...config };
  return new ThresholdManager(mergedConfig, maxHistorySize);
}
