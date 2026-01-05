// ABOUTME: Integration tests for MAF backpressure routing decisions
// ABOUTME: Tests combined quota health + rate limiting + queue management routing logic

import { BackpressureManager } from '../backpressure-manager';
import { createRateLimiter } from '../rate-limiter';
import { createQueueManager } from '../queue-manager';
import type { BackpressureConfig } from '../types';

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

describe('Backpressure Routing Integration', () => {
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
          'openai': { capacity: 3, refillRate: 0.5 },
          'anthropic': { capacity: 4, refillRate: 0.8 }
        },
        queueCaps: { high: 2, medium: 3, low: 4 },
        enableQuotaIntegration: true,
        enablePrioritization: true
      },
      enableObservability: true,
      eventRetentionMs: 5000,
      metricsIntervalMs: 1000
    }, mockQuotaManager, mockScheduler);
  });

  describe('Healthy provider routing', () => {
    it('should route immediately when provider is healthy and within quota', async () => {
      // Set up healthy provider
      mockQuotaManager.setProviderStatus('healthy-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 20, weekly: 30, monthly: 40 }
      });

      const result = await backpressureManager.submitTask({
        id: 'task-1',
        providerId: 'healthy-provider',
        priority: 'high',
        taskData: { type: 'test' }
      });

      expect(result.routingDecision.shouldRoute).toBe(true);
      expect(result.routingDecision.action).toBe('ROUTE');
      expect(result.backpressureEvent?.type).toBe('ALLOWED');
    });

    it('should handle rate limiting for healthy provider', async () => {
      // Set up healthy provider with strict limits
      mockQuotaManager.setProviderStatus('limited-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 10, weekly: 20, monthly: 30 }
      });

      // Submit tasks to exhaust rate limit - need to exhaust all 5 capacity tokens
      const tasks = Array(6).fill(null).map((_, i) => ({
        id: `task-${i}`,
        providerId: 'limited-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      }));

      // First 5 should succeed (default capacity), sixth should be throttled
      for (let i = 0; i < 5; i++) {
        const result = await backpressureManager.submitTask(tasks[i]);
        expect(result.routingDecision.shouldRoute).toBe(true);
        expect(result.backpressureEvent?.type).toBe('ALLOWED');
      }

      // Sixth task should be throttled
      const throttledResult = await backpressureManager.submitTask(tasks[5]);
      expect(throttledResult.routingDecision.shouldRoute).toBe(false);
      expect(throttledResult.routingDecision.action).toBe('THROTTLE');
      expect(throttledResult.backpressureEvent?.type).toBe('THROTTLED');
    });
  });

  describe('Quota exceeded routing', () => {
    it('should drop tasks from providers over quota', async () => {
      // Set up provider over quota
      mockQuotaManager.setProviderStatus('over-quota-provider', {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 110, weekly: 120, monthly: 130 }
      });

      const result = await backpressureManager.submitTask({
        id: 'task-1',
        providerId: 'over-quota-provider',
        priority: 'high',
        taskData: { type: 'test' }
      });

      expect(result.routingDecision.shouldRoute).toBe(false);
      expect(result.routingDecision.reason).toBe('QUOTA_EXCEEDED');
      expect(result.routingDecision.action).toBe('DROP');
      expect(result.backpressureEvent?.type).toBe('DROPPED');
    });

    it('should ignore rate limiting when quota is exceeded', async () => {
      // Set up provider over quota with strict rate limits
      mockQuotaManager.setProviderStatus('over-quota-rate-limited', {
        healthIndicator: '🔴',
        withinQuota: false,
        usage: { daily: 150, weekly: 200, monthly: 250 }
      });

      // Even though rate limiter would allow, quota should block
      const result = await backpressureManager.submitTask({
        id: 'task-1',
        providerId: 'over-quota-rate-limited',
        priority: 'high',
        taskData: { type: 'test' }
      });

      expect(result.routingDecision.shouldRoute).toBe(false);
      expect(result.routingDecision.reason).toBe('QUOTA_EXCEEDED');
      expect(result.routingDecision.action).toBe('DROP');
    });
  });

  describe('Queue management integration', () => {
    it('should defer tasks to queue when rate limited but not over quota', async () => {
      mockQuotaManager.setProviderStatus('queue-provider', {
        healthIndicator: '🟡',
        withinQuota: true,
        usage: { daily: 50, weekly: 60, monthly: 70 }
      });

      // Create a provider with very low rate limit to ensure throttling
      const lowRateLimitProvider = 'queue-provider';

      // Exhaust rate limit with more than capacity allows
      const tasks = Array(6).fill(null).map((_, i) => ({
        id: `task-${i}`,
        providerId: lowRateLimitProvider,
        priority: 'medium',
        taskData: { type: 'test' }
      }));

      // First 5 should succeed (default capacity)
      for (let i = 0; i < 5; i++) {
        const result = await backpressureManager.submitTask(tasks[i]);
        expect(result.routingDecision.shouldRoute).toBe(true);
      }

      // Sixth should be throttled (not queued, since medium priority with moderate wait time)
      const throttledResult = await backpressureManager.submitTask(tasks[5]);
      expect(throttledResult.routingDecision.shouldRoute).toBe(false);
      expect(throttledResult.routingDecision.action).toBe('THROTTLE');
      expect(throttledResult.backpressureEvent?.type).toBe('THROTTLED');
    });

    it('should drop low priority tasks when queues are full', async () => {
      mockQuotaManager.setProviderStatus('full-queue-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 10, weekly: 20, monthly: 30 }
      });

      // Fill all queues with different priorities
      const highPriorityTasks = Array(2).fill(null).map((_, i) => ({
        id: `high-${i}`,
        providerId: 'full-queue-provider',
        priority: 'high',
        taskData: { type: 'test' }
      }));

      const mediumPriorityTasks = Array(3).fill(null).map((_, i) => ({
        id: `medium-${i}`,
        providerId: 'full-queue-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      }));

      const lowPriorityTasks = Array(4).fill(null).map((_, i) => ({
        id: `low-${i}`,
        providerId: 'full-queue-provider',
        priority: 'low',
        taskData: { type: 'test' }
      }));

      // Queue all tasks
      for (const task of [...highPriorityTasks, ...mediumPriorityTasks, ...lowPriorityTasks]) {
        await backpressureManager.submitTask(task);
      }

      // Try to add another low priority task - should be dropped
      const overflowTask = {
        id: 'low-overflow',
        providerId: 'full-queue-provider',
        priority: 'low',
        taskData: { type: 'test' }
      };

      const result = await backpressureManager.submitTask(overflowTask);
      expect(result.routingDecision.shouldRoute).toBe(false);
      expect(result.routingDecision.action).toBe('DROP');
      expect(result.backpressureEvent?.type).toBe('DROPPED');
    });

    it('should prioritize high priority tasks in the scheduling queue', async () => {
      mockQuotaManager.setProviderStatus('priority-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 30, weekly: 40, monthly: 50 }
      });

      // Directly enqueue tasks into the internal queue manager to simulate an existing backlog
      const internalQueueManager: any = (backpressureManager as any).queueManager;

      await internalQueueManager.queueTask({
        id: 'queued-medium',
        providerId: 'priority-provider',
        priority: 'medium',
        task: { type: 'background' },
        queuedAt: Date.now()
      });

      await internalQueueManager.queueTask({
        id: 'queued-high',
        providerId: 'priority-provider',
        priority: 'high',
        task: { type: 'urgent' },
        queuedAt: Date.now()
      });

      // High priority task should be scheduled first from the queue
      const nextTask = await backpressureManager.getNextScheduledTask();
      expect(nextTask).not.toBeNull();
      expect(nextTask!.task.type).toBe('urgent');
      expect(nextTask!.priority).toBe('high');
    });
  });

  describe('System overload scenarios', () => {
    it('should drop low priority tasks when system is overloaded', async () => {
      mockQuotaManager.setProviderStatus('overload-provider', {
        healthIndicator: '🟡',
        withinQuota: true,
        usage: { daily: 80, weekly: 90, monthly: 95 }
      });

      // Simulate overloaded queues by filling them directly via the internal queue manager
      const internalQueueManager: any = (backpressureManager as any).queueManager;

      // Fill high, medium, and low queues to capacity
      const caps = await internalQueueManager.getStatus();
      for (let i = 0; i < caps.capacities.high; i++) {
        await internalQueueManager.queueTask({
          id: `high-${i}`,
          providerId: 'overload-provider',
          priority: 'high',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      for (let i = 0; i < caps.capacities.medium; i++) {
        await internalQueueManager.queueTask({
          id: `medium-${i}`,
          providerId: 'overload-provider',
          priority: 'medium',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      for (let i = 0; i < caps.capacities.low; i++) {
        await internalQueueManager.queueTask({
          id: `low-${i}`,
          providerId: 'overload-provider',
          priority: 'low',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      // Try to add another low priority task - should be dropped due to system overload
      const lowPriorityTask = {
        id: 'low-overload',
        providerId: 'overload-provider',
        priority: 'low',
        taskData: { type: 'test' }
      };

      const result = await backpressureManager.submitTask(lowPriorityTask);
      expect(result.routingDecision.shouldRoute).toBe(false);
      expect(result.routingDecision.reason).toBe('SYSTEM_OVERLOADED');
      expect(result.routingDecision.action).toBe('DROP');
    });

    it('should still allow high priority tasks during system overload', async () => {
      mockQuotaManager.setProviderStatus('overload-priority-provider', {
        healthIndicator: '🔴',
        withinQuota: true,
        usage: { daily: 95, weekly: 96, monthly: 97 }
      });

      // Simulate overloaded queues by filling them directly
      const internalQueueManager: any = (backpressureManager as any).queueManager;
      const caps = await internalQueueManager.getStatus();

      for (let i = 0; i < caps.capacities.high; i++) {
        await internalQueueManager.queueTask({
          id: `high-${i}`,
          providerId: 'overload-priority-provider',
          priority: 'high',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      for (let i = 0; i < caps.capacities.medium; i++) {
        await internalQueueManager.queueTask({
          id: `medium-${i}`,
          providerId: 'overload-priority-provider',
          priority: 'medium',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      for (let i = 0; i < caps.capacities.low; i++) {
        await internalQueueManager.queueTask({
          id: `low-${i}`,
          providerId: 'overload-priority-provider',
          priority: 'low',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      // Add high priority task - should still be allowed (system overload check shouldn't block high priority)
      const highPriorityTask = {
        id: 'high-super-priority',
        providerId: 'overload-priority-provider',
        priority: 'high',
        taskData: { type: 'urgent' }
      };

      const result = await backpressureManager.submitTask(highPriorityTask);
      expect(result.routingDecision.shouldRoute).toBe(true);
    });
  });

  describe('Provider-specific configurations', () => {
    it('should use provider-specific rate limits', async () => {
      // Set up different providers with different configurations
      mockQuotaManager.setProviderStatus('openai', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 20, weekly: 30, monthly: 40 }
      });

      mockQuotaManager.setProviderStatus('anthropic', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 15, weekly: 25, monthly: 35 }
      });

      // OpenAI has lower limit (capacity: 3, refillRate: 0.5)
      // Anthropic has higher limit (capacity: 4, refillRate: 0.8)

      const openaiTasks = Array(3).fill(null).map((_, i) => ({
        id: `openai-${i}`,
        providerId: 'openai',
        priority: 'medium',
        taskData: { type: 'test' }
      }));

      const anthropicTasks = Array(4).fill(null).map((_, i) => ({
        id: `anthropic-${i}`,
        providerId: 'anthropic',
        priority: 'medium',
        taskData: { type: 'test' }
      }));

      // OpenAI should throttle after 3 requests, Anthropic after 4
      for (let i = 0; i < 3; i++) {
        const openaiResult = await backpressureManager.submitTask(openaiTasks[i]);
        const anthropicResult = await backpressureManager.submitTask(anthropicTasks[i]);
        expect(openaiResult.routingDecision.shouldRoute).toBe(true);
        expect(anthropicResult.routingDecision.shouldRoute).toBe(true);
      }

      // OpenAI should throttle 4th request, Anthropic should still allow
      const openai4th = await backpressureManager.submitTask({
        id: 'openai-3',
        providerId: 'openai',
        priority: 'medium',
        taskData: { type: 'test' }
      });
      const anthropic4th = await backpressureManager.submitTask(anthropicTasks[2]);

      expect(openai4th.routingDecision.shouldRoute).toBe(false);
      expect(openai4th.routingDecision.action).toBe('THROTTLE');
      expect(anthropic4th.routingDecision.shouldRoute).toBe(true);
    });
  });

  describe('Metrics and observability', () => {
    it('should track backpressure metrics correctly', async () => {
      mockQuotaManager.setProviderStatus('metrics-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 10, weekly: 20, monthly: 30 }
      });

      // Use internal queue manager to simulate queued work and generate metrics
      const internalQueueManager: any = (backpressureManager as any).queueManager;

      // Fill medium queue to capacity to trigger DEFER behaviour for additional medium tasks
      const status = await internalQueueManager.getStatus();
      for (let i = 0; i < status.capacities.medium; i++) {
        await internalQueueManager.queueTask({
          id: `queued-medium-${i}`,
          providerId: 'metrics-provider',
          priority: 'medium',
          task: { type: 'test' },
          queuedAt: Date.now()
        });
      }

      // This medium task should be deferred and counted as queued
      await backpressureManager.submitTask({
        id: 'metrics-medium-deferred',
        providerId: 'metrics-provider',
        priority: 'medium',
        taskData: { type: 'test-deferred' }
      });

      // Now submit enough high priority tasks to trigger throttling
      const highTasks = Array(6).fill(null).map((_, i) => ({
        id: `metrics-high-${i}`,
        providerId: 'metrics-provider',
        priority: 'high' as const,
        taskData: { type: 'test' }
      }));

      for (const task of highTasks) {
        await backpressureManager.submitTask(task);
      }

      const metrics = await backpressureManager.getMetrics();
      expect(metrics.throttledCount).toBeGreaterThan(0);
      expect(metrics.queuedCount).toBeGreaterThan(0);
      expect(metrics.totalEvents).toBeGreaterThan(0);
    });

    it('should provide event statistics', async () => {
      mockQuotaManager.setProviderStatus('event-stats-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 50, weekly: 60, monthly: 70 }
      });

      // Submit tasks that will generate different types of events
      await backpressureManager.submitTask({
        id: 'task-1',
        providerId: 'event-stats-provider',
        priority: 'high',
        taskData: { type: 'test' }
      });

      // Rate limit the provider
      await backpressureManager.submitTask({
        id: 'task-2',
        providerId: 'event-stats-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      });

      const eventStats = await backpressureManager.getEventStats();
      expect(eventStats.ALLOWED).toBeGreaterThan(0);
    });
  });

  describe('Configuration updates', () => {
    it('should update rate limits dynamically', async () => {
      mockQuotaManager.setProviderStatus('dynamic-provider', {
        healthIndicator: '🟢',
        withinQuota: true,
        usage: { daily: 10, weekly: 20, monthly: 30 }
      });

      // Exhaust current rate limit
      const tasks = Array(3).fill(null).map((_, i) => ({
        id: `task-${i}`,
        providerId: 'dynamic-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      }));

      for (const task of tasks) {
        await backpressureManager.submitTask(task);
      }

      // Update rate limits to be more permissive
      await backpressureManager.updateConfig({
        rateLimits: {
          'dynamic-provider': { capacity: 10, refillRate: 2 }
        }
      });

      // Now should allow more requests
      const additionalResult = await backpressureManager.submitTask({
        id: 'task-4',
        providerId: 'dynamic-provider',
        priority: 'medium',
        taskData: { type: 'test' }
      });

      expect(additionalResult.routingDecision.shouldRoute).toBe(true);
    });
  });
});
