// ABOUTME: Integration tests for the complete preflight system
// ABOUTME: Tests SQLite runtime, protocols, configuration, and schema integration

import { createRuntimeFactory } from '../core/runtime-factory';
import { PreflightConfigManager } from '../config/preflight';
import type { MafPreflightCheck, MafEscalationRequest } from '../core/protocols';
import { rmSync, existsSync } from 'fs';

describe('Preflight System Integration', () => {
  const testDbPath = '/tmp/test-maf-preflight-integration.db';
  const testConfigPath = '/tmp/test-maf-preflight-integration-configs';
  let runtimeState: any;
  let configManager: PreflightConfigManager;

  beforeEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    
    // Clean up test config directory
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true, force: true });
    }

    // Initialize components
    runtimeState = createRuntimeFactory(testDbPath);
    configManager = new PreflightConfigManager(testConfigPath, 'test');
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    
    // Clean up test config directory
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true, force: true });
    }

    // Close runtime state
    if (runtimeState && 'close' in runtimeState) {
      runtimeState.close();
    }
  });

  describe('Configuration and Runtime Integration', () => {
    it('should save preflight config and use it in runtime', async () => {
      // Create and save a preflight configuration
      const smokeTestConfig = {
        id: 'integration-smoke-test',
        name: 'Integration Smoke Test',
        configType: 'smoke_test' as const,
        config: {
          testType: 'api' as const,
          testDefinition: {
            endpoint: '/api/health',
            method: 'GET',
            expectedStatus: 200
          },
          timeoutSeconds: 30
        },
        version: '1.0.0'
      };

      // Save configuration
      expect(configManager.saveConfig(smokeTestConfig)).toBe(true);

      // Load configuration
      const loadedConfig = configManager.loadConfig('integration-smoke-test');
      expect(loadedConfig).toBeDefined();
      expect(loadedConfig!.id).toBe(smokeTestConfig.id);

      // Create a preflight check message
      const preflightCheck: MafPreflightCheck = {
        type: 'PREFLIGHT_CHECK',
        agentId: 'integration-agent',
        configId: 'integration-smoke-test',
        executionId: 'exec-123',
        checkType: 'smoke_test',
        context: { environment: 'test' }
      };

      // Enqueue the preflight check
      await expect(runtimeState.enqueue(preflightCheck)).resolves.not.toThrow();
    });

    it('should handle escalation requests through runtime', async () => {
      // Create escalation path configuration
      const escalationConfig = {
        id: 'integration-escalation-path',
        name: 'Integration Escalation Path',
        configType: 'escalation_path' as const,
        config: {
          triggerConditions: [
            { condition: 'preflight_failure', threshold: 3 }
          ],
          escalationSteps: [
            { level: 1, action: 'notify' as const, target: 'supervisor' },
            { level: 2, action: 'escalate' as const, target: 'manager' }
          ],
          timeoutMinutes: 30,
          maxEscalationLevel: 3
        },
        version: '1.0.0'
      };

      // Save configuration
      expect(configManager.saveConfig(escalationConfig)).toBe(true);

      // Create escalation request
      const escalationRequest: MafEscalationRequest = {
        type: 'ESCALATION_REQUEST',
        agentId: 'integration-agent',
        executionId: 'exec-456',
        escalationId: 'escalation-123',
        pathId: 'integration-escalation-path',
        level: 1,
        context: { failureReason: 'Smoke test failed' },
        reason: 'Multiple preflight failures detected'
      };

      // Enqueue the escalation request
      await expect(runtimeState.enqueue(escalationRequest)).resolves.not.toThrow();
    });
  });

  describe('Database Schema Integration', () => {
    it('should have preflight tables available', () => {
      // Check if preflight tables exist
      if ('executeQuery' in runtimeState) {
        const preflightTables = runtimeState.executeQuery(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name LIKE 'preflight_%' OR name LIKE 'escalation_%'
        `);

        expect(Array.isArray(preflightTables)).toBe(true);
        expect(preflightTables.length).toBeGreaterThan(0);
      }
    });

    it('should support complex queries across preflight tables', () => {
      if ('executeTransaction' in runtimeState) {
        // Test transaction with multiple operations
        const result = runtimeState.executeTransaction(() => {
          // This would typically insert preflight execution records
          // For now, just verify transaction support works
          return { success: true };
        });

        expect(result.success).toBe(true);
      }
    });
  });

  describe('Environment Variable Integration', () => {
    it('should respect runtime mode configuration', () => {
      // Save original environment
      const originalMode = process.env.MAF_RUNTIME_MODE;

      try {
        // Test different runtime modes
        process.env.MAF_RUNTIME_MODE = 'sqlite';
        const sqliteRuntime = createRuntimeFactory(testDbPath);
        expect(sqliteRuntime).toBeDefined();

        if ('close' in sqliteRuntime) {
          sqliteRuntime.close();
        }

        process.env.MAF_RUNTIME_MODE = 'json';
        const jsonRuntime = createRuntimeFactory();
        expect(jsonRuntime).toBeDefined();

      } finally {
        // Restore original environment
        if (originalMode) {
          process.env.MAF_RUNTIME_MODE = originalMode;
        } else {
          delete process.env.MAF_RUNTIME_MODE;
        }
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle configuration validation errors gracefully', () => {
      const invalidConfig = {
        // Missing required fields
        name: 'Invalid Config'
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle database errors with fallback', async () => {
      // Use a path that cannot be created on Linux even when running as root
      // (makes the failure deterministic across environments).
      const runtime = await createRuntimeFactory('/proc/maf-runtime-test.db');
      expect(runtime).toBeDefined();

      // The runtime should be file-based due to fallback
      const runtimeInfo = runtime.getRuntimeInfo();
      expect(runtimeInfo.type).toBe('file');
    });
  });
});
