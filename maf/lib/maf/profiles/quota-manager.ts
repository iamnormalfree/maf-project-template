// ABOUTME: Fixed version of quota manager with proper initialization
// ABOUTME: Main quota management logic with file-based persistence

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  QuotaManager as IQuotaManager,
  QuotaState,
  QuotaStatus,
  QuotaUsage,
  RollingWindow,
  QuotaEvent,
  QuotaLimits,
  QuotaConfiguration,
  QuotaEventFilter,
  QuotaAnalytics
} from './quota-types';
import { QuotaStateManager } from './quota-state';

// Default quota configuration
const DEFAULT_QUOTA_CONFIGURATION: QuotaConfiguration = {
  cacheTTL: 30, // 30 seconds
  rollingWindowHours: 5,
  maxEventsInMemory: 1000,
  maxEventsInStorage: 10000,
  healthThresholds: {
    warning: 50,    // 50-75%
    critical: 75,   // 75-90%
    exceeded: 90    // >90%
  },
  enableEventLogging: true,
  enableBatchOptimization: true
};

// Default quota limits
export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  daily: 1000,
  weekly: 5000,
  monthly: 15000
};

export class QuotaStatePersistence {
  private readonly statePath: string;
  private readonly backupPath: string;

  constructor(private readonly mafStateRoot: string = '.maf/state') {
    this.statePath = join(mafStateRoot, 'codex-quota.json');
    this.backupPath = join(mafStateRoot, 'codex-quota.backup.json');
    
    // Ensure directory exists
    this.ensureDirectoryExists(mafStateRoot);
  }

  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async saveState(state: { [profileName: string]: QuotaState }): Promise<void> {
    try {
      // Prepare state data with metadata
      const stateData = {
        version: '1.0.0',
        metadata: {
          lastUpdated: new Date().toISOString(),
          profileCount: Object.keys(state).length,
          totalEvents: Object.values(state).reduce((sum, profileState) => sum + profileState.events.length, 0)
        },
        profiles: state
      };

      // Atomic write pattern: write to temp file first, then rename
      const tempPath = this.statePath + '.tmp';
      writeFileSync(tempPath, JSON.stringify(stateData, null, 2), 'utf8');

      // Atomic rename to final location
      require('fs').renameSync(tempPath, this.statePath);

      // Create backup after successful atomic write

    } catch (error) {
      console.error('Failed to save quota state:', error);
      throw new Error('Quota state persistence failed: ' + (error as Error).message);
    }
  }

  async loadState(): Promise<{ [profileName: string]: QuotaState }> {
    try {
      if (!existsSync(this.statePath)) {
        return {};
      }

      const content = readFileSync(this.statePath, 'utf8');
      const data = JSON.parse(content);

      // Handle both new format (with metadata) and legacy format
      if (data.profiles) {
        return data.profiles;
      } else {
        // Legacy format - data is directly the profiles object
        return data;
      }
    } catch (error) {
      console.warn('Failed to load quota state, starting with empty state:', error);
      return {};
    }
  }

  async createBackup(): Promise<string> {
    try {
      if (existsSync(this.statePath)) {
        const content = readFileSync(this.statePath, 'utf8');
        const backupData = {
          version: '1.0.0',
          metadata: {
            backupTime: new Date().toISOString(),
            originalFile: this.statePath
          },
          data: JSON.parse(content)
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = 'codex-quota.backup.' + timestamp + '.json';
        const backupFilePath = join(this.mafStateRoot, backupFileName);

        writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
        return backupFilePath;
      }
      return '';
    } catch (error) {
      console.warn('Failed to create backup:', error);
      return '';
    }
  }

  async restoreFromBackup(backupPath: string): Promise<void> {
    try {
      if (!existsSync(backupPath)) {
        throw new Error('Backup file does not exist: ' + backupPath);
      }

      const content = readFileSync(backupPath, 'utf8');
      const backupData = JSON.parse(content);

      let stateToRestore;
      if (backupData.data && backupData.data.profiles) {
        stateToRestore = backupData.data.profiles;
      } else if (backupData.profiles) {
        stateToRestore = backupData.profiles;
      } else {
        throw new Error('Invalid backup file format');
      }

      await this.saveState(stateToRestore);
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      throw new Error('Backup restore failed: ' + (error as Error).message);
    }
  }

  async stateExists(): Promise<boolean> {
    return existsSync(this.statePath);
  }
}

export class QuotaManager implements IQuotaManager {
  private readonly stateManager: QuotaStateManager;
  private readonly persistence: QuotaStatePersistence;
  private quotaStates: Map<string, QuotaState> = new Map();
  private initialized = false;

