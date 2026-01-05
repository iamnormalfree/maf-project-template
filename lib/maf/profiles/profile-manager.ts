// ABOUTME: Core profile management logic for MAF multi-Codex account support

import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  CodexProfile, 
  CodexProfilesConfig, 
  CodexProfileMetadata, 
  ProfileManager, 
  ProfileLoaderOptions,
  ProfileValidationResult,
  ProfileValidationError
} from './types';
import { CodexInheritanceResolver } from './inheritance-resolver';
import { CodexUsageTracker } from './usage-tracker';

export class CodexProfileManager implements ProfileManager {
  private config: CodexProfilesConfig | null = null;
  private configPath: string;
  private envDir: string;
  private inheritanceResolver: CodexInheritanceResolver;
  private usageTracker: CodexUsageTracker;
  private roundRobinIndex: number = 0;

  constructor(options: ProfileLoaderOptions = {}) {
    this.configPath = options.configPath || '.maf/config/default-agent-config.json';
    this.envDir = options.envPath || '.maf/credentials';
    this.inheritanceResolver = new CodexInheritanceResolver();
    this.usageTracker = new CodexUsageTracker();
  }

  async loadProfiles(): Promise<void> {
    try {
      // Load main configuration file
      const configData = await fs.readFile(this.configPath, 'utf8');
      const agentConfig = JSON.parse(configData);

      // Initialize with default structure if codex_profiles doesn't exist
      if (!agentConfig.codex_profiles) {
        agentConfig.codex_profiles = this.getDefaultMetadata();
      }

      // Load environment files for profile credentials
      const profileEnvFiles = await this.loadProfileEnvironmentFiles();

      // Merge environment files into profile configurations
      const profiles = this.mergeEnvironmentFiles(agentConfig.profiles || {}, profileEnvFiles);

      this.config = {
        codex_profiles: agentConfig.codex_profiles,
        profiles
      };

      // Validate configuration
      if (this.config) {
        const validation = this.validateConfig(this.config);
        if (!validation.valid) {
          throw new Error('Configuration validation failed: ' + 
            validation.errors.map(e => e.field + ': ' + e.message).join(', '));
        }
      }

    } catch (error) {
      throw new Error('Failed to load profiles: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  getProfile(name: string): CodexProfile | null {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }
    return this.config.profiles[name] || null;
  }

  getActiveProfiles(): CodexProfile[] {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }
    return Object.values(this.config.profiles)
      .filter(profile => profile.active)
      .sort((a, b) => a.priority - b.priority);
  }

  selectProfile(agentType?: string): CodexProfile | null {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }

    const metadata = this.config.codex_profiles;
    if (!metadata.enable) {
      return null;
    }

    // Get active profiles
    const activeProfiles = this.getActiveProfiles();
    if (activeProfiles.length === 0) {
      return null;
    }

    const selection = metadata.selection;
    let selectedProfile: CodexProfile | null = null;

    switch (selection.algorithm) {
      case 'priority':
        selectedProfile = this.selectByPriority(activeProfiles, selection.priority);
        break;
      case 'random':
        selectedProfile = this.selectRandom(activeProfiles);
        break;
      case 'round-robin':
      default:
        selectedProfile = this.selectRoundRobin(activeProfiles);
        break;
    }

    // If rate limiting is enforced and selected profile is limited, try fallback
    if (selection.enforce_rate_limit && selectedProfile && 
        this.usageTracker.isRateLimited(selectedProfile.name)) {
      
      if (selection.fallback_priority) {
        selectedProfile = this.selectByPriority(activeProfiles, selection.fallback_priority);
      } else {
        // Find next available profile that isn't rate limited
        selectedProfile = this.findNextAvailableProfile(activeProfiles);
      }
    }

    return selectedProfile;
  }

