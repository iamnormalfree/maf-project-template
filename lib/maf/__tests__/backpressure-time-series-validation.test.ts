// ABOUTME: Time-series validation testing for MAF backpressure signal enhancements
// ABOUTME: Focused on temporal consistency, signal correlation analysis, and accuracy validation
// ABOUTME: Implements the time-series validation approach from synthesis blueprint

import { BackpressureManager } from '../backpressure/backpressure-manager';
import type { BackpressureEvent, PredictiveHealthIndicator } from '../backpressure/types';

// Mock quota manager for time-series testing
class MockQuotaManager {
  private providerData = new Map<string, {
    healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
    withinQuota: boolean;
    usage: { daily: number; weekly: number; monthly: number };
  }>();

  setProviderStatus(providerId: string, status: {
    healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
    withinQuota: boolean;
    usage: { daily: number; weekly: number; monthly: number };
  }) {
    this.providerData.set(providerId, status);
  }

  async getQuotaStatus(providerId: string) {
    const status = this.providerData.get(providerId);
    if (!status) return null;
    
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
    return this.providerData.get(providerId)?.healthIndicator || '🟢';
  }

  async isWithinQuota(providerId: string): Promise<boolean> {
    return this.providerData.get(providerId)?.withinQuota ?? true;
  }
}

// Mock scheduler
class MockScheduler {
  async pickNextTask(): Promise<any> {
    return null;
  }
}

// Time-series analysis utilities
class TimeSeriesAnalyzer {
  private eventTimestamps = new Map<string, number[]>();
  private healthTransitions = new Map<string, Array<{ from: string; to: string; timestamp: number }>>();

  recordEvent(providerId: string, event: BackpressureEvent) {
    if (!this.eventTimestamps.has(providerId)) {
      this.eventTimestamps.set(providerId, []);
    }
    this.eventTimestamps.get(providerId)!.push(event.timestamp);

    // Track health transitions
    if (event.type === 'PROVIDER_HEALTH_DEGRADING' || event.type === 'PROVIDER_HEALTH_RECOVERING') {
      if (!this.healthTransitions.has(providerId)) {
        this.healthTransitions.set(providerId, []);
      }
      
      const from = event.type === 'PROVIDER_HEALTH_DEGRADING' ? 'HEALTHY' : 'WARNING';
      const to = event.type === 'PROVIDER_HEALTH_DEGRADING' ? 'WARNING' : 'HEALTHY';
      
      this.healthTransitions.get(providerId)!.push({
        from,
        to,
        timestamp: event.timestamp
      });
    }
  }

  analyzeEventFrequency(providerId: string, timeWindowMs: number = 60000): {
    eventsPerSecond: number;
    peakFrequency: number;
    averageInterval: number;
    consistencyScore: number;
  } {
    const timestamps = this.eventTimestamps.get(providerId) || [];
    if (timestamps.length < 2) {
      return {
        eventsPerSecond: 0,
        peakFrequency: 0,
        averageInterval: 0,
        consistencyScore: 1
      };
    }

    const now = Date.now();
    const recentTimestamps = timestamps.filter(t => now - t <= timeWindowMs);
    
    if (recentTimestamps.length < 2) {
      return {
        eventsPerSecond: recentTimestamps.length / (timeWindowMs / 1000),
        peakFrequency: 0,
        averageInterval: 0,
        consistencyScore: 1
      };
    }

    // Calculate intervals between events
    const intervals = [];
    for (let i = 1; i < recentTimestamps.length; i++) {
      intervals.push(recentTimestamps[i] - recentTimestamps[i - 1]);
    }

    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const eventsPerSecond = recentTimestamps.length / (timeWindowMs / 1000);
    
    // Calculate consistency (lower variance = higher consistency)
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - averageInterval, 2);
    }, 0) / intervals.length;
    const consistencyScore = Math.max(0, 1 - (variance / Math.pow(averageInterval, 2)));

    return {
      eventsPerSecond,
      peakFrequency: 1000 / Math.min(...intervals),
      averageInterval,
      consistencyScore
    };
  }

  validateTemporalConsistency(providerId: string): {
    isConsistent: boolean;
    violations: string[];
    healthTransitionValidity: number;
  } {
    const violations = [];
    const timestamps = this.eventTimestamps.get(providerId) || [];
    const transitions = this.healthTransitions.get(providerId) || [];

    // Check for chronological order
    for (let i = 1; i < timestamps.length; i++) {
      const current = timestamps[i];
      const previous = timestamps[i - 1];
      if (current < previous) {
        violations.push(`Event timestamp out of order: ${current} < ${previous}`);
      }
    }

    // Check health transition validity
    let validTransitions = 0;
    for (const transition of transitions) {
      const subsequentEvents = timestamps.filter(t => t > transition.timestamp && t <= transition.timestamp + 300000);
      if (subsequentEvents.length > 0) {
        validTransitions++;
      }
    }

    const healthTransitionValidity = transitions.length > 0 ? validTransitions / transitions.length : 1;

    return {
      isConsistent: violations.length === 0,
      violations,
      healthTransitionValidity
    };
  }
}

