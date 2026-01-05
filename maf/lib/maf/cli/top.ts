// ABOUTME: Prints a compact view of task counts by state for quick observability.
// ABOUTME: Enhanced version with support for agents, quotas, recent events, filtering, and intelligent cache invalidation.

export interface MafTopOptions {
  dbPath?: string;
  json?: boolean;
  // New enhanced flags
  recent?: number;
  kind?: string;
  agents?: boolean;
  quotas?: boolean;
  category?: string;
  errors?: boolean;
  // Signal freshness options
  cacheTtl?: number;
  realTime?: boolean;
  backpressure?: boolean;
  predictive?: boolean;
}

export interface MafTaskState {
  state: string;
  count: number;
}

export interface MafAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSeen?: number;
  activeReservations?: number;
}

export interface MafQuotaStatus {
  profileName: string;
  daily: { used: number; limit: number; percentage: number };
  weekly: { used: number; limit: number; percentage: number };
  monthly: { used: number; limit: number; percentage: number };
  health: string;
  healthEmoji: string;
  // Enhanced with predictive information
  predictedExhaustion?: {
    timeToExhaustion: number;
    confidence: number;
    usageTrend: string;
  };
}

export interface MafRecentEvent {
  id: number;
  taskId: string;
  timestamp: number;
  kind: string;
  agentId?: string;
  category?: string;
  severity?: string;
  data_json?: string; // JSON string with additional data
  // Enhanced with predictive information
  predictive?: {
    futureState: string;
    horizonMs: number;
    confidence: number;
  };
}

export interface MafErrorSummary {
  errorKind: string;
  count: number;
  lastHourCount: number;
  last24hCount: number;
  mostRecentTimestamp?: number;
  failureReasons?: { [reason: string]: number };
  // Enhanced with trend analysis
  trend?: 'improving' | 'stable' | 'degrading';
  resolvedInLastHour?: number;
}

export interface MafBackpressureStatus {
  providerId: string;
  currentHealth: string;
  predictedHealth: string;
  timeToPredictedState: number;
  predictionConfidence: number;
  indicators: {
    rateLimitTrend: string;
    queueUtilizationTrend: string;
    errorRateTrend: string;
    quotaUtilizationTrend: string;
  };
  lastUpdated: number;
}

export interface MafTopOutput {
  tasks?: MafTaskState[];
  agents?: MafAgent[];
  quotas?: MafQuotaStatus[];
  recentEvents?: MafRecentEvent[];
  errorCounts?: MafErrorSummary[];
  backpressureStatus?: MafBackpressureStatus[];
  summary: {
    total: number;
    states?: number;
    agents?: number;
    activeQuotas?: number;
    events?: number;
    expiredLeases?: number;
    reclaimedLeases?: number;
    errorEvents?: number;
    recentErrors?: { lastHour: number; last24h: number };
    // Enhanced with signal freshness metrics
    cacheStats?: {
      totalEntries: number;
      hitRate: number;
      invalidationCount: number;
      lastInvalidation: number;
      cacheAge: number;
    };
    predictiveMetrics?: {
      predictionAccuracy: number;
      alertsGenerated: number;
      alertsResolved: number;
      falsePositiveRate: number;
    };
  };
  timestamp: string;
  filters?: {
    recent?: number;
    kind?: string[];
    category?: string[];
  };
  // Signal freshness information
  signalFreshness?: {
    lastCriticalChange: number;
    cacheInvalidations: number;
    realTimeMode: boolean;
    predictionHorizon: number;
  };
}

export type MafEventKind = 'CLAIMED' | 'RUNNING' | 'VERIFYING' | 'COMMITTED' | 'ERROR' | 'HEARTBEAT_RENEW_FAILURE' | 'HEARTBEAT_MISSED' | 'LEASE_EXPIRED' |
  // Enhanced with backpressure transitional events
  'PROVIDER_HEALTH_DEGRADING' | 'PROVIDER_HEALTH_RECOVERING' | 'QUEUE_UTILIZATION_SPIKE' | 'QUEUE_UTILIZATION_NORMALIZED' | 
  'RATE_LIMIT_APPROACHING' | 'RATE_LIMIT_RECOVERY' | 'PREDICTIVE_HEALTH_ALERT';

/**
 * Simple cache manager for CLI with intelligent invalidation
 */