  // Batch optimization state
  private eventBatch: Map<string, QuotaEvent[]> = new Map();
  private batchFlushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE_THRESHOLD = 50; // Flush after 50 events
  private readonly BATCH_TIME_THRESHOLD_MS = 5000; // Flush after 5 seconds

  constructor(
    private readonly configuration: QuotaConfiguration = DEFAULT_QUOTA_CONFIGURATION,
    persistence?: QuotaStatePersistence
  ) {
    this.stateManager = new QuotaStateManager(configuration);
    this.persistence = persistence || new QuotaStatePersistence();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.loadFromStorage();
      this.initialized = true;
    }
  }

  private createInitialStatus(limits: QuotaLimits): QuotaStatus {
    const now = Date.now();
    const today = new Date(now);
    
    // Daily window - start of today to start of tomorrow
    const dailyStart = new Date(today);
    dailyStart.setHours(0, 0, 0, 0);
    const dailyEnd = new Date(dailyStart);
    dailyEnd.setDate(dailyEnd.getDate() + 1);
    
    // Weekly window - start of this week (Sunday) to start of next week
    const weeklyStart = new Date(dailyStart);
    weeklyStart.setDate(weeklyStart.getDate() - weeklyStart.getDay());
    const weeklyEnd = new Date(weeklyStart);
    weeklyEnd.setDate(weeklyEnd.getDate() + 7);
    
    // Monthly window - start of this month to start of next month
    const monthlyStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    return {
      daily: {
        used: 0,
        limit: limits.daily,
        percentage: 0,
        windowStart: dailyStart.getTime(),
        windowEnd: dailyEnd.getTime(),
        lastUsed: 0
      },
      weekly: {
        used: 0,
        limit: limits.weekly,
        percentage: 0,
        windowStart: weeklyStart.getTime(),
        windowEnd: weeklyEnd.getTime(),
        lastUsed: 0
      },
      monthly: {
        used: 0,
        limit: limits.monthly,
        percentage: 0,
        windowStart: monthlyStart.getTime(),
        windowEnd: monthlyEnd.getTime(),
        lastUsed: 0
      },
      health: 'healthy',
      healthEmoji: '🟢',
      rollingWindows: [],
      lastCalculated: now
    };
  }

  async initializeProfileQuota(profileName: string, limits: QuotaLimits): Promise<void> {
    await this.ensureInitialized();

    if (this.quotaStates.has(profileName)) {
      throw new Error('Profile quota already initialized: ' + profileName);
    }

    const now = Date.now();
    const state: QuotaState = {
      profileName,
      limits,
      status: this.createInitialStatus(limits),
      events: [{
        id: 'profile_created_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        profileName,
        timestamp: Date.now(),
        type: 'profile_created'
      }],
      configuration: this.configuration,
      metadata: {
        version: '1.0.0',
        createdAt: now,
        lastUpdated: now,
        lastSync: now
      }
    };

    this.quotaStates.set(profileName, state);
    await this.syncToStorage();
  }

  async recordRequest(profileName: string, details?: QuotaEvent['requestDetails']): Promise<void> {
    await this.ensureInitialized();

    const state = this.quotaStates.get(profileName);
    if (!state) {
      throw new Error('Profile quota not initialized: ' + profileName);
    }

    const event: QuotaEvent = {
      id: 'request_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      profileName,
      timestamp: Date.now(),
      type: 'request',
      requestDetails: details
    };

    const updatedState = this.stateManager.addEvent(state, event);
    this.quotaStates.set(profileName, updatedState);

    // Batch sync if enabled, otherwise sync immediately
    if (this.configuration.enableBatchOptimization) {
      await this.addToBatch(profileName, event);
    } else {
      await this.syncToStorage();
    }
  }

  /**
   * Add event to batch for deferred syncing.
   * Flushes batch when size threshold is reached.
   */
  private async addToBatch(profileName: string, event: QuotaEvent): Promise<void> {
    // Initialize batch array for profile if needed
    if (!this.eventBatch.has(profileName)) {
      this.eventBatch.set(profileName, []);
    }

    const batch = this.eventBatch.get(profileName)!;
    batch.push(event);

    // Flush if batch size threshold reached
    if (batch.length >= this.BATCH_SIZE_THRESHOLD) {
      await this.flushBatch(profileName);
    } else {
      // Otherwise, set/refresh timer for time-based flushing
      this.scheduleBatchFlush();
    }
  }

  /**
   * Schedule a batch flush after time threshold.
   * Resets existing timer to coalesce multiple rapid requests.
   */
  private scheduleBatchFlush(): void {
    // Clear existing timer if any
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
    }

