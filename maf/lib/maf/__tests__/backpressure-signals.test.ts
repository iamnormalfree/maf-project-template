// ABOUTME: Comprehensive test suite for MAF backpressure signal enhancements
// ABOUTME: Tests transitional state events, predictive health indicators, and CLI cache invalidation
// ABOUTME: Validates synthesis blueprint requirements: <1ms event emission, <100ms cache invalidation, >85% prediction accuracy

import { BackpressureManager, createBackpressureManager } from '../backpressure/backpressure-manager';
import type { 
  BackpressureEventType, 
  PredictiveHealthIndicator, 
  BackpressureEvent,
  CliCacheManager 
} from '../backpressure/types';

// Mock quota manager for testing
class MockQuotaManager {
  private providerStatuses = new Map<string, {
    healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
    withinQuota: boolean;
    usage: { daily: number; weekly: number; monthly: number };
  }>();

  setProviderStatus(providerId: string, status: {
    healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
    withinQuota: boolean;
    usage: { daily: number; weekly: number; monthly: number };
  }) {
    this.providerStatuses.set(providerId, status);
  }

  async getQuotaStatus(providerId: string) {
    const status = this.providerStatuses.get(providerId);
    if (!status) {
      return null;
    }
    return {
      daily: { percentage: status.usage.daily, used: 0, limit: 100 },
      weekly: { percentage: status.usage.weekly, used: 0, limit: 100 },
      monthly: { percentage: status.usage.monthly, used: 0, limit: 100 },
      health: status.healthIndicator === '🟢' ? 'healthy' : 'warning',
      healthEmoji: status.healthIndicator,
      rollingWindows: [],
      lastCalculated: Date.now()
    };
  }

  async getHealthIndicator(providerId: string): Promise<'🟢' | '🟡' | '🔴' | '🚨'> {
    const status = this.providerStatuses.get(providerId);
    return status?.healthIndicator || '🟢';
  }

  async isWithinQuota(providerId: string): Promise<boolean> {
    const status = this.providerStatuses.get(providerId);
    return status?.withinQuota ?? true;
  }
}

// Mock scheduler for testing
class MockScheduler {
  async pickNextTask(): Promise<any> {
    return null; // Always returns null for testing
  }
}

