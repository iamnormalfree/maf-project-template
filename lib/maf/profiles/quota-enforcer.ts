// ABOUTME: Quota enforcement helper for CLI operations with profile fallback and health indicators
// ABOUTME: Integrates with quota manager to enforce limits before task claiming operations

import { createQuotaManager } from './quota-manager';
import type { 
  QuotaManager, 
  QuotaStatus, 
  QuotaLimits,
  CodexProfile 
} from './quota-types';
import { CodexProfileManager } from './profile-manager';

export interface QuotaEnforcementOptions {
  enabled?: boolean;
  enableFallback?: boolean;
  mafStateRoot?: string;
  customLimits?: QuotaLimits;
}

export interface QuotaEnforcementResult {
  allowed: boolean;
  selectedProfile: string;
  quotaStatus?: QuotaStatus;
  healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
  warnings: string[];
  errors: string[];
  fallbackAttempts: number;
  profilesChecked: string[];
}

export interface QuotaAwareCliArgs {
  agentId?: string;
  verbose?: boolean;
  json?: boolean;
  preferredProfile?: string;
}

const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  daily: 1000,
  weekly: 5000,
  monthly: 15000
};

export class QuotaEnforcer {
  private readonly quotaManager: QuotaManager;
  private readonly profileManager: CodexProfileManager;
  private readonly options: Required<QuotaEnforcementOptions>;

  constructor(options: QuotaEnforcementOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      enableFallback: options.enableFallback ?? true,
      mafStateRoot: options.mafStateRoot ?? '.maf/state',
      customLimits: options.customLimits || { daily: 1000, weekly: 5000, monthly: 20000 }
    };