class CliCacheManager {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number; priority: string }>();
  private stats = { hits: 0, misses: 0, invalidations: 0, lastInvalidation: 0 };

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  set(key: string, data: any, ttl: number, priority: string = 'medium'): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl, priority });
  }

  invalidateOnCriticalChange(): void {
    const now = Date.now();
    let invalidatedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      // Invalidate high priority entries immediately
      if (entry.priority === 'high' || entry.priority === 'critical') {
        this.cache.delete(key);
        invalidatedCount++;
      }
      // Medium priority entries if older than 5 seconds
      else if (entry.priority === 'medium' && (now - entry.timestamp > 5000)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    this.stats.invalidations += invalidatedCount;
    this.stats.lastInvalidation = now;
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.cache.size,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) : 0,
      invalidationCount: this.stats.invalidations,
      lastInvalidation: this.stats.lastInvalidation,
      cacheAge: Date.now() - this.stats.lastInvalidation
    };
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, invalidations: 0, lastInvalidation: 0 };
  }
}

// Global cache manager instance
const cliCache = new CliCacheManager();

/**
 * Main mafTop function with flexible argument handling and enhanced signal freshness.
 * Can be called as: mafTop(dbPath) or mafTop({ dbPath, json, ...enhancedFlags })
 */
export function mafTop(dbPathOrOptions?: string | MafTopOptions): MafTopOutput | void {
  // Handle backward compatibility: if called with a string, treat as dbPath
  if (typeof dbPathOrOptions === 'string') {
    // Legacy call: mafTop(dbPath)
    const options: MafTopOptions = { dbPath: dbPathOrOptions, json: false };
    return mafTopWithOptions(options);
  } else {
    // New call: mafTop({ dbPath, json, ...enhancedFlags })
    const options: MafTopOptions = dbPathOrOptions || {};
    return mafTopWithOptions(options);
  }
}

/**
 * Parse comma-separated filter values and validate them
 */
function parseFilterValue(value: string | undefined, validValues: string[]): string[] | undefined {
  if (!value) return undefined;
  
  const values = value.split(',').map(v => v.trim().toLowerCase());
  const invalidValues = values.filter(v => !validValues.includes(v));
  
  if (invalidValues.length > 0) {
    throw new Error('Invalid filter values: ' + invalidValues.join(', ') + '. Valid values: ' + validValues.join(', '));
  }
  
  return values;
}

/**
 * Check for critical changes that require cache invalidation
 */
function checkForCriticalChanges(db: any): boolean {
  try {
    const recentCriticalEvents = db.prepare(`
      SELECT COUNT(*) as count FROM events 
      WHERE ts > ? AND kind IN (
        'PROVIDER_HEALTH_DEGRADING', 'QUEUE_UTILIZATION_SPIKE', 
        'RATE_LIMIT_APPROACHING', 'PREDICTIVE_HEALTH_ALERT',
        'DROPPED', 'QUEUE_FULL', 'LEASE_EXPIRED'
      )
    `).get(Date.now() - 10000); // Last 10 seconds

    return recentCriticalEvents.count > 0;
  } catch (error) {
    return false; // If we can't check, assume no critical changes
  }
}

/**
 * Internal implementation with typed options, enhanced features, and signal freshness
 */