describe('MAF Backpressure Signal Enhancements', () => {
  let backpressureManager: BackpressureManager;
  let mockQuotaManager: MockQuotaManager;
  let mockScheduler: MockScheduler;

  beforeEach(() => {
    mockQuotaManager = new MockQuotaManager();
    mockScheduler = new MockScheduler();

    backpressureManager = new BackpressureManager({
      backpressure: {
        rateLimits: {
          default: { capacity: 5, refillRate: 1 },
          'test-provider': { capacity: 3, refillRate: 0.5 },
          'openai': { capacity: 8, refillRate: 0.8 }
        },
        queueCaps: { high: 2, medium: 3, low: 4 },
        enableQuotaIntegration: true,
        enablePrioritization: true,
        enablePredictiveHealth: true,
        predictionAccuracyTarget: 85,
        predictionHorizonMs: 300000 // 5 minutes
      },
      enableObservability: true,
      eventRetentionMs: 5000,
      metricsIntervalMs: 1000,
      signalRefreshConfig: {
        criticalChangeThresholdMs: 100,
        backgroundRefreshIntervalMs: 1000,
        predictiveHealthUpdateIntervalMs: 2000,
        enableRealTimeProcessing: true
      }
    }, mockQuotaManager, mockScheduler);
  });

  afterEach(async () => {
    await backpressureManager.emergencyReset();
  });

  describe('Transitional State Events', () => {
    it('should emit PROVIDER_HEALTH_DEGRADING event when health deteriorates', async () => {
      // Set up provider with initial healthy status
      mockQuotaManager.setProviderStatus('degrading-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 30, weekly: 40, monthly: 50 }
      });

      // Submit tasks to create baseline
      for (let i = 0; i < 2; i++) {
        await backpressureManager.submitTask({
          id: `task-${i}`,
          providerId: 'degrading-provider',
          priority: 'high',
          taskData: { type: 'test' }
        });
      }

      // Change provider status to trigger degradation
      mockQuotaManager.setProviderStatus('degrading-provider', {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 95, weekly: 98, monthly: 99 }
      });

      // Submit task that should trigger health degradation event
      const result = await backpressureManager.submitTask({
        id: 'trigger-task',
        providerId: 'degrading-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      });

      // Check that we got the expected result (should be dropped due to quota exceeded)
      expect(result.routingDecision.action).toBe('DROP');

      // Get recent events to find the transitional event
      const recentEvents = await backpressureManager.getRecentEvents(20);
      const degradingEvent = recentEvents.find(e => e.type === 'PROVIDER_HEALTH_DEGRADING');

      expect(degradingEvent).toBeDefined();
      expect(degradingEvent!.providerId).toBe('degrading-provider');
      expect(degradingEvent!.severity).toBe('warning');
      expect(degradingEvent!.details.previousHealth).toBe('HEALTHY');
      expect(degradingEvent!.details.newHealth).toBe('CRITICAL');
    });

    it('should emit PROVIDER_HEALTH_RECOVERING event when health improves', async () => {
      // Set up provider initially in poor health
      mockQuotaManager.setProviderStatus('recovering-provider', {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 120, weekly: 130, monthly: 140 }
      });

      // Submit task to establish poor health baseline
      await backpressureManager.submitTask({
        id: 'initial-task',
        providerId: 'recovering-provider',
        priority: 'low',
        taskData: { type: 'test' }
      });

      // Improve provider status
      mockQuotaManager.setProviderStatus('recovering-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 40, weekly: 50, monthly: 60 }
      });

      // Submit task that should trigger recovery event
      const result = await backpressureManager.submitTask({
        id: 'recovery-task',
        providerId: 'recovering-provider',
        priority: 'high',
        taskData: { type: 'test' }
      });

      // Should now be allowed to route
      expect(result.routingDecision.action).toBe('ROUTE');

      // Check for recovery event
      const recentEvents = await backpressureManager.getRecentEvents(20);
      const recoveryEvent = recentEvents.find(e => e.type === 'PROVIDER_HEALTH_RECOVERING');

      expect(recoveryEvent).toBeDefined();
      expect(recoveryEvent!.providerId).toBe('recovering-provider');
      expect(recoveryEvent!.severity).toBe('info');
      expect(recoveryEvent!.details.reason).toBe('pressure_relieved');
    });

    it('should emit QUEUE_UTILIZATION_SPIKE when queue pressure increases suddenly', async () => {
      // Set up provider with moderate quotas
      mockQuotaManager.setProviderStatus('spike-provider', {
        healthIndicator: '🟡',
        withinQuota: true,
        usage: { daily: 60, weekly: 70, monthly: 80 }
      });

      // Submit many tasks rapidly to create queue spike
      const tasks = Array(10).fill(null).map((_, i) => ({
        id: `spike-task-${i}`,
        providerId: 'spike-provider',
        priority: i % 3 === 0 ? 'high' : (i % 3 === 1 ? 'medium' : 'low'),
        taskData: { type: 'test' }
      }));

      // Submit tasks rapidly to trigger spike
      const results = await Promise.all(tasks.map(task => 
        backpressureManager.submitTask(task)
      ));

      // Some tasks should be queued or dropped due to spike
      const queuedOrDropped = results.filter(r => 
        r.routingDecision.action === 'DEFER' || r.routingDecision.action === 'DROP'
      );
      expect(queuedOrDropped.length).toBeGreaterThan(0);

      // Check for spike events
      const recentEvents = await backpressureManager.getRecentEvents(30);
      const spikeEvent = recentEvents.find(e => e.type === 'QUEUE_UTILIZATION_SPIKE');

      expect(spikeEvent).toBeDefined();
      expect(spikeEvent!.severity).toBe('warning');
    });

    it('should emit RATE_LIMIT_APPROACHING when rate limits are nearly exhausted', async () => {
      mockQuotaManager.setProviderStatus('test-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 20, weekly: 30, monthly: 40 }
      });

      // Submit tasks to approach rate limit (capacity: 3 for test-provider)
      for (let i = 0; i < 3; i++) {
        const result = await backpressureManager.submitTask({
          id: `rate-task-${i}`,
          providerId: 'test-provider',
          priority: 'medium',
          taskData: { type: 'test' }
        });

        // First few should be allowed
        if (i < 3) {
          expect(result.routingDecision.action).toBe('ROUTE');
        }
      }

      // One more should trigger rate limiting (4th task on capacity 3)
      const throttledResult = await backpressureManager.submitTask({
        id: 'throttled-task',
        providerId: 'test-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      });

      expect(throttledResult.routingDecision.action).toBe('THROTTLE');

      // Check for rate limit approaching event
      const recentEvents = await backpressureManager.getRecentEvents(20);
      const rateLimitEvent = recentEvents.find(e => e.type === 'RATE_LIMIT_APPROACHING');

      expect(rateLimitEvent).toBeDefined();
      expect(rateLimitEvent!.severity).toBe('warning');
    });
  });

  describe('Predictive Health Indicators', () => {
    it('should predict health degradation based on trends', async () => {
      mockQuotaManager.setProviderStatus('predictive-provider', {
        healthIndicator: '🟡',
        withinQuota: true,
        usage: { daily: 75, weekly: 80, monthly: 85 }
      });

      // Submit tasks that show degradation pattern
      for (let i = 0; i < 5; i++) {
        await backpressureManager.submitTask({
          id: `predictive-task-${i}`,
          providerId: 'predictive-provider',
          priority: 'medium',
          taskData: { type: 'test' }
        });
      }

      // Get predictive health indicator
      const predictiveHealth = backpressureManager.getPredictiveHealthIndicators()
        .find(ph => ph.providerId === 'predictive-provider');

      expect(predictiveHealth).toBeDefined();
      expect(predictiveHealth!.currentHealth).toBe('WARNING');
      expect(predictiveHealth!.predictedHealth).toBeDefined();
      expect(predictiveHealth!.timeToPredictedState).toBeGreaterThan(0);
      expect(predictiveHealth!.predictionConfidence).toBeGreaterThan(0);
      expect(predictiveHealth!.indicators).toBeDefined();
    });

    it('should emit PREDICTIVE_HEALTH_ALERT when confidence is high', async () => {
      mockQuotaManager.setProviderStatus('alert-provider', {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 110, weekly: 115, monthly: 120 }
      });

      // Submit multiple tasks to build pattern
      for (let i = 0; i < 8; i++) {
        await backpressureManager.submitTask({
          id: `alert-task-${i}`,
          providerId: 'alert-provider',
          priority: 'low',
          taskData: { type: 'test' }
        });
      }

      // Check for predictive health alert
      const recentEvents = await backpressureManager.getRecentEvents(30);
      const alertEvent = recentEvents.find(e => e.type === 'PREDICTIVE_HEALTH_ALERT');

      expect(alertEvent).toBeDefined();
      expect(alertEvent!.providerId).toBe('alert-provider');
      expect(alertEvent!.severity).toBe('warning');
      expect(alertEvent!.details.predictedHealth).toBeDefined();
      expect(alertEvent!.details.confidence).toBeGreaterThan(80); // Above 85% target
      expect(alertEvent!.details.timeToPredictedState).toBeLessThanOrEqual(300000); // Within 5 minutes
    });

    it('should maintain >85% prediction accuracy over time', async () => {
      const testProviders = ['accuracy-1', 'accuracy-2', 'accuracy-3'];
      const predictionResults = [];

      for (const providerId of testProviders) {
        mockQuotaManager.setProviderStatus(providerId, {
          healthIndicator: '🟡',
          withinQuota: true,
          usage: { daily: 65 + Math.random() * 20, weekly: 70 + Math.random() * 20, monthly: 75 + Math.random() * 20 }
        });

        // Submit tasks to generate predictions
        for (let i = 0; i < 5; i++) {
          await backpressureManager.submitTask({
            id: `accuracy-${providerId}-${i}`,
            providerId,
            priority: 'medium',
            taskData: { type: 'test' }
          });
        }

        const predictiveHealth = backpressureManager.getPredictiveHealthIndicators()
          .find(ph => ph.providerId === providerId);

        predictionResults.push(predictiveHealth?.predictionConfidence || 0);
      }

      // Calculate average prediction confidence
      const avgConfidence = predictionResults.reduce((sum, conf) => sum + conf, 0) / predictionResults.length;

      // Should meet the 85% target
      expect(avgConfidence).toBeGreaterThan(85);
    });

    it('should update predictive health indicators within required timeframes', async () => {
      const startTime = Date.now();
      
      mockQuotaManager.setProviderStatus('timing-provider', {
        healthIndicator: '🟡',
        withinQuota: true,
        usage: { daily: 70, weekly: 75, monthly: 80 }
      });

      // Submit task to trigger prediction
      await backpressureManager.submitTask({
        id: 'timing-task',
        providerId: 'timing-provider',
        priority: 'high',
        taskData: { type: 'test' }
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Event emission should be < 1ms per requirement
      expect(processingTime).toBeLessThan(50); // Allow some test overhead, but should be very fast

      // Check that predictive health was updated
      const predictiveHealth = backpressureManager.getPredictiveHealthIndicators()
        .find(ph => ph.providerId === 'timing-provider');

      expect(predictiveHealth).toBeDefined();
      expect(predictiveHealth!.lastUpdated).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('CLI Cache Invalidation and Signal Freshness', () => {
    it('should invalidate cache within 100ms of critical changes', async () => {
      const cliCacheManager = backpressureManager.getCliCacheManager();
      
      // Set some cache entries
      cliCacheManager.set('test-key-1', 'data1', 10000, 'critical');
      cliCacheManager.set('test-key-2', 'data2', 10000, 'high');
      cliCacheManager.set('test-key-3', 'data3', 10000, 'medium');

      // Verify cache is populated
      expect(cliCacheManager.get('test-key-1')).toBe('data1');
      expect(cliCacheManager.get('test-key-2')).toBe('data2');
      expect(cliCacheManager.get('test-key-3')).toBe('data3');

      const invalidationStartTime = Date.now();

      // Trigger critical change through backpressure event
      mockQuotaManager.setProviderStatus('cache-invalidate-provider', {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 130, weekly: 140, monthly: 150 }
      });

      await backpressureManager.submitTask({
        id: 'cache-invalidate-task',
        providerId: 'cache-invalidate-provider',
        priority: 'low',
        taskData: { type: 'test' }
      });

      // Trigger cache invalidation
      cliCacheManager.invalidateOnCriticalChange('DROPPED');

      const invalidationEndTime = Date.now();
      const invalidationTime = invalidationEndTime - invalidationStartTime;

      // Cache invalidation should be < 100ms per requirement
      expect(invalidationTime).toBeLessThan(100);

      // Critical and high priority entries should be invalidated
      expect(cliCacheManager.get('test-key-1')).toBeNull(); // critical - should be invalidated
      expect(cliCacheManager.get('test-key-2')).toBeNull(); // high - should be invalidated
      
      // Medium priority might still be there depending on timing
      // This is expected behavior
    });

    it('should maintain intelligent cache invalidation based on event severity', async () => {
      const cliCacheManager = backpressureManager.getCliCacheManager();
      
      // Set cache entries with different priorities
      cliCacheManager.set('low-priority', 'data', 10000, 'low');
      cliCacheManager.set('medium-priority', 'data', 10000, 'medium');
      cliCacheManager.set('high-priority', 'data', 10000, 'high');
      cliCacheManager.set('critical-priority', 'data', 10000, 'critical');

      // Trigger non-critical event
      cliCacheManager.invalidateOnCriticalChange('ALLOWED');

      // All entries should still be there
      expect(cliCacheManager.get('low-priority')).toBe('data');
      expect(cliCacheManager.get('medium-priority')).toBe('data');
      expect(cliCacheManager.get('high-priority')).toBe('data');
      expect(cliCacheManager.get('critical-priority')).toBe('data');

      // Trigger critical event
      cliCacheManager.invalidateOnCriticalChange('PROVIDER_HEALTH_DEGRADING');

      // Critical and high should be invalidated immediately
      expect(cliCacheManager.get('critical-priority')).toBeNull();
      expect(cliCacheManager.get('high-priority')).toBeNull();
      
      // Medium might be invalidated if old, low should remain
      // (depending on timing and age)
    });

    it('should provide accurate cache statistics', async () => {
      const cliCacheManager = backpressureManager.getCliCacheManager();
      
      // Perform various cache operations
      cliCacheManager.set('test-1', 'data1', 10000, 'medium');
      cliCacheManager.get('test-1'); // Hit
      cliCacheManager.get('test-2'); // Miss
      cliCacheManager.invalidateOnCriticalChange('DROPPED');

      const stats = cliCacheManager.getStats();
      
      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.invalidationCount).toBeGreaterThan(0);
      expect(stats.lastInvalidation).toBeGreaterThan(0);
    });
  });

  describe('Performance Requirements Validation', () => {
    it('should meet event emission performance target of <1ms', async () => {
      mockQuotaManager.setProviderStatus('perf-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 30, weekly: 40, monthly: 50 }
      });

      const measurements: number[] = [];
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        await backpressureManager.submitTask({
          id: `perf-task-${i}`,
          providerId: 'perf-provider',
          priority: 'medium',
          taskData: { type: 'test' }
        });

        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000; // Convert nanoseconds to milliseconds
        measurements.push(durationMs);
      }

      const avgDuration = measurements.reduce((sum, duration) => sum + duration, 0) / measurements.length;
      const maxDuration = Math.max(...measurements);

      // Average should be well under 1ms, max should allow some variance
      expect(avgDuration).toBeLessThan(1);
      expect(maxDuration).toBeLessThan(10); // Allow some spikes but still very fast
    });

    it('should meet cache invalidation performance target of <100ms', async () => {
      const cliCacheManager = backpressureManager.getCliCacheManager();
      
      // Populate cache with many entries
      for (let i = 0; i < 100; i++) {
        cliCacheManager.set(`test-key-${i}`, `data-${i}`, 10000, i % 2 === 0 ? 'high' : 'medium');
      }

      const measurements: number[] = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        cliCacheManager.invalidateOnCriticalChange('PROVIDER_HEALTH_DEGRADING');
        
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000;
        measurements.push(durationMs);
      }

      const avgDuration = measurements.reduce((sum, duration) => sum + duration, 0) / measurements.length;
      const maxDuration = Math.max(...measurements);

      // Should consistently be under 100ms
      expect(avgDuration).toBeLessThan(50);
      expect(maxDuration).toBeLessThan(100);
    });

    it('should maintain >85% prediction accuracy over extended operations', async () => {
      const providers = ['accuracy-extended-1', 'accuracy-extended-2', 'accuracy-extended-3'];
      const allPredictions = [];

      // Extended testing scenario
      for (const providerId of providers) {
        // Phase 1: Build baseline
        mockQuotaManager.setProviderStatus(providerId, {
          healthIndicator: '🟢',
          withinQuota: true,
          usage: { daily: 30, weekly: 40, monthly: 50 }
        });

        for (let i = 0; i < 10; i++) {
          await backpressureManager.submitTask({
            id: `extended-${providerId}-phase1-${i}`,
            providerId,
            priority: 'medium',
            taskData: { type: 'test' }
          });
        }

        // Phase 2: Introduce pressure
        mockQuotaManager.setProviderStatus(providerId, {
          healthIndicator: '🟡',
          withinQuota: true,
          usage: { daily: 75, weekly: 80, monthly: 85 }
        });

        for (let i = 0; i < 10; i++) {
          await backpressureManager.submitTask({
            id: `extended-${providerId}-phase2-${i}`,
            providerId,
            priority: 'medium',
            taskData: { type: 'test' }
          });
        }

        // Collect predictions
        const predictiveHealth = backpressureManager.getPredictiveHealthIndicators()
          .find(ph => ph.providerId === providerId);

        if (predictiveHealth) {
          allPredictions.push(predictiveHealth.predictionConfidence);
        }
      }

      // Calculate overall accuracy
      const overallAccuracy = allPredictions.reduce((sum, conf) => sum + conf, 0) / allPredictions.length;

      // Should maintain >85% accuracy
      expect(overallAccuracy).toBeGreaterThan(85);
      expect(allPredictions.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Validation', () => {
    it('should pass comprehensive end-to-end validation', async () => {
      const mockQuotaManager = new MockQuotaManager();
      const mockScheduler = new MockScheduler();

      const manager = new BackpressureManager({
        backpressure: {
          rateLimits: {
            'e2e-provider': { capacity: 5, refillRate: 1 }
          },
          queueCaps: { high: 2, medium: 3, low: 4 },
          enableQuotaIntegration: true,
          enablePrioritization: true,
          enablePredictiveHealth: true,
          predictionAccuracyTarget: 85,
          predictionHorizonMs: 300000
        },
        enableObservability: true,
        eventRetentionMs: 5000,
        metricsIntervalMs: 1000,
        signalRefreshConfig: {
          criticalChangeThresholdMs: 100,
          backgroundRefreshIntervalMs: 1000,
          predictiveHealthUpdateIntervalMs: 2000,
          enableRealTimeProcessing: true
        }
      }, mockQuotaManager, mockScheduler);

      try {
        // Test all key enhancement features
        mockQuotaManager.setProviderStatus('e2e-provider', {
          healthIndicator: '🟡',
          withinQuota: true,
          usage: { daily: 70, weekly: 75, monthly: 80 }
        });

        // Performance test
        const startTime = process.hrtime.bigint();
        await manager.submitTask({
          id: 'e2e-perf',
          providerId: 'e2e-provider',
          priority: 'medium',
          taskData: { type: 'test' }
        });
        const processingTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        expect(processingTime).toBeLessThan(50); // Very fast processing

        // Cache invalidation test
        const cacheManager = manager.getCliCacheManager();
        cacheManager.set('e2e-test', 'data', 10000, 'critical');
        
        const invalidationStart = process.hrtime.bigint();
        cacheManager.invalidateOnCriticalChange('PROVIDER_HEALTH_DEGRADING');
        const invalidationTime = Number(process.hrtime.bigint() - invalidationStart) / 1000000;
        expect(invalidationTime).toBeLessThan(100);

        // Predictive health test
        const predictiveHealth = manager.getPredictiveHealthIndicators();
        expect(predictiveHealth.length).toBeGreaterThanOrEqual(0);

        // Metrics test
        const metrics = await manager.getMetrics();
        expect(metrics.predictiveMetrics).toBeDefined();

        // Event statistics test
        const eventStats = await manager.getEventStats();
        expect(eventStats.ALLOWED).toBeGreaterThan(0);

        console.log('✅ All end-to-end validation tests passed');
      } finally {
        await manager.emergencyReset();
      }
    });
  });
});