    this.quotaManager = createQuotaManager(undefined, this.options.mafStateRoot);
    this.profileManager = new CodexProfileManager();
  }

  async initialize(): Promise<void> {
    await this.profileManager.loadProfiles();
    await this.quotaManager.loadFromStorage();
  }

  async checkQuotaAndSelectProfile(args: QuotaAwareCliArgs): Promise<QuotaEnforcementResult> {
    const result: QuotaEnforcementResult = {
      allowed: false,
      selectedProfile: '',
      healthIndicator: '🟢',
      warnings: [],
      errors: [],
      fallbackAttempts: 0,
      profilesChecked: []
    };

    try {
      if (!this.options.enabled) {
        const selectedProfile = this.selectProfileWithoutQuota(args);
        result.allowed = true;
        result.selectedProfile = selectedProfile;
        result.warnings.push('Quota enforcement is disabled');
        return result;
      }

      const activeProfiles = this.getActiveProfilesForQuota();
      
      if (activeProfiles.length === 0) {
        result.errors.push('No active profiles available for quota checking');
        return result;
      }

      let profilesToCheck = activeProfiles;
      if (args.preferredProfile) {
        const preferred = activeProfiles.find(p => p.name === args.preferredProfile);
        if (preferred) {
          profilesToCheck = [preferred, ...activeProfiles.filter(p => p.name !== args.preferredProfile)];
        } else {
          result.warnings.push('Preferred profile not found or inactive');
        }
      }

      for (const profile of profilesToCheck) {
        result.profilesChecked.push(profile.name);
        
        const quotaCheck = await this.checkProfileQuota(profile);
        
        if (quotaCheck.allowed) {
          result.allowed = true;
          result.selectedProfile = profile.name;
          result.quotaStatus = quotaCheck.quotaStatus;
          result.healthIndicator = quotaCheck.healthIndicator;
          
          if (quotaCheck.warnings.length > 0) {
            result.warnings.push(...quotaCheck.warnings);
          }
          
          break;
        } else {
          result.warnings.push('Profile quota exceeded');
          
          if (this.options.enableFallback && result.fallbackAttempts < profilesToCheck.length - 1) {
            result.fallbackAttempts++;
          }
        }
      }

      if (!result.allowed && result.fallbackAttempts > 0) {
        result.errors.push('All profiles have exceeded quota limits');
      } else if (!result.allowed) {
        result.errors.push('Profile quota exceeded: Limits reached');
      }

      return result;

    } catch (error) {
      result.errors.push('Quota check failed');
      return result;
    }
  }

  async recordUsage(profileName: string, details?: { task?: string; agent?: string; endpoint?: string; model?: string; tokens?: number; cost?: number; }): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    try {
      await this.quotaManager.recordRequest(profileName, details);
    } catch (error) {
      console.warn('Failed to record quota usage:', error);
    }
  }

  async getQuotaStatus(profileName: string): Promise<QuotaStatus | null> {
    return await this.quotaManager.getQuotaStatus(profileName);
  }

  async isProfileWithinQuota(profileName: string): Promise<boolean> {
    return await this.quotaManager.isWithinQuota(profileName);
  }

  async getProfileHealthIndicator(profileName: string): Promise<'🟢' | '🟡' | '🔴' | '🚨'> {
    return await this.quotaManager.getHealthIndicator(profileName);
  }

  private async checkProfileQuota(profile: CodexProfile): Promise<{
    allowed: boolean;
    quotaStatus?: QuotaStatus;
    healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
    warnings: string[];
    reason?: string;
  }> {
    const warnings: string[] = [];

    try {
      const limits = this.getProfileQuotaLimits(profile);
      await this.initializeProfileQuotaIfNeeded(profile.name, limits);

      const quotaStatus = await this.quotaManager.getQuotaStatus(profile.name);
      if (!quotaStatus) {
        return {
          allowed: true,
          healthIndicator: '🟢',
          warnings: ['Quota status not available, proceeding anyway'],
          reason: 'No quota status available'
        };
      }

      const withinQuota = await this.quotaManager.isWithinQuota(profile.name);
      const healthIndicator = await this.quotaManager.getHealthIndicator(profile.name);

      if (quotaStatus.daily.percentage > 50) {
        const dailyPercent = quotaStatus.daily.percentage.toFixed(1);
        warnings.push('Daily quota usage: ' + dailyPercent + '%');
      }
      if (quotaStatus.weekly.percentage > 50) {
        const weeklyPercent = quotaStatus.weekly.percentage.toFixed(1);
        warnings.push('Weekly quota usage: ' + weeklyPercent + '%');
      }

      return {
        allowed: withinQuota,
        quotaStatus,
        healthIndicator,
        warnings,
        reason: withinQuota ? undefined : 'Quota limits exceeded'
      };

    } catch (error) {
      return {
        allowed: true,
        healthIndicator: '🟢',
        warnings: ['Quota check error'],
        reason: 'Quota check failed'
      };
    }
  }

  private getProfileQuotaLimits(profile: CodexProfile): QuotaLimits {
    if (this.options.customLimits) {
      return this.options.customLimits;
    }

    if ((profile as any).quota_limits) {
      return (profile as any).quota_limits;
    }

    return DEFAULT_QUOTA_LIMITS;
  }

  private async initializeProfileQuotaIfNeeded(profileName: string, limits: QuotaLimits): Promise<void> {
    try {
      const existingStatus = await this.quotaManager.getQuotaStatus(profileName);
      if (!existingStatus) {
        await this.quotaManager.initializeProfileQuota(profileName, limits);
      }
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('already initialized'))) {
        throw error;
      }
    }
  }

  private getActiveProfilesForQuota(): CodexProfile[] {
    return this.profileManager.getActiveProfiles()
      .filter(profile => 
        profile.active && 
        (profile.name.startsWith('codex-plus') || profile.name.startsWith('claude-'))
      );
  }

  private selectProfileWithoutQuota(args: QuotaAwareCliArgs): string {
    if (args.preferredProfile) {
      const profile = this.profileManager.getProfile(args.preferredProfile);
      if (profile && profile.active) {
        return profile.name;
      }
    }

    const selectedProfile = this.profileManager.selectProfile();
    return selectedProfile?.name || 'unknown';
  }
}

export function createQuotaEnforcer(options?: QuotaEnforcementOptions): QuotaEnforcer {
  return new QuotaEnforcer(options);
}