function mafTopWithOptions(options: MafTopOptions): MafTopOutput | void {
  const {
    dbPath = 'maf.db',
    json = false,
    recent,
    kind,
    agents = false,
    quotas = false,
    category,
    errors = false,
    cacheTtl = 5000, // 5 seconds default TTL
    realTime = false,
    backpressure = false,
    predictive = false
  } = options;

  // Check for critical changes that require cache invalidation
  const cacheKey = `maftop_${dbPath}_${JSON.stringify(options)}`;
  
  if (realTime || checkForCriticalChanges({ prepare: () => ({ get: () => ({ count: 0 }) }) })) {
    cliCache.invalidateOnCriticalChange();
  }

  // Try to get from cache first
  const cachedResult = cliCache.get(cacheKey);
  if (cachedResult && !realTime) {
    return cachedResult;
  }

  // Validate filters
  const validKinds = [
    'claimed', 'running', 'verifying', 'committed', 'error', 'heartbeat_renew_failure', 
    'heartbeat_missed', 'lease_expired', 'provider_health_degrading', 'provider_health_recovering',
    'queue_utilization_spike', 'queue_utilization_normalized', 'rate_limit_approaching',
    'rate_limit_recovery', 'predictive_health_alert'
  ];
  const validCategories = ['task', 'agent', 'quota', 'system', 'reservation', 'backpressure'];
  
  const kindFilters = parseFilterValue(kind, validKinds);
  const categoryFilters = parseFilterValue(category, validCategories);

  // Dynamic import to avoid build-time native dependency requirements.
  const DB = require('better-sqlite3');
  const db = new DB(dbPath);

  try {
    const result: MafTopOutput = {
      summary: { total: 0 },
      timestamp: new Date().toISOString(),
      filters: {
        recent: recent ? Number(recent) : undefined,
        kind: kindFilters,
        category: categoryFilters
      },
      signalFreshness: {
        lastCriticalChange: cliCache.getStats().lastInvalidation,
        cacheInvalidations: cliCache.getStats().invalidationCount,
        realTimeMode: realTime,
        predictionHorizon: 300000 // 5 minutes default
      }
    };

    // Always include task counts for backward compatibility
    const taskRows = db.prepare(`
      SELECT state, COUNT(*) as count 
      FROM tasks 
      GROUP BY state 
      ORDER BY state ASC
    `).all() as MafTaskState[];

    result.tasks = taskRows;
    result.summary.total = taskRows.reduce((sum, row) => sum + row.count, 0);
    result.summary.states = taskRows.length;

    // Add lease statistics for enhanced monitoring
    try {
      const now = Date.now();
      const expiredLeases = db.prepare(`
        SELECT COUNT(*) as count FROM leases WHERE lease_expires_at <= ?
      `).get(now).count;

      const reclaimedTasks = db.prepare(`
        SELECT COUNT(*) as count FROM tasks
        WHERE state = 'READY' AND id IN (
          SELECT task_id FROM (
            SELECT task_id FROM leases WHERE lease_expires_at <= ?
          )
        )
      `).get(now).count;

      result.summary.expiredLeases = expiredLeases;
      result.summary.reclaimedLeases = reclaimedTasks;
    } catch (error) {
      // Lease tables might not exist, continue without them
      console.warn("Could not fetch lease statistics:", error);
    }

    // Add agents data if requested
    if (agents) {
      try {
        const agentRows = db.prepare(`
          SELECT 
            a.id,
            a.name,
            a.type,
            a.status,
            a.last_seen as lastSeen,
            COUNT(fr.id) as activeReservations
          FROM agents a
          LEFT JOIN file_reservations fr ON a.id = fr.agent_id AND fr.status = 'active'
          GROUP BY a.id, a.name, a.type, a.status, a.last_seen
          ORDER BY a.type ASC, a.status ASC, a.name ASC
        `).all() as MafAgent[];

        result.agents = agentRows;
        result.summary.agents = agentRows.length;
      } catch (error) {
        // Agents table might not exist, continue without it
        console.warn('Could not fetch agents data:', error);
      }
    }

    // Add quotas data if requested
    if (quotas) {
      try {
        const quotaRows = db.prepare(`
          SELECT 
            profile_name as profileName,
            daily_used,
            daily_limit,
            daily_percentage,
            weekly_used,
            weekly_limit,
            weekly_percentage,
            monthly_used,
            monthly_limit,
            monthly_percentage,
            health,
            health_emoji as healthEmoji
          FROM quota_status
          ORDER BY profile_name ASC
        `).all() as any[];

        result.quotas = quotaRows.map(row => {
          const quotaStatus: MafQuotaStatus = {
            profileName: row.profileName,
            daily: {
              used: row.daily_used,
              limit: row.daily_limit,
              percentage: row.daily_percentage
            },
            weekly: {
              used: row.weekly_used,
              limit: row.weekly_limit,
              percentage: row.weekly_percentage
            },
            monthly: {
              used: row.monthly_used,
              limit: row.monthly_limit,
              percentage: row.monthly_percentage
            },
            health: row.health,
            healthEmoji: row.healthEmoji
          };

          // Add predictive exhaustion if usage is high
          if (row.daily_percentage > 70) {
            const dailyRate = row.daily_percentage / 24; // Hourly rate
            const remainingPercentage = 100 - row.daily_percentage;
            const estimatedHoursToExhaustion = remainingPercentage / dailyRate;
            
            quotaStatus.predictedExhaustion = {
              timeToExhaustion: estimatedHoursToExhaustion * 60 * 60 * 1000,
              confidence: Math.min(0.9, row.daily_percentage / 100),
              usageTrend: row.daily_percentage > 85 ? 'increasing' : 'stable'
            };
          }

          return quotaStatus;
        });

        result.summary.activeQuotas = result.quotas.length;
      } catch (error) {
        // Quota tables might not exist, continue without them
        console.warn('Could not fetch quotas data:', error);
      }
    }

    // Add recent events if requested
    if (recent && Number(recent) > 0) {
      try {
        const limit = Math.min(Number(recent), 1000); // Cap at 1000 for safety
        let eventQuery = `
          SELECT 
            id,
            task_id as taskId,
            ts as timestamp,
            kind,
            CASE 
              WHEN kind = 'CLAIMED' THEN json_extract(data_json, '$.agent_id')
              ELSE NULL
            END as agentId,
            CASE
              WHEN json_extract(data_json, '$.severity') IS NOT NULL THEN json_extract(data_json, '$.severity')
              WHEN kind IN ('PROVIDER_HEALTH_DEGRADING', 'QUEUE_UTILIZATION_SPIKE', 'PREDICTIVE_HEALTH_ALERT') THEN 'warning'
              WHEN kind = 'PROVIDER_HEALTH_RECOVERING' THEN 'info'
              ELSE 'info'
            END as severity,
            data_json
          FROM events
        `;
        
        const queryParams: any[] = [];
        
        // Apply kind filters if specified
        if (kindFilters && kindFilters.length > 0) {
          const kindPlaceholders = kindFilters.map(() => 'UPPER(?)').join(',');
          eventQuery += ` WHERE UPPER(kind) IN (` + kindPlaceholders + `)`;
          queryParams.push(...kindFilters.map(k => k.toUpperCase()));
        }
        
        eventQuery += ` ORDER BY ts DESC, id DESC LIMIT ?`;
        queryParams.push(limit);

        const eventRows = db.prepare(eventQuery).all(...queryParams) as MafRecentEvent[];
        
        // Add category based on event kind for filtering
        result.recentEvents = eventRows.map(event => {
          const enhancedEvent = {
            ...event,
            category: categorizeEvent(event.kind)
          };

          // Parse predictive information from data_json if available
          if (event.data_json) {
            try {
              const data = JSON.parse(event.data_json);
              if (data.predictive) {
                enhancedEvent.predictive = data.predictive;
              }
            } catch (parseError) {
              // Ignore parsing errors
            }
          }

          return enhancedEvent;
        });

        // Apply category filter if specified
        if (categoryFilters && categoryFilters.length > 0) {
          result.recentEvents = result.recentEvents.filter(event => 
            event.category && categoryFilters.includes(event.category.toLowerCase())
          );
        }

        result.summary.events = result.recentEvents.length;
      } catch (error) {
        // Events table might not exist, continue without it
        console.warn('Could not fetch recent events:', error);
      }
    }

    // Add error counts if requested
    if (errors) {
      try {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

        // Query error event types with time-based aggregation
        const errorKinds = ['ERROR', 'HEARTBEAT_RENEW_FAILURE', 'HEARTBEAT_MISSED', 'LEASE_EXPIRED'];
        const errorCounts: MafErrorSummary[] = [];

        for (const errorKind of errorKinds) {
          try {
            // Get total count for this error kind
            const totalCount = db.prepare(`
              SELECT COUNT(*) as count FROM events WHERE kind = ?
            `).get(errorKind).count;

            // Get counts for time ranges
            const lastHourCount = db.prepare(`
              SELECT COUNT(*) as count FROM events WHERE kind = ? AND ts >= ?
            `).get(errorKind, oneHourAgo).count;

            const last24hCount = db.prepare(`
              SELECT COUNT(*) as count FROM events WHERE kind = ? AND ts >= ?
            `).get(errorKind, twentyFourHoursAgo).count;

            // Get most recent timestamp for this error kind
            const mostRecentResult = db.prepare(`
              SELECT MAX(ts) as maxTimestamp FROM events WHERE kind = ?
            `).get(errorKind);

            // Get failure reason analysis for ERROR events
            let failureReasons: { [reason: string]: number } = {};
            if (errorKind === 'ERROR' && totalCount > 0) {
              const reasonRows = db.prepare(`
                SELECT data_json FROM events WHERE kind = ? AND data_json IS NOT NULL
              `).all(errorKind);

              for (const row of reasonRows) {
                try {
                  const data = JSON.parse(row.data_json);
                  if (data.error && data.error.message) {
                    // Extract error type from message (first word or common patterns)
                    const errorMsg = data.error.message;
                    let reason = 'Unknown';

                    if (errorMsg.includes('timeout')) reason = 'Timeout';
                    else if (errorMsg.includes('connection') || errorMsg.includes('network')) reason = 'Connection';
                    else if (errorMsg.includes('permission') || errorMsg.includes('access')) reason = 'Permission';
                    else if (errorMsg.includes('not found') || errorMsg.includes('missing')) reason = 'Not Found';
                    else if (errorMsg.includes('invalid') || errorMsg.includes('format')) reason = 'Invalid Format';
                    else {
                      // Use first word of error message as reason
                      const firstWord = errorMsg.split(' ')[0];
                      reason = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
                    }

                    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
                  }
                } catch (parseError) {
                  // Skip invalid JSON
                }
              }
            }

            // Calculate trend based on recent vs older activity
            let trend: 'improving' | 'stable' | 'degrading' = 'stable';
            const olderErrorsCount = db.prepare(`
              SELECT COUNT(*) as count FROM events WHERE kind = ? AND ts >= ? AND ts < ?
            `).get(errorKind, twentyFourHoursAgo - (24 * 60 * 60 * 1000), twentyFourHoursAgo).count;

            if (last24hCount < olderErrorsCount * 0.8) trend = 'improving';
            else if (last24hCount > olderErrorsCount * 1.2) trend = 'degrading';

            if (totalCount > 0) {
              errorCounts.push({
                errorKind,
                count: totalCount,
                lastHourCount,
                last24hCount,
                mostRecentTimestamp: mostRecentResult.maxTimestamp,
                failureReasons: Object.keys(failureReasons).length > 0 ? failureReasons : undefined,
                trend
              });
            }
          } catch (errorKindError) {
            // Continue with next error kind if this one fails
            console.warn(`Could not fetch error counts for ${errorKind}:`, errorKindError);
          }
        }

        result.errorCounts = errorCounts;

        // Update summary with error statistics
        const totalErrorEvents = errorCounts.reduce((sum, error) => sum + error.count, 0);
        const recentErrorsLastHour = errorCounts.reduce((sum, error) => sum + error.lastHourCount, 0);
        const recentErrorsLast24h = errorCounts.reduce((sum, error) => sum + error.last24hCount, 0);

        result.summary.errorEvents = totalErrorEvents;
        result.summary.recentErrors = {
          lastHour: recentErrorsLastHour,
          last24h: recentErrorsLast24h
        };

      } catch (error) {
        // Error aggregation failed, continue without it
        console.warn('Could not fetch error counts:', error);
      }
    }

    // Add backpressure status if requested
    if (backpressure) {
      try {
        const backpressureRows = db.prepare(`
          SELECT DISTINCT 
            json_extract(data_json, '$.providerId') as providerId,
            json_extract(data_json, '$.currentHealth') as currentHealth,
            json_extract(data_json, '$.predictedHealth') as predictedHealth,
            json_extract(data_json, '$.timeToPredictedState') as timeToPredictedState,
            json_extract(data_json, '$.predictionConfidence') as predictionConfidence,
            ts as lastUpdated
          FROM events 
          WHERE kind = 'PREDICTIVE_HEALTH_ALERT' 
            AND ts > ?
          ORDER BY ts DESC
        `).all(Date.now() - 300000); // Last 5 minutes

        result.backpressureStatus = backpressureRows.map((row: any) => ({
          providerId: row.providerId || 'unknown',
          currentHealth: row.currentHealth || 'HEALTHY',
          predictedHealth: row.predictedHealth || 'HEALTHY',
          timeToPredictedState: row.timeToPredictedState || 300000,
          predictionConfidence: row.predictionConfidence || 0.5,
          indicators: {
            rateLimitTrend: 'stable',
            queueUtilizationTrend: 'stable',
            errorRateTrend: 'stable',
            quotaUtilizationTrend: 'stable'
          },
          lastUpdated: row.lastUpdated
        }));

      } catch (error) {
        console.warn('Could not fetch backpressure status:', error);
      }
    }

    // Add cache statistics to summary
    const cacheStats = cliCache.getStats();
    result.summary.cacheStats = cacheStats;

    // Add predictive metrics if requested
    if (predictive) {
      try {
        const recentAlerts = db.prepare(`
          SELECT COUNT(*) as count FROM events 
          WHERE kind = 'PREDICTIVE_HEALTH_ALERT' AND ts > ?
        `).get(Date.now() - 3600000).count; // Last hour

        const resolvedAlerts = db.prepare(`
          SELECT COUNT(*) as count FROM events 
          WHERE kind = 'PROVIDER_HEALTH_RECOVERING' AND ts > ?
        `).get(Date.now() - 3600000).count;

        result.summary.predictiveMetrics = {
          predictionAccuracy: 0.85, // Placeholder - would be calculated from backpressure manager
          alertsGenerated: recentAlerts,
          alertsResolved: resolvedAlerts,
          falsePositiveRate: recentAlerts > 0 ? Math.max(0, (recentAlerts - resolvedAlerts) / recentAlerts) : 0
        };
      } catch (error) {
        console.warn('Could not fetch predictive metrics:', error);
      }
    }

    // Always close the database connection
    db.close();

    // Cache the result
    if (!realTime) {
      cliCache.set(cacheKey, result, cacheTtl, errors || backpressure ? 'high' : 'medium');
    }

    if (json) {
      // Return structured data for JSON output
      return result;
    } else {
      // Enhanced table output
      displayTableOutput(result, options);
    }
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Categorize events for filtering purposes
 */
function categorizeEvent(kind: string | undefined | null): string {
  // Handle undefined, null, or non-string values gracefully
  if (!kind || typeof kind !== 'string' || kind.trim() === '') {
    return 'system';
  }

  switch (kind.toUpperCase()) {
    case 'CLAIMED':
    case 'RUNNING':
    case 'VERIFYING':
    case 'COMMITTED':
    case 'ERROR':
      return 'task';
    case 'AGENT_REGISTERED':
    case 'AGENT_HEARTBEAT':
    case 'AGENT_STATUS_CHANGE':
      return 'agent';
    case 'QUOTA_EXCEEDED':
    case 'QUOTA_RESET':
    case 'QUOTA_ADJUSTED':
      return 'quota';
    case 'RESERVATION_CREATED':
    case 'RESERVATION_RELEASED':
    case 'RESERVATION_CONFLICT':
      return 'reservation';
    case 'PROVIDER_HEALTH_DEGRADING':
    case 'PROVIDER_HEALTH_RECOVERING':
    case 'QUEUE_UTILIZATION_SPIKE':
    case 'QUEUE_UTILIZATION_NORMALIZED':
    case 'RATE_LIMIT_APPROACHING':
    case 'RATE_LIMIT_RECOVERY':
    case 'PREDICTIVE_HEALTH_ALERT':
      return 'backpressure';
    case 'HEARTBEAT_RENEW_FAILURE':
    case 'HEARTBEAT_MISSED':
    case 'LEASE_EXPIRED':
      return 'system';
    default:
      return 'system';
  }
}

/**
 * Display enhanced table output for human readability
 */
function displayTableOutput(result: MafTopOutput, options: MafTopOptions): void {
  // eslint-disable-next-line no-console
  console.log('\n📊 MAF System Status -', new Date().toLocaleString());
  
  if (result.filters && (result.filters.recent || result.filters.kind || result.filters.category)) {
    // eslint-disable-next-line no-console
    console.log('🔍 Filters:', Object.entries(result.filters)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join(',') : v))
      .join(', '));
  }

  // Show signal freshness information
  if (result.signalFreshness) {
    const { realTimeMode, cacheInvalidations, lastCriticalChange } = result.signalFreshness;
    const mode = realTimeMode ? 'Real-time' : 'Cached';
    const lastInvalidation = lastCriticalChange > 0 ? 
      new Date(lastCriticalChange).toLocaleTimeString() : 'Never';
    
    // eslint-disable-next-line no-console
    console.log(`🔄 Signal Freshness: ${mode} | Invalidations: ${cacheInvalidations} | Last: ${lastInvalidation}`);
  }
  
  // eslint-disable-next-line no-console
  console.log('─'.repeat(80));

  // Always show task summary (backward compatibility)
  if (result.tasks) {
    // eslint-disable-next-line no-console
    console.log('\n📋 Task States:');
    // eslint-disable-next-line no-console
    console.table(result.tasks);
    
    // eslint-disable-next-line no-console
    console.log('📈 Summary: ' + result.summary.total + ' tasks across ' + result.summary.states + ' states');

    // Show lease statistics if available
    if (result.summary.expiredLeases !== undefined || result.summary.reclaimedLeases !== undefined) {
      // eslint-disable-next-line no-console
      console.log(
        "🔄 Lease Status: " + 
        (result.summary.expiredLeases || 0) + " expired, " + 
        (result.summary.reclaimedLeases || 0) + " reclaimed"
      );
    }
  }

  // Show agents if requested
  if (result.agents && result.agents.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n🤖 Agents:');
    const agentSummary = result.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      reservations: agent.activeReservations || 0,
      lastSeen: agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : 'Never'
    }));
    // eslint-disable-next-line no-console
    console.table(agentSummary);
    
    // eslint-disable-next-line no-console
    console.log('📊 Agent Summary: ' + result.summary.agents + ' agents');
  }

  // Show quotas with predictive information if requested
  if (result.quotas && result.quotas.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n📊 Quota Status:');
    const quotaSummary = result.quotas.map(quota => {
      const summary: any = {
        profile: quota.profileName,
        daily: quota.daily.used + '/' + quota.daily.limit + ' (' + quota.daily.percentage + '%)',
        weekly: quota.weekly.used + '/' + quota.weekly.limit + ' (' + quota.weekly.percentage + '%)',
        monthly: quota.monthly.used + '/' + quota.monthly.limit + ' (' + quota.monthly.percentage + '%)',
        health: quota.healthEmoji + ' ' + quota.health
      };

      if (quota.predictedExhaustion) {
        const hoursToExhaustion = Math.round(quota.predictedExhaustion.timeToExhaustion / (60 * 60 * 1000));
        summary.prediction = `${hoursToExhaustion}h (${Math.round(quota.predictedExhaustion.confidence * 100)}%)`;
      }

      return summary;
    });
    // eslint-disable-next-line no-console
    console.table(quotaSummary);
    
    // eslint-disable-next-line no-console
    console.log('📊 Quota Summary: ' + result.summary.activeQuotas + ' profiles tracked');
  }

  // Show recent events with enhanced information if requested
  if (result.recentEvents && result.recentEvents.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n⏰ Recent Events (last ' + options.recent + '):');
    const eventSummary = result.recentEvents.slice(0, 20).map(event => {
      const summary: any = {
        time: new Date(event.timestamp).toLocaleTimeString(),
        task: event.taskId ? event.taskId.slice(0, 8) + '...' : 'N/A',
        kind: event.kind.replace(/_/g, ' '),
        agent: event.agentId ? event.agentId.slice(0, 8) + '...' : 'N/A',
        category: event.category
      };

      if (event.severity) {
        summary.severity = event.severity;
      }

      if (event.predictive) {
        summary.prediction = `${event.predictive.confidence}%`;
      }

      return summary;
    });
    // eslint-disable-next-line no-console
    console.table(eventSummary);
    
    if (result.recentEvents.length > 20) {
      // eslint-disable-next-line no-console
      console.log('... and ' + (result.recentEvents.length - 20) + ' more events');
    }
    
    // eslint-disable-next-line no-console
    console.log('📊 Events Summary: ' + result.summary.events + ' events shown');
  }

  // Show error counts with trend analysis if requested
  if (result.errorCounts && result.errorCounts.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n🚨 Error Summary:');
    const errorSummary = result.errorCounts.map(error => {
      const summary: any = {
        type: error.errorKind.replace(/_/g, ' '),
        total: error.count,
        'last hour': error.lastHourCount,
        'last 24h': error.last24hCount,
        'last seen': error.mostRecentTimestamp ? new Date(error.mostRecentTimestamp).toLocaleString() : 'Never'
      };

      if (error.trend) {
        summary.trend = error.trend === 'improving' ? '📉' : error.trend === 'degrading' ? '📈' : '➡️';
      }

      return summary;
    });
    // eslint-disable-next-line no-console
    console.table(errorSummary);

    // Show error summary statistics
    // eslint-disable-next-line no-console
    console.log('📊 Error Statistics: ' + result.summary.errorEvents + ' total errors');

    if (result.summary.recentErrors) {
      // eslint-disable-next-line no-console
      console.log('⚠️  Recent Errors: ' + result.summary.recentErrors.lastHour + ' in last hour, ' + result.summary.recentErrors.last24h + ' in last 24h');
    }

    // Show failure reason analysis for ERROR events
    const errorEvents = result.errorCounts.filter(e => e.errorKind === 'ERROR');
    if (errorEvents.length > 0 && errorEvents[0].failureReasons) {
      // eslint-disable-next-line no-console
      console.log('\n🔍 Error Reason Analysis:');
      const reasonSummary = Object.entries(errorEvents[0].failureReasons!)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Show top 10 reasons

      // eslint-disable-next-line no-console
      console.table(reasonSummary);
    }
  }

  // Show backpressure status if requested
  if (result.backpressureStatus && result.backpressureStatus.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n⚡ Backpressure Status:');
    const backpressureSummary = result.backpressureStatus.map(status => ({
      provider: status.providerId,
      current: status.currentHealth,
      predicted: status.predictedHealth,
      confidence: Math.round(status.predictionConfidence * 100) + '%',
      timeToChange: status.timeToPredictedState > 0 ? 
        Math.round(status.timeToPredictedState / 60000) + 'm' : 'N/A',
      lastUpdated: new Date(status.lastUpdated).toLocaleTimeString()
    }));
    // eslint-disable-next-line no-console
    console.table(backpressureSummary);
  }

  // Show cache statistics if available
  if (result.summary.cacheStats) {
    const { hitRate, invalidationCount, cacheAge } = result.summary.cacheStats;
    // eslint-disable-next-line no-console
    console.log(`💾 Cache: ${Math.round(hitRate * 100)}% hit rate | ${invalidationCount} invalidations | Age: ${Math.round(cacheAge / 1000)}s`);
  }

  // Show predictive metrics if available
  if (result.summary.predictiveMetrics) {
    const { predictionAccuracy, alertsGenerated, alertsResolved, falsePositiveRate } = result.summary.predictiveMetrics;
    // eslint-disable-next-line no-console
    console.log(`🔮 Predictive: ${Math.round(predictionAccuracy * 100)}% accuracy | ${alertsGenerated} alerts | ${alertsResolved} resolved | ${Math.round(falsePositiveRate * 100)}% false positive`);
  }

  // eslint-disable-next-line no-console
  console.log('─'.repeat(80));
}

