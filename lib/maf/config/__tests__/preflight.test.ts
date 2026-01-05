// ABOUTME: Test suite for preflight configuration management system

import { PreflightConfigManager, PREFLIGHT_CONFIG_SCHEMA, defaultConfigManager } from '../preflight';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('PreflightConfigManager', () => {
  const testConfigPath = '/tmp/test-maf-preflight-configs';
  let configManager: PreflightConfigManager;

  beforeEach(() => {
    // Clean up test config directory
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true, force: true });
    }
    
    configManager = new PreflightConfigManager(testConfigPath, 'test');
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true, force: true });
    }
  });

  describe('Configuration Validation', () => {
    it('should validate a valid smoke test configuration', () => {
      const config = {
        id: 'test-smoke-1',
        name: 'Test Smoke Check',
        configType: 'smoke_test',
        config: {
          testType: 'api',
          testDefinition: {
            endpoint: '/api/health',
            method: 'GET',
            expectedStatus: 200
          }
        },
        version: '1.0.0'
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid reservation check configuration', () => {
      const config = {
        id: 'test-reservation-1',
        name: 'Test Reservation Check',
        configType: 'reservation_check',
        config: {
          checkType: 'file_exists',
          parameters: {
            filePath: '/tmp/test.txt'
          }
        },
        version: '1.0.0'
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid escalation path configuration', () => {
      const config = {
        id: 'test-escalation-1',
        name: 'Test Escalation Path',
        configType: 'escalation_path',
        config: {
          triggerConditions: [
            { condition: 'reservation_conflict', threshold: 3 }
          ],
          escalationSteps: [
            { level: 1, action: 'notify', target: 'supervisor' },
            { level: 2, action: 'escalate', target: 'manager' }
          ]
        },
        version: '1.0.0'
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid configurations', () => {
      const invalidConfig = {
        // Missing required fields
        name: 'Invalid Config'
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid config types', () => {
      const config = {
        id: 'test-invalid',
        name: 'Invalid Config',
        configType: 'invalid_type',
        config: {},
        version: '1.0.0'
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Configuration must have a valid configType');
    });

    it('should reject invalid smoke test types', () => {
      const config = {
        id: 'test-smoke-invalid',
        name: 'Invalid Smoke Test',
        configType: 'smoke_test',
        config: {
          testType: 'invalid_type',
          testDefinition: {}
        },
        version: '1.0.0'
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Smoke test config must have a valid testType');
    });
  });

  describe('Configuration Persistence', () => {
    it('should save and load configurations', () => {
      const config = {
        id: 'test-persistence-1',
        name: 'Test Persistence',
        configType: 'smoke_test',
        config: {
          testType: 'api',
          testDefinition: { endpoint: '/test' }
        },
        version: '1.0.0'
      };

      // Save configuration
      expect(configManager.saveConfig(config)).toBe(true);

      // Load configuration
      const loadedConfig = configManager.loadConfig('test-persistence-1');
      expect(loadedConfig).toBeDefined();
      expect(loadedConfig!.id).toBe(config.id);
      expect(loadedConfig!.name).toBe(config.name);
      expect(loadedConfig!.createdAt).toBeDefined();
      expect(loadedConfig!.updatedAt).toBeDefined();
    });

    it('should return null for non-existent configurations', () => {
      const loadedConfig = configManager.loadConfig('non-existent');
      expect(loadedConfig).toBeNull();
    });

    it('should reject invalid configurations during save', () => {
      const invalidConfig = {
        name: 'Invalid Config'
      };

      expect(configManager.saveConfig(invalidConfig as any)).toBe(false);
    });

    it('should list all configurations', () => {
      const config1 = {
        id: 'test-list-1',
        name: 'Test Config 1',
        configType: 'smoke_test',
        config: { testType: 'api', testDefinition: {} },
        version: '1.0.0'
      };

      const config2 = {
        id: 'test-list-2',
        name: 'Test Config 2',
        configType: 'reservation_check',
        config: { checkType: 'file_exists', parameters: {} },
        version: '1.0.0'
      };

      // Save configurations
      expect(configManager.saveConfig(config1)).toBe(true);
      expect(configManager.saveConfig(config2)).toBe(true);

      // List configurations
      const configs = configManager.listConfigs();
      expect(configs).toContain('test-list-1');
      expect(configs).toContain('test-list-2');
      expect(configs).toHaveLength(2);
    });

    it('should delete configurations', () => {
      const config = {
        id: 'test-delete-1',
        name: 'Test Delete',
        configType: 'smoke_test',
        config: { testType: 'api', testDefinition: {} },
        version: '1.0.0'
      };

      // Save configuration
      expect(configManager.saveConfig(config)).toBe(true);
      expect(configManager.listConfigs()).toContain('test-delete-1');

      // Delete configuration
      expect(configManager.deleteConfig('test-delete-1')).toBe(true);
      expect(configManager.listConfigs()).not.toContain('test-delete-1');
    });

    it('should return false when deleting non-existent configuration', () => {
      expect(configManager.deleteConfig('non-existent')).toBe(false);
    });
  });

  describe('Environment Overrides', () => {
    it('should apply environment-specific overrides', () => {
      const config = {
        id: 'test-env-override',
        name: 'Test Environment Override',
        configType: 'smoke_test',
        config: {
          testType: 'api',
          testDefinition: {
            endpoint: 'http://localhost:3000/api/test'
          }
        },
        environmentOverrides: {
          test: {
            testDefinition: {
              endpoint: 'http://test-server:3000/api/test'
            }
          },
          production: {
            testDefinition: {
              endpoint: 'https://api.production.com/test'
            }
          }
        },
        version: '1.0.0'
      };

      // Save configuration
      expect(configManager.saveConfig(config)).toBe(true);

      // Load with test environment
      const testConfigManager = new PreflightConfigManager(testConfigPath, 'test');
      const loadedConfig = testConfigManager.loadConfig('test-env-override');
      
      expect(loadedConfig!.config.testDefinition.endpoint).toBe('http://test-server:3000/api/test');
    });
  });

  describe('Configuration Migration', () => {
    it('should migrate configuration to new version', () => {
      const config = {
        id: 'test-migrate-1',
        name: 'Test Migration',
        configType: 'smoke_test',
        config: { testType: 'api', testDefinition: {} },
        version: '1.0.0'
      };

      // Save configuration
      expect(configManager.saveConfig(config)).toBe(true);

      // Migrate to new version
      expect(configManager.migrateConfig('test-migrate-1', '2.0.0')).toBe(true);

      // Verify version was updated
      const migratedConfig = configManager.loadConfig('test-migrate-1');
      expect(migratedConfig!.version).toBe('2.0.0');
    });

    it('should return false when migrating non-existent configuration', () => {
      expect(configManager.migrateConfig('non-existent', '2.0.0')).toBe(false);
    });
  });

  describe('Default Config Manager', () => {
    it('should create default config manager', () => {
      expect(defaultConfigManager).toBeDefined();
      expect(defaultConfigManager instanceof PreflightConfigManager).toBe(true);
    });
  });
});