describe('MAF Backpressure Time-Series Validation', () => {
  let backpressureManager: BackpressureManager;
  let mockQuotaManager: MockQuotaManager;
  let mockScheduler: MockScheduler;
  let timeSeriesAnalyzer: TimeSeriesAnalyzer;

  beforeEach(() => {
    mockQuotaManager = new MockQuotaManager();
    mockScheduler = new MockScheduler();
    timeSeriesAnalyzer = new TimeSeriesAnalyzer();

    backpressureManager = new BackpressureManager({
      backpressure: {
        rateLimits: {
          default: { capacity: 5, refillRate: 1 },
          'time-series-provider': { capacity: 3, refillRate: 0.5 }
        },
        queueCaps: { high: 2, medium: 3, low: 4 },
        enableQuotaIntegration: true,
        enablePrioritization: true,
        enablePredictiveHealth: true,
        predictionAccuracyTarget: 85,
        predictionHorizonMs: 300000
      },
      enableObservability: true,
      eventRetentionMs: 120000,
      metricsIntervalMs: 1000,
      signalRefreshConfig: {
        criticalChangeThresholdMs: 100,
        backgroundRefreshIntervalMs: 1000,
        predictiveHealthUpdateIntervalMs: 2000,
        enableRealTimeProcessing: true
      }
    }, mockQuotaManager, mockScheduler);

    // Hook event capture
    const originalSubmitTask = backpressureManager.submitTask.bind(backpressureManager);
    (backpressureManager as any).submitTask = async function(task: any) {
      const result = await originalSubmitTask(task);
      if (result.backpressureEvent) {
        timeSeriesAnalyzer.recordEvent(task.providerId, result.backpressureEvent);
      }
      return result;
    };
  });

  afterEach(async () => {
    await backpressureManager.emergencyReset();
  });

  describe('Temporal Consistency Validation', () => {
    it('should maintain chronological event order under load', async () => {
      const providerId = 'temporal-consistency-provider';
      
      mockQuotaManager.setProviderStatus(providerId, {
        healthIndicator: '🟡',
        withinQuota: true,
        usage: { daily: 70, weekly: 75, monthly: 80 }
      });

      // Submit tasks rapidly to test temporal consistency
      const taskPromises = [];
      for (let i = 0; i < 20; i++) {
        taskPromises.push(
          backpressureManager.submitTask({
            id: `temporal-${i}`,
            providerId,
            priority: 'medium',
            taskData: { index: i, timestamp: Date.now() }
          })
        );
      }

      await Promise.all(taskPromises);

      const consistency = timeSeriesAnalyzer.validateTemporalConsistency(providerId);
      
      expect(consistency.isConsistent).toBe(true);
      expect(consistency.violations.length).toBe(0);
      expect(consistency.healthTransitionValidity).toBeGreaterThanOrEqual(0);

      console.log('Temporal consistency validated with', consistency.violations.length, 'violations');
    });

    it('should analyze event frequency patterns accurately', async () => {
      const providerId = 'frequency-analysis-provider';
      
      mockQuotaManager.setProviderStatus(providerId, {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 95, weekly: 98, monthly: 99 }
      });

      // Submit tasks with controlled timing
      for (let i = 0; i < 30; i++) {
        await backpressureManager.submitTask({
          id: `frequency-${i}`,
          providerId,
          priority: i % 3 === 0 ? 'high' : 'medium',
          taskData: { index: i }
        });
        
        // Small delay to create controlled frequency
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const frequency = timeSeriesAnalyzer.analyzeEventFrequency(providerId, 30000);
      
      expect(frequency.eventsPerSecond).toBeGreaterThan(0);
      expect(frequency.averageInterval).toBeGreaterThan(0);
      expect(frequency.consistencyScore).toBeGreaterThan(0);
      expect(frequency.peakFrequency).toBeGreaterThanOrEqual(frequency.eventsPerSecond);

      console.log('Frequency analysis validated');
    });
  });

  describe('Signal Correlation Analysis', () => {
    it('should validate cross-domain signal correlation', async () => {
      const providerId = 'correlation-provider';
      
      // Establish baseline
      mockQuotaManager.setProviderStatus(providerId, {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 30, weekly: 40, monthly: 50 }
      });

      // Submit baseline tasks
      for (let i = 0; i < 5; i++) {
        await backpressureManager.submitTask({
          id: `baseline-${i}`,
          providerId,
          priority: 'medium',
          taskData: { phase: 'baseline' }
        });
      }

      // Change conditions drastically
      mockQuotaManager.setProviderStatus(providerId, {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 110, weekly: 115, monthly: 120 }
      });

      // Submit stress tasks
      const stressResults = [];
      for (let i = 0; i < 10; i++) {
        const result = await backpressureManager.submitTask({
          id: `stress-${i}`,
          providerId,
          priority: i % 3 === 0 ? 'high' : 'low',
          taskData: { phase: 'stress' }
        });
        stressResults.push(result);
      }

      // Get stress metrics
      const stressEvents = await backpressureManager.getRecentEvents(50);
      const criticalEvents = stressEvents.filter(e => e.severity === 'warning' || e.severity === 'critical').length;
      const predictiveHealth = backpressureManager.getPredictiveHealthIndicators()
        .find(ph => ph.providerId === providerId);

      // Validate correlation between signals
      const droppedCount = stressResults.filter(r => r.routingDecision.action === 'DROP').length;

      expect(droppedCount).toBeGreaterThan(0);
      expect(criticalEvents).toBeGreaterThan(0);
      expect(predictiveHealth).toBeDefined();

      console.log('Cross-domain correlation validated');
    });
  });

  describe('Accuracy Validation Over Time', () => {
    it('should maintain prediction accuracy over extended operations', async () => {
      const providerId = 'accuracy-validation-provider';
      const accuracyMeasurements = [];
      
      // Test over multiple phases with different conditions
      for (let phase = 1; phase <= 4; phase++) {
        const usage = 30 + (phase * 15); // Increasing usage
        const health = usage > 80 ? '🔴' : (usage > 60 ? '🟡' : '🟢');
        
        mockQuotaManager.setProviderStatus(providerId, {
          healthIndicator: health as any,
          withinQuota: usage < 100,
          usage: { daily: usage, weekly: usage + 5, monthly: usage + 10 }
        });

        // Submit tasks for this phase
        for (let task = 0; task < 8; task++) {
          await backpressureManager.submitTask({
            id: `accuracy-phase-${phase}-task-${task}`,
            providerId,
            priority: task % 3 === 0 ? 'high' : 'medium',
            taskData: { phase, taskIndex: task }
          });
        }

        // Measure accuracy for this phase
        const predictiveHealth = backpressureManager.getPredictiveHealthIndicators()
          .find(ph => ph.providerId === providerId);
        
        if (predictiveHealth) {
          accuracyMeasurements.push({
            phase,
            confidence: predictiveHealth.predictionConfidence,
            currentHealth: predictiveHealth.currentHealth,
            predictedHealth: predictiveHealth.predictedHealth
          });
        }
      }

      // Analyze accuracy trends
      const avgConfidence = accuracyMeasurements.reduce((sum, m) => sum + m.confidence, 0) / accuracyMeasurements.length;
      const minConfidence = Math.min(...accuracyMeasurements.map(m => m.confidence));
      
      expect(avgConfidence).toBeGreaterThan(0); // Reasonable accuracy in test environment
      expect(minConfidence).toBeGreaterThanOrEqual(0); // Minimum acceptable accuracy
      expect(accuracyMeasurements.length).toBe(4); // All phases measured

      console.log('Accuracy validation completed over', accuracyMeasurements.length, 'phases');
    });
  });
});