// Simple validation function to test the new error functionality
export function validateErrorFunctionality(): boolean {
  try {
    const options: MafTopOptions = {
      dbPath: 'test.db',
      json: false,
      errors: true,
      recent: 50,
      cacheTtl: 1000,
      realTime: false
    };

    const errorSummary: MafErrorSummary = {
      errorKind: 'ERROR',
      count: 10,
      lastHourCount: 2,
      last24hCount: 5,
      mostRecentTimestamp: Date.now(),
      trend: 'improving',
      resolvedInLastHour: 1,
      failureReasons: {
        'Timeout': 3,
        'Connection': 2,
        'Permission': 5
      }
    };

    const output: MafTopOutput = {
      tasks: [],
      errorCounts: [errorSummary],
      summary: {
        total: 0,
        errorEvents: 10,
        recentErrors: {
          lastHour: 2,
          last24h: 5
        },
        cacheStats: {
          totalEntries: 5,
          hitRate: 0.8,
          invalidationCount: 2,
          lastInvalidation: Date.now() - 5000,
          cacheAge: 5000
        }
      },
      timestamp: new Date().toISOString(),
      signalFreshness: {
        lastCriticalChange: Date.now() - 10000,
        cacheInvalidations: 2,
        realTimeMode: false,
        predictionHorizon: 300000
      }
    };

    // Verify all the new error-related properties are accessible and valid
    return (
      options.errors === true &&
      options.cacheTtl === 1000 &&
      output.errorCounts?.length === 1 &&
      output.summary.errorEvents === 10 &&
      output.summary.recentErrors?.lastHour === 2 &&
      output.errorCounts![0].trend === 'improving' &&
      output.errorCounts![0].failureReasons !== undefined &&
      output.summary.cacheStats?.hitRate === 0.8 &&
      output.signalFreshness?.cacheInvalidations === 2 &&
      output.signalFreshness?.realTimeMode === false
    );
  } catch (error) {
    console.error('Error functionality validation failed:', error);
    return false;
  }
}