  getResolvedProfile(name: string): CodexProfile | null {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }
    return this.inheritanceResolver.resolveInheritance(name, this.config.profiles);
  }

  getProfileEnvironment(name: string): { [key: string]: string } | null {
    const profile = this.getResolvedProfile(name);
    return profile?.environment || null;
  }

  markProfileUsed(name: string): void {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }

    const profile = this.config.profiles[name];
    if (profile) {
      profile.last_used = new Date().toISOString();
    }

    // Record usage for rate limiting
    this.usageTracker.recordUsage(name, Date.now());

    // Update current profile in metadata
    if (this.config.codex_profiles) {
      this.config.codex_profiles.current_profile = name;
    }
  }

  rotateProfile(currentProfile?: string): CodexProfile | null {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }

    const metadata = this.config.codex_profiles;
    const activeProfiles = this.getActiveProfiles();

    if (activeProfiles.length <= 1) {
      return currentProfile ? this.getProfile(currentProfile) : null;
    }

    // Find current profile index
    const currentIndex = currentProfile ? 
      activeProfiles.findIndex(p => p.name === currentProfile) : -1;

    // Move to next profile
    const nextIndex = (currentIndex + 1) % activeProfiles.length;
    const nextProfile = activeProfiles[nextIndex];

    // Update rotation state
    metadata.rotation_state.current_attempt++;
    metadata.rotation_state.last_rotation = new Date().toISOString();

    return nextProfile;
  }

  updateMetadata(updates: Partial<CodexProfileMetadata>): void {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }
    this.config.codex_profiles = { ...this.config.codex_profiles, ...updates };
  }

  getConfig(): CodexProfilesConfig {
    if (!this.config) {
      throw new Error('Profiles not loaded. Call loadProfiles() first.');
    }
    return this.config;
  }

  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save.');
    }

    try {
      // Read existing config to preserve other sections
      const existingData = await fs.readFile(this.configPath, 'utf8');
      const existingConfig = JSON.parse(existingData);

      // Update only the codex_profiles section
      existingConfig.codex_profiles = this.config.codex_profiles;
      
      // Write back to file
      await fs.writeFile(this.configPath, JSON.stringify(existingConfig, null, 2));
    } catch (error) {
      throw new Error('Failed to save configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  // Private helper methods

  private getDefaultMetadata(): CodexProfileMetadata {
    return {
      enable: true,
      default_profile: 'claude-sonnet-4',
      selection: {
        algorithm: 'round-robin',
        enforce_rate_limit: true,
        fallback_priority: 5
      },
      rotation_monitoring: 5,
      max_rotation_attempts: 3,
      rotation_state: {
        current_attempt: 0,
        last_rotation: new Date().toISOString(),
        escalation_notified: false
      }
    };
  }

  private async loadProfileEnvironmentFiles(): Promise<{ [profileName: string]: { [key: string]: string } }> {
    const envFiles: { [profileName: string]: { [key: string]: string } } = {};

    try {
      const files = await fs.readdir(this.envDir);
      const envFilePattern = /^([a-zA-Z0-9_-]+)\.env$/;

      for (const file of files) {
        const match = file.match(envFilePattern);
        if (match) {
          const profileName = match[1];
          const filePath = path.join(this.envDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          envFiles[profileName] = this.parseEnvFile(content);
        }
      }
    } catch (error) {
      // Directory might not exist, that's ok
      console.warn('Could not load environment files from', this.envDir);
    }

    return envFiles;
  }

  private parseEnvFile(content: string): { [key: string]: string } {
    const env: { [key: string]: string } = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          const value = trimmed.substring(equalIndex + 1).trim();
          // Remove quotes if present
          env[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    return env;
  }

  private mergeEnvironmentFiles(
    profiles: { [name: string]: CodexProfile }, 
    envFiles: { [profileName: string]: { [key: string]: string } }
  ): { [name: string]: CodexProfile } {
    const merged = { ...profiles };

    for (const [profileName, envVars] of Object.entries(envFiles)) {
      if (merged[profileName]) {
        merged[profileName].environment = { 
          ...merged[profileName].environment, 
          ...envVars 
        };
      } else {
        // Create profile from environment file
        merged[profileName] = {
          name: profileName,
          priority: 10,
          environment: envVars,
          active: true
        };
      }
    }

    return merged;
  }

  private selectByPriority(profiles: CodexProfile[], priority?: number): CodexProfile | null {
    if (priority !== undefined) {
      const filtered = profiles.filter(p => p.priority === priority);
      if (filtered.length > 0) {
        return filtered[0];
      }
    }
    // Return highest priority (lowest number)
    return profiles.sort((a, b) => a.priority - b.priority)[0] || null;
  }

  private selectRandom(profiles: CodexProfile[]): CodexProfile | null {
    if (profiles.length === 0) return null;
    const index = Math.floor(Math.random() * profiles.length);
    return profiles[index];
  }

  private selectRoundRobin(profiles: CodexProfile[]): CodexProfile | null {
    if (profiles.length === 0) return null;
    const profile = profiles[this.roundRobinIndex % profiles.length];
    this.roundRobinIndex++;
    return profile;
  }

  private findNextAvailableProfile(profiles: CodexProfile[]): CodexProfile | null {
    for (const profile of profiles) {
      if (!this.usageTracker.isRateLimited(profile.name)) {
        return profile;
      }
    }
    return null; // All profiles are rate limited
  }

  private validateConfig(config: CodexProfilesConfig): ProfileValidationResult {
    const errors: ProfileValidationError[] = [];

    // Validate metadata
    const metadata = config.codex_profiles;
    if (!metadata) {
      errors.push({
        field: 'codex_profiles',
        message: 'codex_profiles section is required'
      });
    } else {
      if (typeof metadata.enable !== 'boolean') {
        errors.push({
          field: 'codex_profiles.enable',
          message: 'enable must be a boolean'
        });
      }

      if (!metadata.default_profile) {
        errors.push({
          field: 'codex_profiles.default_profile',
          message: 'default_profile is required'
        });
      }
    }

    // Validate profiles
    if (!config.profiles || Object.keys(config.profiles).length === 0) {
      errors.push({
        field: 'profiles',
        message: 'at least one profile must be defined'
      });
    } else {
      // Validate inheritance relationships
      const inheritanceErrors = this.inheritanceResolver.validateInheritance(config.profiles);
      errors.push(...inheritanceErrors);

      // Validate each profile
      for (const [profileName, profile] of Object.entries(config.profiles)) {
        if (!profile.name) {
          errors.push({
            field: `profiles.${profileName}.name`,
            message: 'profile name is required'
          });
        }

        if (typeof profile.priority !== 'number') {
          errors.push({
            field: `profiles.${profileName}.priority`,
            message: 'priority must be a number'
          });
        }

        if (profile.active === undefined) {
          errors.push({
            field: `profiles.${profileName}.active`,
            message: 'active flag is required'
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
