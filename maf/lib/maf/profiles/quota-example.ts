// ABOUTME: Usage examples for quota tracking system
// ABOUTME: Demonstrates integration with existing MAF profile management

import {
  createQuotaManager,
  createQuotaManagerWithDefaults
} from './quota-manager';
import type { QuotaLimits, QuotaEvent } from './quota-types';
import type { CodexProfile } from './types';

/**
 * Example: Initialize quota tracking for existing profiles
 */
export async function initializeQuotaForExistingProfiles(profiles: CodexProfile[]): Promise<void> {
  const quotaManager = createQuotaManager();

  for (const profile of profiles) {
    if (profile.active) {
      // Define quota limits based on profile characteristics
      const limits: QuotaLimits = {
        daily: profile.priority <= 3 ? 2000 : 1000,  // Higher priority gets more quota
        weekly: profile.priority <= 3 ? 10000 : 5000,
        monthly: profile.priority <= 3 ? 30000 : 15000
      };

      await quotaManager.initializeProfileQuota(profile.name, limits);
      console.log('Initialized quota tracking for profile: ' + profile.name);
    }
  }
}

/**
 * Example: Record API request with quota tracking
 */
export async function recordApiRequest(
  profileName: string, 
  endpoint: string, 
  model: string, 
  tokens: number = 0
): Promise<boolean> {
  const quotaManager = createQuotaManager();

  // Check if profile is within quota before making request
  const withinQuota = await quotaManager.isWithinQuota(profileName);
  if (!withinQuota) {
    const health = await quotaManager.getHealthIndicator(profileName);
    console.warn('Profile ' + profileName + ' has exceeded quota limits ' + health);
    return false;
  }

  // Record the request
  await quotaManager.recordRequest(profileName, {
    endpoint,
    model,
    tokens,
    cost: calculateTokenCost(model, tokens)
  });

  // Get updated status
  const status = await quotaManager.getQuotaStatus(profileName);
  if (status) {
    console.log('Profile ' + profileName + ' quota status: ' + status.healthEmoji + ' ' + status.daily.percentage.toFixed(1) + '% daily');
  }

  return true;
}

/**
 * Example: Monitor quota health across all profiles
 */
export async function monitorQuotaHealth(): Promise<void> {
  const quotaManager = createQuotaManager();
  const stats = quotaManager.getStats();

  console.log('Quota monitoring for ' + stats.profilesCount + ' profiles:');
  console.log('Total events recorded: ' + stats.totalEvents);
  console.log('Cache entries: ' + stats.cacheStats.size);

  // This would require getting all profile names from the quota manager
  // For demonstration, we'll show how to check a specific profile
  const exampleProfiles = ['primary', 'secondary', 'tertiary']; // These would come from your config

  for (const profileName of exampleProfiles) {
    const status = await quotaManager.getQuotaStatus(profileName);
    if (status) {
      console.log('\\n' + profileName + ':');
      console.log('  Health: ' + status.healthEmoji + ' ' + status.health);
      console.log('  Daily: ' + status.daily.used + '/' + status.daily.limit + ' (' + status.daily.percentage.toFixed(1) + '%)');
      console.log('  Weekly: ' + status.weekly.used + '/' + status.weekly.limit + ' (' + status.weekly.percentage.toFixed(1) + '%)');
      console.log('  Monthly: ' + status.monthly.used + '/' + status.monthly.limit + ' (' + status.monthly.percentage.toFixed(1) + '%)');
      
      // Show rolling window peak usage
      const peakWindow = status.rollingWindows.reduce((peak, current) => 
        current.requests > peak.requests ? current : peak
      );
      console.log('  Peak 5h window: ' + peakWindow.requests + ' requests');
    }
  }
}

/**
 * Helper function to calculate token cost (example implementation)
 */
function calculateTokenCost(model: string, tokens: number): number {
  // Example pricing (would be replaced with actual pricing data)
  const pricing: { [model: string]: number } = {
    'claude-3-sonnet': 0.015 / 1000, // $0.015 per 1K tokens
    'claude-3-haiku': 0.00025 / 1000, // $0.00025 per 1K tokens
    'claude-3-opus': 0.075 / 1000, // $0.075 per 1K tokens
    'default': 0.001 / 1000 // Default fallback pricing
  };

  const rate = pricing[model] || pricing['default'];
  return tokens * rate;
}

// Example usage in your application:
export async function exampleUsage() {
  // Initialize quota tracking
  const quotaManager = createQuotaManagerWithDefaults(1000, 5000, 15000);
  
  // Initialize profiles
  await quotaManager.initializeProfileQuota('development', {
    daily: 500,
    weekly: 2000,
    monthly: 6000
  });
  
  await quotaManager.initializeProfileQuota('production', {
    daily: 2000,
    weekly: 10000,
    monthly: 30000
  });

  // Record some usage
  const success = await recordApiRequest(
    'production',
    '/api/v1/completions',
    'claude-3-sonnet',
    1500
  );
  
  if (success) {
    console.log('Request completed successfully');
  } else {
    console.log('Request blocked due to quota limits');
  }

  // Monitor health
  await monitorQuotaHealth();
}
