// ABOUTME: Rolling window state management for quota tracking
// ABOUTME: Handles time-based calculations and rolling window updates

import type { 
  QuotaState, 
  QuotaStatus, 
  QuotaUsage, 
  RollingWindow, 
  QuotaEvent,
  QuotaConfiguration 
} from './quota-types';

export class QuotaStateManager {
  private readonly configuration: QuotaConfiguration;
  private readonly cache: Map<string, { status: QuotaStatus; timestamp: number }>;

  constructor(configuration: QuotaConfiguration) {
    this.configuration = configuration;
    this.cache = new Map();
  }

  /**
   * Calculate quota status for a profile based on current state
   */
  calculateQuotaStatus(state: QuotaState): QuotaStatus {
    const now = Date.now();
    const cacheKey = state.profileName;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < (this.configuration.cacheTTL * 1000)) {
      return cached.status;
    }

    // Calculate usage for each time window
    const daily = this.calculateUsageForWindow(state, 'daily', 24);
    const weekly = this.calculateUsageForWindow(state, 'weekly', 24 * 7);
    const monthly = this.calculateUsageForWindow(state, 'monthly', 24 * 30);

    // Calculate rolling 5-hour windows
    const rollingWindows = this.calculateRollingWindows(state, now);

    // Determine health based on highest usage percentage
    const maxPercentage = Math.max(daily.percentage, weekly.percentage, monthly.percentage);
    const health = this.determineHealthStatus(maxPercentage);
    const healthEmoji = this.getHealthEmoji(maxPercentage);

    const status: QuotaStatus = {
      daily,
      weekly,
      monthly,
      health,
      healthEmoji,
      rollingWindows,
      lastCalculated: now
    };

    // Cache the result
    this.cache.set(cacheKey, { status, timestamp: now });

