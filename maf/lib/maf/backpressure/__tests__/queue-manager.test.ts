// ABOUTME: Unit tests for MAF queue manager implementation
// ABOUTME: Tests priority queues, depth caps, defer/drop policy, and wait time calculation

import { QueueManager, BackpressureEventEmitter } from '../queue-manager';
import type { QueueItem, QueueResult, BackpressureEvent } from '../types';
import type { QueueCapConfig } from '../types';

describe('QueueManager', () => {
  let queueManager: QueueManager;
  let mockEventEmitter: BackpressureEventEmitter;

  beforeEach(() => {
    mockEventEmitter = new BackpressureEventEmitter();
    const config: QueueCapConfig = { high: 2, medium: 3, low: 4 };
    queueManager = new QueueManager(config, mockEventEmitter); // Use mock emitter
  });

  describe('Basic queue operations', () => {
    it('should queue tasks in correct priority order', async () => {
      const items: QueueItem[] = [
        { id: '1', providerId: 'p1', priority: 'low', task: { data: 1 }, queuedAt: Date.now() },
        { id: '2', providerId: 'p1', priority: 'high', task: { data: 2 }, queuedAt: Date.now() },
        { id: '3', providerId: 'p1', priority: 'medium', task: { data: 3 }, queuedAt: Date.now() }
      ];

      // Queue all items
      for (const item of items) {
        const result = await queueManager.queueTask(item);
        expect(result.queued).toBe(true);
        expect(result.item).toBe(item);
      }

      // Dequeue should return in priority order: high, medium, low
      const dequeued1 = await queueManager.dequeueTask();
      const dequeued2 = await queueManager.dequeueTask();
      const dequeued3 = await queueManager.dequeueTask();

      expect(dequeued1!.priority).toBe('high');
      expect(dequeued2!.priority).toBe('medium');
      expect(dequeued3!.priority).toBe('low');
    });

    it('should calculate wait times correctly', async () => {
      const item: QueueItem = {
        id: '1',
        providerId: 'p1',
        priority: 'high',
        task: { data: 1 },
        queuedAt: Date.now(),
        estimatedTime: 1000
      };

      const result = await queueManager.queueTask(item);
      expect(result.waitTime).toBe(0); // First item should have 0 wait time

      // Add another item
      const item2: QueueItem = {
        id: '2',
        providerId: 'p1',
        priority: 'high',
        task: { data: 2 },
        queuedAt: Date.now(),
        estimatedTime: 1000
      };

      await queueManager.queueTask(item2);
      const waitTimeForSecond = await queueManager.getWaitTime('high');
      expect(waitTimeForSecond).toBeGreaterThan(0);
    });
  });

  describe('Queue depth caps', () => {
    it('should respect high priority queue capacity', async () => {
      const highCapacity = queueManager.getCapacity('high');

      // Fill high priority queue to capacity
      for (let i = 0; i < highCapacity; i++) {
        const item: QueueItem = {
          id: `item-${i}`,
          providerId: 'p1',
          priority: 'high',
          task: { data: i },
          queuedAt: Date.now()
        };

        const result = await queueManager.queueTask(item);
        expect(result.queued).toBe(true);
      }

      // Next high priority item should be dropped
      const overflowItem: QueueItem = {
        id: 'overflow',
        providerId: 'p1',
        priority: 'high',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      const result = await queueManager.queueTask(overflowItem);
      expect(result.queued).toBe(false);
      expect(result.reason).toBe('QUEUE_FULL');
    });

    it('should respect medium priority queue capacity', async () => {
      const mediumCapacity = queueManager.getCapacity('medium');

      // Fill medium priority queue to capacity
      for (let i = 0; i < mediumCapacity; i++) {
        const item: QueueItem = {
          id: `medium-${i}`,
          providerId: 'p1',
          priority: 'medium',
          task: { data: i },
          queuedAt: Date.now()
        };

        const result = await queueManager.queueTask(item);
        expect(result.queued).toBe(true);
      }

      // Next medium priority item should be deferred to low priority
      const overflowItem: QueueItem = {
        id: 'medium-overflow',
        providerId: 'p1',
        priority: 'medium',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      const result = await queueManager.queueTask(overflowItem);
      // Medium priority task should be deferred to low priority queue
      expect(result.queued).toBe(true);
      expect(result.item!.priority).toBe('low'); // Should be demoted to low
    });

    it('should respect low priority queue capacity', async () => {
      const lowCapacity = queueManager.getCapacity('low');

      // Fill low priority queue to capacity
      for (let i = 0; i < lowCapacity; i++) {
        const item: QueueItem = {
          id: `low-${i}`,
          providerId: 'p1',
          priority: 'low',
          task: { data: i },
          queuedAt: Date.now()
        };

        await queueManager.queueTask(item);
      }

      // Next low priority item should be dropped
      const overflowItem: QueueItem = {
        id: 'low-overflow',
        providerId: 'p1',
        priority: 'low',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      const result = await queueManager.queueTask(overflowItem);
      expect(result.queued).toBe(false);
    });
  });

  describe('Defer/drop policy', () => {
    it('should drop low priority tasks when low queue is full', async () => {
      // Fill low priority queue to capacity
      for (let i = 0; i < queueManager.getCapacity('low'); i++) {
        const item: QueueItem = {
          id: `low-${i}`,
          providerId: 'p1',
          priority: 'low',
          task: { data: i },
          queuedAt: Date.now()
        };

        await queueManager.queueTask(item);
      }

      // Add another low priority item - should be dropped (low priority cannot be deferred)
      const overflowItem: QueueItem = {
        id: 'overflow',
        providerId: 'p1',
        priority: 'low',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      const result = await queueManager.queueTask(overflowItem);
      expect(result.queued).toBe(false);
      expect(result.reason).toBe('QUEUE_FULL');
    });

    it('should defer low priority tasks to lower available priority', async () => {
      // Fill both medium and low queues
      for (let i = 0; i < queueManager.getCapacity('medium'); i++) {
        const item: QueueItem = {
          id: `medium-${i}`,
          providerId: 'p1',
          priority: 'medium',
          task: { data: i },
          queuedAt: Date.now()
        };
        await queueManager.queueTask(item);
      }

      for (let i = 0; i < queueManager.getCapacity('low'); i++) {
        const item: QueueItem = {
          id: `low-${i}`,
          providerId: 'p1',
          priority: 'low',
          task: { data: i },
          queuedAt: Date.now()
        };
        await queueManager.queueTask(item);
      }

      // Add low priority item - should be dropped (no space anywhere)
      const overflowItem: QueueItem = {
        id: 'overflow',
        providerId: 'p1',
        priority: 'low',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      const result = await queueManager.queueTask(overflowItem);
      expect(result.queued).toBe(false);
    });

    it('should not defer high or medium priority tasks', async () => {
      // Fill high priority queue
      for (let i = 0; i < queueManager.getCapacity('high'); i++) {
        const item: QueueItem = {
          id: `high-${i}`,
          providerId: 'p1',
          priority: 'high',
          task: { data: i },
          queuedAt: Date.now()
        };
        await queueManager.queueTask(item);
      }

      // Try to add another high priority item - should be dropped (not deferred)
      const overflowItem: QueueItem = {
        id: 'high-overflow',
        providerId: 'p1',
        priority: 'high',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      const result = await queueManager.queueTask(overflowItem);
      expect(result.queued).toBe(false);
      expect(result.reason).toBe('QUEUE_FULL');
    });
  });

  describe('Queue status and monitoring', () => {
    it('should provide accurate queue status', async () => {
      // Add some items to different queues
      const highItem: QueueItem = {
        id: 'high-1',
        providerId: 'p1',
        priority: 'high',
        task: { data: 1 },
        queuedAt: Date.now()
      };
      await queueManager.queueTask(highItem);

      const status = await queueManager.getStatus();
      expect(status.depths.high).toBe(1);
      expect(status.depths.medium).toBe(0);
      expect(status.depths.low).toBe(0);
      expect(status.depths.total).toBe(1);
      expect(status.utilization.total).toBeGreaterThan(0);
      expect(status.nextItems[0].priority).toBe('high');
      expect(status.nextItems[0].item).toBe(highItem);
    });

    it('should handle queue capacity updates', async () => {
      // Update capacity
      await queueManager.setCapacity('high', 5);

      const status = await queueManager.getStatus();
      expect(status.capacities.high).toBe(5);
    });
  });

  describe('Queue item removal', () => {
    it('should remove specific items from queue', async () => {
      const item1: QueueItem = {
        id: 'item-1',
        providerId: 'p1',
        priority: 'high',
        task: { data: 1 },
        queuedAt: Date.now()
      };

      const item2: QueueItem = {
        id: 'item-2',
        providerId: 'p1',
        priority: 'high',
        task: { data: 2 },
        queuedAt: Date.now()
      };

      await queueManager.queueTask(item1);
      await queueManager.queueTask(item2);

      // Remove first item
      const removed = await queueManager.removeItem('item-1');
      expect(removed).toBe(true);

      // Check that item2 is now at front
      const nextItem = await queueManager.dequeueTask();
      expect(nextItem!.id).toBe('item-2');

      // Try to remove non-existent item
      const notRemoved = await queueManager.removeItem('non-existent');
      expect(notRemoved).toBe(false);
    });

    it('should clear all queues', async () => {
      // Add items to all queues
      await queueManager.queueTask({
        id: 'high-1',
        providerId: 'p1',
        priority: 'high',
        task: { data: 1 },
        queuedAt: Date.now()
      });

      await queueManager.queueTask({
        id: 'medium-1',
        providerId: 'p1',
        priority: 'medium',
        task: { data: 2 },
       queuedAt: Date.now()
      });

      await queueManager.queueTask({
        id: 'low-1',
        providerId: 'p1',
        priority: 'low',
        task: { data: 3 },
        queuedAt: Date.now()
      });

      // Clear all queues
      await queueManager.clear();

      const status = await queueManager.getStatus();
      expect(status.depths.total).toBe(0);
      expect(status.nextItems.every(item => item.item === null)).toBe(true);
    });
  });

  describe('Event emission', () => {
    let eventLog: BackpressureEvent[] = [];

    beforeEach(() => {
      eventLog = [];
      mockEventEmitter.on('QUEUED', (event: BackpressureEvent) => {
        eventLog.push(event);
      });
      mockEventEmitter.on('DROPPED', (event: BackpressureEvent) => {
        eventLog.push(event);
      });
      mockEventEmitter.on('DEFERRED', (event: BackpressureEvent) => {
        eventLog.push(event);
      });
      mockEventEmitter.on('ALLOWED', (event: BackpressureEvent) => {
        eventLog.push(event);
      });
    });

    it('should emit QUEUED event when task is queued', async () => {
      const item: QueueItem = {
        id: 'test-item',
        providerId: 'p1',
        priority: 'high',
        task: { data: 1 },
        queuedAt: Date.now()
      };

      await queueManager.queueTask(item);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0].type).toBe('QUEUED');
      expect(eventLog[0].providerId).toBe('p1');
      expect(eventLog[0].details.priority).toBe('high');
    });

    it('should emit DROPPED event when task is dropped due to queue full', async () => {
      // Fill queue to capacity
      for (let i = 0; i < queueManager.getCapacity('high'); i++) {
        const item: QueueItem = {
          id: `item-${i}`,
          providerId: 'p1',
          priority: 'high',
          task: { data: i },
          queuedAt: Date.now()
        };
        await queueManager.queueTask(item);
      }

      // Try to add one more - should be dropped
      const overflowItem: QueueItem = {
        id: 'overflow',
        providerId: 'p1',
        priority: 'high',
        task: { data: 'overflow' },
        queuedAt: Date.now()
      };

      await queueManager.queueTask(overflowItem);

      // Should have queued events + 1 dropped event
      expect(eventLog.length).toBeGreaterThan(1);
      const droppedEvent = eventLog.find(e => e.type === 'DROPPED');
      expect(droppedEvent).toBeDefined();
      expect(droppedEvent!.details.reason).toBe('QUEUE_FULL');
    });

    it('should emit DEFERRED event when medium priority task is deferred to low', async () => {
      // Fill medium priority queue to capacity
      for (let i = 0; i < queueManager.getCapacity('medium'); i++) {
        const item: QueueItem = {
          id: `medium-${i}`,
          providerId: 'p1',
          priority: 'medium',
          task: { data: i },
          queuedAt: Date.now()
        };
        await queueManager.queueTask(item);
      }

      // Add another medium priority item - should be deferred to low priority
      const deferredItem: QueueItem = {
        id: 'deferred-medium',
        providerId: 'p1',
        priority: 'medium',
        task: { data: 'deferred' },
        queuedAt: Date.now()
      };

      await queueManager.queueTask(deferredItem);

      const deferredEvent = eventLog.find(e => e.type === 'DEFERRED');
      expect(deferredEvent).toBeDefined();
      expect(deferredEvent!.details.originalPriority).toBe('medium');
      expect(deferredEvent!.details.newPriority).toBe('low');
    });

    it('should emit ALLOWED event when task is dequeued', async () => {
      const item: QueueItem = {
        id: 'test-item',
        providerId: 'p1',
        priority: 'high',
        task: { data: 1 },
        queuedAt: Date.now()
      };

      await queueManager.queueTask(item);
      await queueManager.dequeueTask();

      const allowedEvent = eventLog.find(e => e.type === 'ALLOWED');
      expect(allowedEvent).toBeDefined();
      expect(allowedEvent!.details.priority).toBe('high');
      expect(allowedEvent!.details.taskId).toBe('test-item');
    });
  });
});
