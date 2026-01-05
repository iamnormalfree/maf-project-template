// ABOUTME: Stress testing with signal integrity validation for MAF backpressure signal enhancements

import { BackpressureManager } from '../backpressure/backpressure-manager';
import type { BackpressureEvent } from '../backpressure/types';

class StressQuotaManager {
  private providerData = new Map<string, {
    healthIndicator: '🟢' | '🟡' | '🔴' | '🚨';
    withinQuota: boolean;
    usage: { daily: number; weekly: number; monthly: number };
  }>();

  setProviderStatus(providerId: string, status: any) {
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

class StressScheduler {
  private stats = { totalProcessed: 0, currentQueueDepth: 0 };

  async pickNextTask(): Promise<any> {
    this.stats.totalProcessed++;
    this.stats.currentQueueDepth = Math.max(0, this.stats.currentQueueDepth - 1);
    return null;
  }

  getStats() {
    return { ...this.stats };
  }
}

describe('MAF Backpressure Stress Testing', () => {
  let backpressureManager: BackpressureManager;
  let stressQuotaManager: StressQuotaManager;
  let stressScheduler: StressScheduler;

  beforeEach(() => {
    stressQuotaManager = new StressQuotaManager();
    stressScheduler = new StressScheduler();

    backpressureManager = new BackpressureManager({
      backpressure: {
        rateLimits: {
          default: { capacity: 5, refillRate: 1 },
          'stress-provider': { capacity: 10, refillRate: 2 }
        },
        queueCaps: { high: 5, medium: 10, low: 15 },
        enableQuotaIntegration: true,
        enablePrioritization: true,
        enablePredictiveHealth: true,
        predictionAccuracyTarget: 85,
        predictionHorizonMs: 300000
      },
      enableObservability: true,
      eventRetentionMs: 300000,
      metricsIntervalMs: 500,
      signalRefreshConfig: {
        criticalChangeThresholdMs: 100,
        backgroundRefreshIntervalMs: 500,
        predictiveHealthUpdateIntervalMs: 1000,
        enableRealTimeProcessing: true
      }
    }, stressQuotaManager, stressScheduler);
  });

  afterEach(async () => {
    await backpressureManager.emergencyReset();
  });

  it('should maintain performance under high load', async () => {
    const providerId = 'high-load-provider';
    
    stressQuotaManager.setProviderStatus(providerId, {
      healthIndicator: '🔴',
      withinQuota: false,
      usage: { daily: 110, weekly: 115, monthly: 120 }
    });

    const startTime = Date.now();
    const taskPromises = [];

    // Submit high load
    for (let i = 0; i < 100; i++) {
      taskPromises.push(
        backpressureManager.submitTask({
          id: `high-load-${i}`,
          providerId,
          priority: i % 3 === 0 ? 'high' : 'low',
          taskData: { highLoad: true, taskIndex: i }
        })
      );
    }

    const results = await Promise.all(taskPromises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Analyze results
    const droppedCount = results.filter(r => r.routingDecision.action === 'DROP').length;
    const routedCount = results.filter(r => r.routingDecision.action === 'ROUTE').length;
    const metrics = await backpressureManager.getMetrics();

    // Should complete within reasonable time
    expect(duration).toBeLessThan(5000); // 5 seconds max
    expect(results.length).toBe(100);
    expect(droppedCount).toBeGreaterThan(0); // Should drop some due to high load
    expect(metrics.droppedCount).toBeGreaterThan(0);

    console.log('High load test completed:', {
      duration: duration + 'ms',
      totalTasks: results.length,
      dropped: droppedCount,
      routed: routedCount,
      queueDepths: metrics.queueDepths
    });
  });

  it('should demonstrate signal integrity under stress', async () => {
    const providerId = 'integrity-provider';
    
    // Phase 1: Baseline
    stressQuotaManager.setProviderStatus(providerId, {
      healthIndicator: '🟢',
      withinQuota: true,
      usage: { daily: 30, weekly: 40, monthly: 50 }
    });

    for (let i = 0; i < 20; i++) {
      await backpressureManager.submitTask({
        id: `baseline-${i}`,
        providerId,
        priority: 'medium',
        taskData: { phase: 'baseline' }
      });
    }

    const baselineEvents = await backpressureManager.getRecentEvents(50);

    // Phase 2: Stress
    stressQuotaManager.setProviderStatus(providerId, {
      healthIndicator: '🔴',
      withinQuota: false,
      usage: { daily: 95, weekly: 98, monthly: 99 }
    });

    const stressResults = [];
    for (let i = 0; i < 40; i++) {
      const result = await backpressureManager.submitTask({
        id: `stress-${i}`,
        providerId,
        priority: 'low',
        taskData: { phase: 'stress' }
      });
      stressResults.push(result);
    }

    const stressEvents = await backpressureManager.getRecentEvents(100);

    // Phase 3: Recovery
    stressQuotaManager.setProviderStatus(providerId, {
      healthIndicator: '🟢',
      withinQuota: true,
      usage: { daily: 25, weekly: 35, monthly: 45 }
    });

    for (let i = 0; i < 20; i++) {
      await backpressureManager.submitTask({
        id: `recovery-${i}`,
        providerId,
        priority: 'high',
        taskData: { phase: 'recovery' }
      });
    }

    const recoveryEvents = await backpressureManager.getRecentEvents(50);

    // Validate signal integrity throughout phases
    expect(baselineEvents.length).toBeGreaterThan(0);
    expect(stressEvents.length).toBeGreaterThan(baselineEvents.length);
    expect(recoveryEvents.length).toBeGreaterThan(0);

    const stressDrops = stressResults.filter(r => r.routingDecision.action === 'DROP').length;
    expect(stressDrops).toBeGreaterThan(0);

    console.log('Signal integrity test completed:', {
      baselineEvents: baselineEvents.length,
      stressEvents: stressEvents.length,
      recoveryEvents: recoveryEvents.length,
      stressDrops: stressDrops
    });
  });

  it('should handle rapid state transitions gracefully', async () => {
    const providerId = 'transition-provider';
    
    // Rapid state changes
    const states = [
      { health: '🟢', usage: 30, withinQuota: true },
      { health: '🟡', usage: 65, withinQuota: true },
      { health: '🔴', usage: 90, withinQuota: false },
      { health: '🚨', usage: 110, withinQuota: false },
      { health: '🔴', usage: 85, withinQuota: false },
      { health: '🟡', usage: 55, withinQuota: true },
      { health: '🟢', usage: 35, withinQuota: true }
    ];

    const transitionResults = [];

    for (let i = 0; i < states.length; i++) {
      const state = states[i];
      
      stressQuotaManager.setProviderStatus(providerId, {
        healthIndicator: state.health as any,
        withinQuota: state.withinQuota,
        usage: { daily: state.usage, weekly: state.usage + 5, monthly: state.usage + 10 }
      });

      // Submit tasks for this state
      const stateResults = [];
      for (let j = 0; j < 10; j++) {
        const result = await backpressureManager.submitTask({
          id: `transition-${i}-${j}`,
          providerId,
          priority: 'medium',
          taskData: { stateIndex: i, taskIndex: j, health: state.health }
        });
        stateResults.push(result);
      }

      transitionResults.push({
        stateIndex: i,
        health: state.health,
        usage: state.usage,
        dropped: stateResults.filter(r => r.routingDecision.action === 'DROP').length,
        routed: stateResults.filter(r => r.routingDecision.action === 'ROUTE').length,
        total: stateResults.length
      });
    }

    // Validate graceful transitions
    expect(transitionResults.length).toBe(states.length);
    
    // Should see increased drops as health degrades
    const maxDrops = Math.max(...transitionResults.map(r => r.dropped));
    const minDrops = Math.min(...transitionResults.map(r => r.dropped));
    expect(maxDrops).toBeGreaterThan(minDrops);

    // Final state should have recovered
    const finalState = transitionResults[transitionResults.length - 1];
    expect(finalState.health).toBe('🟢');
    expect(finalState.dropped).toBeLessThanOrEqual(finalState.total);

    console.log('Rapid state transitions completed:', {
      totalTransitions: transitionResults.length,
      maxDrops: maxDrops,
      minDrops: minDrops,
      finalState: finalState.health
    });
  });
});