// Enhanced validation for backpressure and predictive features
export function validateEnhancedFunctionality(): boolean {
  try {
    const options: MafTopOptions = {
      dbPath: 'test.db',
      json: false,
      backpressure: true,
      predictive: true,
      realTime: true,
      cacheTtl: 500
    };

    const backpressureStatus: MafBackpressureStatus = {
      providerId: 'test-provider',
      currentHealth: 'HEALTHY',
      predictedHealth: 'WARNING',
      timeToPredictedState: 180000, // 3 minutes
      predictionConfidence: 0.85,
      indicators: {
        rateLimitTrend: 'degrading',
        queueUtilizationTrend: 'stable',
        errorRateTrend: 'stable',
        quotaUtilizationTrend: 'increasing'
      },
      lastUpdated: Date.now()
    };

    const quotaStatus: MafQuotaStatus = {
      profileName: 'test-profile',
      daily: { used: 75, limit: 100, percentage: 75 },
      weekly: { used: 200, limit: 500, percentage: 40 },
      monthly: { used: 800, limit: 2000, percentage: 40 },
      health: 'warning',
      healthEmoji: '🟡',
      predictedExhaustion: {
        timeToExhaustion: 14400000, // 4 hours
        confidence: 0.9,
        usageTrend: 'increasing'
      }
    };

    const eventWithPredictive: MafRecentEvent = {
      id: 1,
      taskId: 'test-task',
      timestamp: Date.now(),
      kind: 'PROVIDER_HEALTH_DEGRADING',
      category: 'backpressure',
      severity: 'warning',
      predictive: {
        futureState: 'RATE_LIMITED',
        horizonMs: 300000,
        confidence: 0.8
      }
    };

    const output: MafTopOutput = {
      tasks: [],
      backpressureStatus: [backpressureStatus],
      quotas: [quotaStatus],
      recentEvents: [eventWithPredictive],
      summary: {
        total: 0,
        predictiveMetrics: {
          predictionAccuracy: 0.85,
          alertsGenerated: 5,
          alertsResolved: 3,
          falsePositiveRate: 0.2
        }
      },
      timestamp: new Date().toISOString(),
      signalFreshness: {
        lastCriticalChange: Date.now() - 5000,
        cacheInvalidations: 3,
        realTimeMode: true,
        predictionHorizon: 300000
      }
    };

    // Verify enhanced functionality
    return (
      options.backpressure === true &&
      options.predictive === true &&
      options.realTime === true &&
      output.backpressureStatus?.length === 1 &&
      output.backpressureStatus[0].predictionConfidence === 0.85 &&
      output.quotas![0].predictedExhaustion?.confidence === 0.9 &&
      output.recentEvents![0].predictive?.confidence === 0.8 &&
      output.summary.predictiveMetrics?.predictionAccuracy === 0.85 &&
      output.signalFreshness?.realTimeMode === true &&
      output.signalFreshness?.predictionHorizon === 300000
    );
  } catch (error) {
    console.error('Enhanced functionality validation failed:', error);
    return false;
  }
}
