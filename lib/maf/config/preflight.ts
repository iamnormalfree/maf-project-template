// ABOUTME: Configuration management for MAF preflight system
// ABOUTME: Handles JSON schema validation, environment overrides, and versioning

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// JSON Schema for preflight configurations
export const PREFLIGHT_CONFIG_SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'configType', 'config'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Unique identifier for the configuration'
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Human-readable name for the configuration'
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Optional description of what this configuration does'
    },
    configType: {
      type: 'string',
      enum: ['smoke_test', 'reservation_check', 'escalation_path'],
      description: 'Type of preflight configuration'
    },
    config: {
      type: 'object',
      description: 'Configuration object specific to the config type'
    },
    environmentOverrides: {
      type: 'object',
      description: 'Environment-specific configuration overrides'
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Semantic version of the configuration'
    },
    isActive: {
      type: 'boolean',
      description: 'Whether this configuration is currently active'
    },
    metadata: {
      type: 'object',
      description: 'Additional metadata for the configuration'
    }
  }
};

export interface PreflightConfig {
  id: string;
  name: string;
  description?: string;
  configType: 'smoke_test' | 'reservation_check' | 'escalation_path';
  config: Record<string, any>;
  environmentOverrides?: Record<string, Record<string, any>>;
  version: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export interface SmokeTestConfig extends PreflightConfig {
  configType: 'smoke_test';
  config: {
    testType: 'api' | 'database' | 'file_system' | 'integration' | 'performance';
    testDefinition: Record<string, any>;
    timeoutSeconds?: number;
    retryCount?: number;
  };
}

export interface ReservationCheckConfig extends PreflightConfig {
  configType: 'reservation_check';
  config: {
    checkType: 'file_exists' | 'permissions' | 'concurrent_access' | 'lock_validation';
    parameters: Record<string, any>;
    escalationPath?: string;
  };
}

export interface EscalationPathConfig extends PreflightConfig {
  configType: 'escalation_path';
  config: {
    triggerConditions: Array<{
      condition: string;
      threshold?: number;
      operator?: 'gt' | 'lt' | 'eq' | 'ne';
    }>;
    escalationSteps: Array<{
      level: number;
      action: 'notify' | 'approve' | 'reject' | 'escalate';
      target: string;
      timeoutMinutes?: number;
    }>;
    timeoutMinutes?: number;
    maxEscalationLevel?: number;
  };
}

export class PreflightConfigManager {
  private configPath: string;
  private environment: string;

  constructor(configPath: string = '.maf/preflight-configs', environment: string = 'development') {
    this.configPath = configPath;
    this.environment = environment;
  }

  /**
   * Ensure configuration directory exists
   */
  private ensureDirectoryExists(): void {
    if (!existsSync(this.configPath)) {
      mkdirSync(this.configPath, { recursive: true });
    }
  }

  /**
   * Validate a configuration against the JSON schema
   */
  validateConfig(config: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!config.id || typeof config.id !== 'string') {
      errors.push('Configuration must have a valid id');
    }

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Configuration must have a valid name');
    }

    if (!config.configType || !['smoke_test', 'reservation_check', 'escalation_path'].includes(config.configType)) {
      errors.push('Configuration must have a valid configType');
    }

    if (!config.config || typeof config.config !== 'object') {
      errors.push('Configuration must have a valid config object');
    }

    // Type-specific validation
    if (config.configType === 'smoke_test') {
      const smokeConfig = config as SmokeTestConfig;
      if (!smokeConfig.config.testType || !['api', 'database', 'file_system', 'integration', 'performance'].includes(smokeConfig.config.testType)) {
        errors.push('Smoke test config must have a valid testType');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Load a configuration by ID
   */
  loadConfig(configId: string): PreflightConfig | null {
    try {
      const filePath = join(this.configPath, `${configId}.json`);
      if (!existsSync(filePath)) {
        return null;
      }

      const content = readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);

      // Apply environment overrides if present
      if (config.environmentOverrides && config.environmentOverrides[this.environment]) {
        config.config = {
          ...config.config,
          ...config.environmentOverrides[this.environment]
        };
      }

      return config;
    } catch (error) {
      console.error(`Failed to load config ${configId}:`, error);
      return null;
    }
  }

  /**
   * Save a configuration
   */
  saveConfig(config: PreflightConfig): boolean {
    try {
      // Validate before saving
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        console.error('Configuration validation failed:', validation.errors);
        return false;
      }

      // Ensure directory exists
      this.ensureDirectoryExists();

      // Add timestamps
      const now = Date.now();
      config.updatedAt = now;
      if (!config.createdAt) {
        config.createdAt = now;
      }

      const filePath = join(this.configPath, `${config.id}.json`);
      const content = JSON.stringify(config, null, 2);
      
      writeFileSync(filePath, content);
      return true;
    } catch (error) {
      console.error(`Failed to save config ${config.id}:`, error);
      return false;
    }
  }

  /**
   * List all available configurations
   */
  listConfigs(): string[] {
    try {
      if (!existsSync(this.configPath)) {
        return [];
      }

      const fs = require('fs');
      const files = fs.readdirSync(this.configPath);
      return files
        .filter((file: string) => file.endsWith('.json'))
        .map((file: string) => file.replace('.json', ''));
    } catch (error) {
      console.error('Failed to list configs:', error);
      return [];
    }
  }

  /**
   * Delete a configuration
   */
  deleteConfig(configId: string): boolean {
    try {
      const filePath = join(this.configPath, `${configId}.json`);
      if (existsSync(filePath)) {
        const fs = require('fs');
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete config ${configId}:`, error);
      return false;
    }
  }

  /**
   * Migrate configuration to a new version
   */
  migrateConfig(configId: string, targetVersion: string): boolean {
    try {
      const config = this.loadConfig(configId);
      if (!config) {
        return false;
      }

      // Simple version bump migration
      // In a real implementation, this would handle breaking changes
      config.version = targetVersion;
      config.updatedAt = Date.now();

      return this.saveConfig(config);
    } catch (error) {
      console.error(`Failed to migrate config ${configId}:`, error);
      return false;
    }
  }
}

// Default configuration manager instance
export const defaultConfigManager = new PreflightConfigManager();