    // Set new timer
    this.batchFlushTimer = setTimeout(() => {
      this.flushAllBatches().catch(error => {
        console.error('Failed to flush batches on timer:', error);
      });
    }, this.BATCH_TIME_THRESHOLD_MS);
  }

  /**
   * Flush batch for a specific profile to storage.
   * Ensures no data loss on flush failure by keeping batch on error.
   */
  private async flushBatch(profileName: string): Promise<void> {
    const batch = this.eventBatch.get(profileName);
    if (!batch || batch.length === 0) {
      return;
    }

    try {
      // Sync all accumulated states to storage
      await this.syncToStorage();

      // Clear batch on successful flush
      this.eventBatch.delete(profileName);
    } catch (error) {
      console.error(`Failed to flush batch for profile ${profileName}:`, error);
      // Keep batch in memory on failure for retry
      // Batch will be retried on next flush or sync
    }
  }

  /**
   * Flush all pending batches across all profiles.
   */
  private async flushAllBatches(): Promise<void> {
    const profileNames = Array.from(this.eventBatch.keys());
    for (const profileName of profileNames) {
      await this.flushBatch(profileName);
    }
  }

  async getQuotaStatus(profileName: string): Promise<QuotaStatus | null> {
    await this.ensureInitialized();

    const state = this.quotaStates.get(profileName);
    if (!state) {
      return null;
    }

    return this.stateManager.calculateQuotaStatus(state);
  }

  async getQuotaUsage(profileName: string, window: 'daily' | 'weekly' | 'monthly'): Promise<QuotaUsage | null> {
    const status = await this.getQuotaStatus(profileName);
    if (!status) {
      return null;
    }

    return status[window];
  }

  async isWithinQuota(profileName: string): Promise<boolean> {
    const status = await this.getQuotaStatus(profileName);
    if (!status) {
      return false;
    }

    // Check if any window has exceeded limits
    return status.daily.percentage < 100 && 
           status.weekly.percentage < 100 && 
           status.monthly.percentage < 100;
  }

  async getHealthIndicator(profileName: string): Promise<'🟢' | '🟡' | '🔴' | '🚨'> {
    const status = await this.getQuotaStatus(profileName);
    if (!status) {
      return '🟢'; // Default to healthy if no status
    }

    return status.healthEmoji;
  }

  async getRollingWindows(profileName: string): Promise<RollingWindow[]> {
    const status = await this.getQuotaStatus(profileName);
    if (!status) {
      return [];
    }

    return status.rollingWindows;
  }

  async updateQuotaLimits(profileName: string, limits: Partial<QuotaLimits>): Promise<void> {
    await this.ensureInitialized();

    const state = this.quotaStates.get(profileName);
    if (!state) {
      throw new Error('Profile quota not initialized: ' + profileName);
    }

    const updatedState = this.stateManager.updateLimits(state, limits);
    this.quotaStates.set(profileName, updatedState);
    await this.syncToStorage();
  }

  async getEventHistory(profileName: string, limit?: number): Promise<QuotaEvent[]> {
    await this.ensureInitialized();

    const state = this.quotaStates.get(profileName);
    if (!state) {
      return [];
    }

    let events = [...state.events].reverse(); // Most recent first

    if (limit) {
      events = events.slice(0, limit);
    }

    return events;
  }

  async resetQuota(profileName: string): Promise<void> {
    await this.ensureInitialized();

    const state = this.quotaStates.get(profileName);
    if (!state) {
      throw new Error('Profile quota not initialized: ' + profileName);
    }

    const updatedState = this.stateManager.resetQuota(state);
    this.quotaStates.set(profileName, updatedState);
    await this.syncToStorage();
  }

  async syncToStorage(): Promise<void> {
    try {
      const stateObject: { [profileName: string]: QuotaState } = {};
      for (const [name, state] of Array.from(this.quotaStates.entries())) {
        // Update last sync time
        state.metadata.lastSync = Date.now();
        stateObject[name] = state;
      }

      await this.persistence.saveState(stateObject);
    } catch (error) {
      console.error('Failed to sync quota state to storage:', error);
      throw error;
    }
  }

  async loadFromStorage(): Promise<void> {
    try {
      const stateObject = await this.persistence.loadState();
      this.quotaStates.clear();

      for (const [profileName, state] of Object.entries(stateObject)) {
        this.quotaStates.set(profileName, state);
      }
    } catch (error) {
      console.error('Failed to load quota state from storage:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await this.ensureInitialized();

    // Flush any pending batches before cleanup
    await this.flushAllBatches();

    // Clear batch timer
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }

    for (const [profileName, state] of Array.from(this.quotaStates.entries())) {
      const cleanedState = this.stateManager.cleanup(state);
      this.quotaStates.set(profileName, cleanedState);
    }

    await this.syncToStorage();
  }

  /**
   * Generate analytics for a profile's usage over a time window (in days).
   * This provides higher-level insights on quota consumption patterns.
   */
  async getAnalytics(profileName: string, days: number): Promise<QuotaAnalytics | null> {
    await this.ensureInitialized();

    const state = this.quotaStates.get(profileName);
    if (!state) {
      return null;
    }

    const now = Date.now();
    const windowStart = now - days * 24 * 60 * 60 * 1000;

    const eventsInWindow = state.events.filter(event => event.timestamp >= windowStart && event.timestamp <= now);
    const totalRequests = eventsInWindow.filter(event => event.type === 'request').length;

    if (totalRequests === 0) {
      return {
        totalRequests: 0,
        avgRequestsPerDay: 0,
        peakUsageDay: {
          date: new Date(now).toISOString().slice(0, 10),
          requests: 0
        },
        usageTrend: 'stable',
        projectedUsage: {
          daily: 0,
          weekly: 0,
          monthly: 0
        }
      };
    }

    const daysInWindow = Math.max(days, 1);
    const avgRequestsPerDay = totalRequests / daysInWindow;

    const requestsByDay: Record<string, number> = {};
    for (const event of eventsInWindow) {
      if (event.type !== 'request') continue;
      const dayKey = new Date(event.timestamp).toISOString().slice(0, 10);
      requestsByDay[dayKey] = (requestsByDay[dayKey] || 0) + 1;
    }

    const peakDayEntry = Object.entries(requestsByDay).sort((a, b) => b[1] - a[1])[0];
    const peakUsageDay = {
      date: peakDayEntry?.[0] ?? new Date(now).toISOString().slice(0, 10),
      requests: peakDayEntry?.[1] ?? 0
    };

    const dailyProjected = avgRequestsPerDay;
    const weeklyProjected = avgRequestsPerDay * 7;
    const monthlyProjected = avgRequestsPerDay * 30;

    const firstDayCount = Object.values(requestsByDay)[0];
    const lastDayCount = Object.values(requestsByDay)[Object.values(requestsByDay).length - 1];
    let usageTrend: QuotaAnalytics['usageTrend'] = 'stable';
    if (lastDayCount > firstDayCount) {
      usageTrend = 'increasing';
    } else if (lastDayCount < firstDayCount) {
      usageTrend = 'decreasing';
    }

    return {
      totalRequests,
      avgRequestsPerDay,
      peakUsageDay,
      usageTrend,
      projectedUsage: {
        daily: dailyProjected,
        weekly: weeklyProjected,
        monthly: monthlyProjected
      }
    };
  }

  /**
   * Filter events based on simple criteria such as type, profile, and time range.
   */
  async filterEvents(filter: QuotaEventFilter): Promise<QuotaEvent[]> {
    await this.ensureInitialized();

    const allEvents: QuotaEvent[] = [];
    for (const state of this.quotaStates.values()) {
      if (filter.profileName && state.profileName !== filter.profileName) {
        continue;
      }
      allEvents.push(...state.events);
    }

    let filtered = allEvents;

    if (filter.type) {
      filtered = filtered.filter(event => event.type === filter.type);
    }

    if (filter.timeRange) {
      filtered = filtered.filter(event =>
        event.timestamp >= filter.timeRange!.start &&
        event.timestamp <= filter.timeRange!.end
      );
    }

    if (filter.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    profilesCount: number;
    totalEvents: number;
    cacheStats: { size: number; entries: Array<{ profile: string; age: number }> };
    configuration: QuotaConfiguration;
  } {
    const totalEvents = Array.from(this.quotaStates.values())
      .reduce((sum, state) => sum + state.events.length, 0);

    return {
      profilesCount: this.quotaStates.size,
      totalEvents,
      cacheStats: this.stateManager.getCacheStats(),
      configuration: this.configuration
    };
  }
}

// Factory functions for convenience
export function createQuotaManager(
  configuration?: Partial<QuotaConfiguration>,
  mafStateRoot?: string
): QuotaManager {
  const config = { ...DEFAULT_QUOTA_CONFIGURATION, ...configuration };
  const persistence = new QuotaStatePersistence(mafStateRoot);
  return new QuotaManager(config, persistence);
}

export function createQuotaManagerWithDefaults(
  dailyLimit: number = DEFAULT_QUOTA_LIMITS.daily,
  weeklyLimit: number = DEFAULT_QUOTA_LIMITS.weekly,
  monthlyLimit: number = DEFAULT_QUOTA_LIMITS.monthly
): QuotaManager {
  const limits: QuotaLimits = {
    daily: dailyLimit,
    weekly: weeklyLimit,
    monthly: monthlyLimit
  };

  return createQuotaManager();
}
