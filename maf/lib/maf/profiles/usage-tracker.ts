// ABOUTME: Rate limit monitoring and usage tracking for MAF Codex profiles

import { UsageTracker, RateLimitWindow, ProfileUsageData } from './types';

export class CodexUsageTracker implements UsageTracker {
  private usageData: Map<string, ProfileUsageData> = new Map();

  constructor() {}

  recordUsage(profileName: string, timestamp: number): void {
    let data = this.usageData.get(profileName);
    
    if (!data) {
      data = {
        profileName,
        windows: [],
        totalRequests: 0,
        firstUsed: timestamp,
        lastUsed: timestamp
      };
      this.usageData.set(profileName, data);
    }

    // Update last used timestamp
    data.lastUsed = timestamp;
    data.totalRequests++;

    // Record usage in appropriate windows would be handled by the profile manager
    // This just tracks the raw usage data
  }

  isRateLimited(profileName: string): boolean {
    const data = this.usageData.get(profileName);
    if (!data) return false;

    const now = Date.now();
    
    // Check current windows against their limits
    // This is a simplified check - full implementation would compare against profile limits
    for (const window of data.windows) {
      if (now <= window.end && window.count >= this.getMaxRequestsForProfile(profileName)) {
        return true;
      }
    }

    return false;
  }

  getUsageStats(profileName: string): {
    requests: number;
    window: number;
    currentUsage: number;
    remainingRequests: number;
    resetTime: number;
  } | null {
    const data = this.usageData.get(profileName);
    if (!data) return null;

    const maxRequests = this.getMaxRequestsForProfile(profileName);
    const windowSize = this.getWindowSizeForProfile(profileName);
    const now = Date.now();
    
    // Find current usage window
    let currentUsage = 0;
    let resetTime = now + windowSize * 1000;
    
    for (const window of data.windows) {
      if (now <= window.end) {
        currentUsage = window.count;
        resetTime = window.end;
        break;
      }
    }

    return {
      requests: maxRequests,
      window: windowSize,
      currentUsage,
      remainingRequests: Math.max(0, maxRequests - currentUsage),
      resetTime
    };
  }

  resetUsage(profileName: string): void {
    const data = this.usageData.get(profileName);
    if (data) {
      data.windows = [];
    }
  }

  /**
   * Add a rate limit window for a profile
   */
  addRateLimitWindow(profileName: string, window: RateLimitWindow): void {
    let data = this.usageData.get(profileName);
    
    if (!data) {
      data = {
        profileName,
        windows: [],
        totalRequests: 0,
        firstUsed: Date.now(),
        lastUsed: Date.now()
      };
      this.usageData.set(profileName, data);
    }

    data.windows.push(window);
    
    // Clean up old windows
    this.cleanupOldWindows(profileName);
  }

  /**
   * Remove expired windows to prevent memory leaks
   */
  private cleanupOldWindows(profileName: string): void {
    const data = this.usageData.get(profileName);
    if (!data) return;

    const now = Date.now();
    const windowSize = this.getWindowSizeForProfile(profileName) * 1000;
    const cutoffTime = now - windowSize;

    data.windows = data.windows.filter(window => window.end > cutoffTime);
  }

  /**
   * Get max requests for profile (simplified - would get from profile config)
   */
  private getMaxRequestsForProfile(profileName: string): number {
    // Default to 1000 requests per window - would be configurable per profile
    return 1000;
  }

  /**
   * Get window size for profile in seconds (simplified - would get from profile config)
   */
  private getWindowSizeForProfile(profileName: string): number {
    // Default to 3600 seconds (1 hour) - would be configurable per profile
    return 3600;
  }

  /**
   * Get all usage data for debugging
   */
  getAllUsageData(): Map<string, ProfileUsageData> {
    return new Map(this.usageData);
  }

  /**
   * Clear all usage data (for testing)
   */
  clearAllUsage(): void {
    this.usageData.clear();
  }
}