    return status;
  }

  /**
   * Calculate usage for a specific time window
   */
  private calculateUsageForWindow(
    state: QuotaState, 
    windowType: 'daily' | 'weekly' | 'monthly', 
    windowHours: number
  ): QuotaUsage {
    const now = Date.now();
    const windowStart = this.getWindowStart(now, windowHours);
    
    // Filter events within the window
    const eventsInWindow = state.events.filter(event => 
      event.type === 'request' && 
      event.timestamp >= windowStart && 
      event.timestamp <= now
    );

    const used = eventsInWindow.length;
    const limit = state.limits[windowType];
    const percentage = limit > 0 ? (used / limit) * 100 : 0;

    return {
      used,
      limit,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      windowStart,
      windowEnd: windowStart + (windowHours * 60 * 60 * 1000),
      lastUsed: eventsInWindow.length > 0 
        ? Math.max(...eventsInWindow.map(e => e.timestamp))
        : 0
    };
  }

  /**
   * Calculate rolling 5-hour windows
   */
  private calculateRollingWindows(state: QuotaState, now: number): RollingWindow[] {
    const windows: RollingWindow[] = [];
    const windowDuration = this.configuration.rollingWindowHours * 60 * 60 * 1000; // Convert to milliseconds

    // Get all request events sorted by timestamp
    const requestEvents = state.events
      .filter(event => event.type === 'request')
      .sort((a, b) => a.timestamp - b.timestamp);

    // Create rolling windows covering the last 24 hours with no gaps or overlaps
    const endTime = now;
    const startTime = endTime - (24 * 60 * 60 * 1000); // 24 hours ago

    // Calculate number of windows needed to cover 24 hours
    const windowCount = Math.ceil(24 / this.configuration.rollingWindowHours);

    for (let i = 0; i < windowCount; i++) {
      const windowEnd = endTime - (i * windowDuration);
      const windowStart = windowEnd - windowDuration;

      // Only process windows that are within the 24-hour range
      if (windowEnd <= startTime) break;

      // Count requests in this window
      const requestsInWindow = requestEvents.filter(event =>
        event.timestamp >= windowStart && event.timestamp < windowEnd
      ).length;

      windows.unshift({
        start: windowStart,
        end: windowEnd,
        requests: requestsInWindow,
        durationHours: this.configuration.rollingWindowHours
      });
    }

    return windows;
  }

  /**
   * Get window start timestamp based on duration
   */
  private getWindowStart(now: number, hours: number): number {
    const windowStart = new Date(now);
    windowStart.setHours(0, 0, 0, 0); // Start of day
    
    if (hours < 24) {
      // Daily window - start of current day
      return windowStart.getTime();
    } else if (hours <= 24 * 7) {
      // Weekly window - start of week (Sunday)
      const dayOfWeek = windowStart.getDay();
      windowStart.setDate(windowStart.getDate() - dayOfWeek);
      return windowStart.getTime();
    } else {
      // Monthly window - start of month
      windowStart.setDate(1);
      return windowStart.getTime();
    }
  }

  /**
   * Determine health status based on usage percentage
   */
  private determineHealthStatus(percentage: number): QuotaStatus['health'] {
    if (percentage < this.configuration.healthThresholds.warning) {
      return 'healthy';
    } else if (percentage < this.configuration.healthThresholds.critical) {
      return 'warning';
    } else if (percentage < this.configuration.healthThresholds.exceeded) {
      return 'critical';
    } else {
      return 'exceeded';
    }
  }

  /**
   * Get health emoji based on usage percentage
   */
  private getHealthEmoji(percentage: number): QuotaStatus['healthEmoji'] {
    if (percentage < this.configuration.healthThresholds.warning) {
      return '🟢'; // < 50%
    } else if (percentage < this.configuration.healthThresholds.critical) {
      return '🟡'; // 50-75%
    } else if (percentage < this.configuration.healthThresholds.exceeded) {
      return '🔴'; // 75-90%
    } else {
      return '🚨'; // > 90%
    }
  }

  /**
   * Add a new event to the state
   */
  addEvent(state: QuotaState, event: QuotaEvent): QuotaState {
    const updatedEvents = [...state.events, event];
    
    // Trim events if they exceed the maximum
    if (updatedEvents.length > this.configuration.maxEventsInMemory) {
      // Remove oldest events, keeping only the most recent ones
      const eventsToKeep = updatedEvents.slice(-this.configuration.maxEventsInMemory);
      updatedEvents.length = 0;
      updatedEvents.push(...eventsToKeep);
    }

    // Clear cache for this profile since state changed
    this.cache.delete(state.profileName);

    return {
      ...state,
      events: updatedEvents,
      metadata: {
        ...state.metadata,
        lastUpdated: Date.now()
      }
    };
  }

  /**
   * Update quota limits in the state
   */
  updateLimits(state: QuotaState, newLimits: Partial<typeof state.limits>): QuotaState {
    const updatedLimits = { ...state.limits, ...newLimits };

    // Create event for limit adjustment
    const limitChangeEvent: QuotaEvent = {
      id: 'limit_change_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      profileName: state.profileName,
      timestamp: Date.now(),
      type: 'limit_adjusted',
      previousQuota: state.limits,
      newQuota: newLimits
    };

    const updatedState = this.addEvent(state, limitChangeEvent);
    
    return {
      ...updatedState,
      limits: updatedLimits
    };
  }

  /**
   * Reset quota usage for a profile
   */
  resetQuota(state: QuotaState): QuotaState {
    const resetEvent: QuotaEvent = {
      id: 'quota_reset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      profileName: state.profileName,
      timestamp: Date.now(),
      type: 'quota_reset'
    };

    // Clear all request events but keep configuration events
    const nonRequestEvents = state.events.filter(event => event.type !== 'request');
    const updatedEvents = [...nonRequestEvents, resetEvent];

    // Clear cache
    this.cache.delete(state.profileName);

    return {
      ...state,
      events: updatedEvents,
      metadata: {
        ...state.metadata,
        lastUpdated: Date.now()
      }
    };
  }

  /**
   * Clean up old data based on configuration
   */
  cleanup(state: QuotaState): QuotaState {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Remove old events
    const recentEvents = state.events.filter(event => 
      (now - event.timestamp) < maxAge || 
      event.type !== 'request'
    );

    // If we still have too many events, keep only the most recent ones
    const finalEvents = recentEvents.length > this.configuration.maxEventsInStorage
      ? recentEvents.slice(-this.configuration.maxEventsInStorage)
      : recentEvents;

    return {
      ...state,
      events: finalEvents,
      metadata: {
        ...state.metadata,
        lastUpdated: now
      }
    };
  }

  /**
   * Clear cache for all profiles or specific profile
   */
  clearCache(profileName?: string): void {
    if (profileName) {
      this.cache.delete(profileName);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ profile: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([profile, cached]) => ({
      profile,
      age: now - cached.timestamp
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  /**
   * Validate quota state integrity
   */
  validateState(state: QuotaState): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!state.profileName) {
      errors.push('Profile name is required');
    }

    if (!state.limits) {
      errors.push('Quota limits are required');
    } else {
      if (state.limits.daily <= 0) errors.push('Daily limit must be positive');
      if (state.limits.weekly <= 0) errors.push('Weekly limit must be positive');
      if (state.limits.monthly <= 0) errors.push('Monthly limit must be positive');
    }

    if (!state.events) {
      errors.push('Events array is required');
    }

    if (!state.metadata) {
      errors.push('Metadata is required');
    }

    // Check event integrity
    if (state.events) {
      const duplicateIds = new Set();
      for (const event of state.events) {
        if (!event.id) {
          errors.push('Event ID is required');
        } else if (duplicateIds.has(event.id)) {
          errors.push('Duplicate event ID: ' + event.id);
        } else {
          duplicateIds.add(event.id);
        }

        if (!event.profileName) {
          errors.push('Event profile name is required');
        }

        if (!event.timestamp) {
          errors.push('Event timestamp is required');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
