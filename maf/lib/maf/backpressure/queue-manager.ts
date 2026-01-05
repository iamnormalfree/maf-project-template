// ABOUTME: Priority-aware queue manager with depth caps and defer/drop policy
// ABOUTME: Enforces queue limits and implements smart task prioritization

import type {
  QueueCapConfig,
  QueueItem,
  QueueResult,
  BackpressureEvent,
  BackpressureEventType
} from './types';

/**
 * Priority-based queue manager with depth caps
 *
 * Features:
 * - Three priority levels: high, medium, low
 * - Configurable max depth per priority
 * - Smart defer/drop policy when full
 * - FIFO within each priority level
 * - Wait time estimation
 */
export class QueueManager {
  private readonly highPriorityQueue: QueueItem[] = [];
  private readonly mediumPriorityQueue: QueueItem[] = [];
  private readonly lowPriorityQueue: QueueItem[] = [];

  private readonly config: QueueCapConfig;
  private readonly eventEmitter: BackpressureEventEmitter;
  private totalQueued = 0;

  constructor(
    config: QueueCapConfig,
    eventEmitter: BackpressureEventEmitter
  ) {
    this.config = config;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Try to queue a task, implementing defer/drop policy
   */
  async queueTask(item: QueueItem): Promise<QueueResult> {
    const targetQueue = this.getQueueByPriority(item.priority);
    const currentDepth = targetQueue.length;

    // Check if queue has capacity
    if (currentDepth < this.config[item.priority]) {
      // Add to queue
      targetQueue.push(item);
      this.totalQueued++;

      // Emit queued event
      this.eventEmitter.emit({
        id: `queue_queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type: 'QUEUED' as BackpressureEventType,
        providerId: item.providerId,
        details: {
          priority: item.priority,
          position: currentDepth + 1,
          estimatedTime: item.estimatedTime
        }
      });

      return {
        queued: true,
        position: currentDepth + 1,
        waitTime: this.calculateWaitTime(targetQueue, currentDepth),
        item
      };
    }

    // Queue is full, implement defer/drop policy
    return this.handleFullQueue(item, targetQueue);
  }

  /**
   * Dequeue the highest priority available task
   */
  async dequeueTask(): Promise<QueueItem | null> {
    // Try high priority first
    if (this.highPriorityQueue.length > 0) {
      return this.dequeueFromQueue('high', this.highPriorityQueue);
    }

    // Then medium priority
    if (this.mediumPriorityQueue.length > 0) {
      return this.dequeueFromQueue('medium', this.mediumPriorityQueue);
    }

    // Finally low priority
    if (this.lowPriorityQueue.length > 0) {
      return this.dequeueFromQueue('low', this.lowPriorityQueue);
    }

    return null;
  }

  /**
   * Get queue status without modifying queues
   */
  async getStatus(): Promise<{
    depths: {
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    capacities: {
      high: number;
      medium: number;
      low: number;
    };
    utilization: {
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    nextItems: Array<{ priority: string; item: QueueItem | null }>;
  }> {
    return {
      depths: {
        high: this.highPriorityQueue.length,
        medium: this.mediumPriorityQueue.length,
        low: this.lowPriorityQueue.length,
        total: this.totalQueued
      },
      capacities: {
        high: this.config.high,
        medium: this.config.medium,
        low: this.config.low
      },
      utilization: {
        high: this.calculateUtilization(this.config.high, this.highPriorityQueue.length),
        medium: this.calculateUtilization(this.config.medium, this.mediumPriorityQueue.length),
        low: this.calculateUtilization(this.config.low, this.lowPriorityQueue.length),
        total: this.calculateUtilization(
          this.config.high + this.config.medium + this.config.low,
          this.totalQueued
        )
      },
      nextItems: [
        { priority: 'high', item: this.highPriorityQueue[0] || null },
        { priority: 'medium', item: this.mediumPriorityQueue[0] || null },
        { priority: 'low', item: this.lowPriorityQueue[0] || null }
      ]
    };
  }

  /**
   * Remove specific item from queue (for task cancellation/timeout)
   */
  async removeItem(itemId: string): Promise<boolean> {
    for (const queue of [this.highPriorityQueue, this.mediumPriorityQueue, this.lowPriorityQueue]) {
      const index = queue.findIndex(item => item.id === itemId);
      if (index !== -1) {
        queue.splice(index, 1);
        this.totalQueued--;
        return true;
      }
    }
    return false;
  }

  /**
   * Get queue wait time for a given priority
   */
  async getWaitTime(priority: 'high' | 'medium' | 'low'): Promise<number> {
    const queue = this.getQueueByPriority(priority);
    return this.calculateWaitTime(queue, queue.length - 1);
  }

  /**
   * Clear all queues
   */
  async clear(): Promise<void> {
    this.highPriorityQueue.length = 0;
    this.mediumPriorityQueue.length = 0;
    this.lowPriorityQueue.length = 0;
    this.totalQueued = 0;
  }

  /**
   * Get queue capacity for a priority level
   */
  getCapacity(priority: 'high' | 'medium' | 'low'): number {
    return this.config[priority];
  }

  /**
   * Set queue capacity (runtime configuration update)
   */
  async setCapacity(priority: 'high' | 'medium' | 'low', capacity: number): Promise<void> {
    this.config[priority] = capacity;

    // Emit configuration change event
    this.eventEmitter.emit({
      id: `queue_capacity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: 'LIMIT_CONFIG_CHANGED' as BackpressureEventType,
      providerId: 'system',
      details: {
        priority,
        newCapacity: capacity
      }
    });
  }

  // Private methods

  /**
   * Handle queue full scenario with defer/drop policy
   */
  private handleFullQueue(item: QueueItem, targetQueue: QueueItem[]): QueueResult {
    // Only medium priority items can be deferred to low priority (demoted)
    // Low priority items are always dropped when their queue is full
    // High priority items are always dropped when their queue is full
    if (item.priority === 'medium' && this.hasLowerPrioritySpace()) {
      return this.deferToLowerPriority(item);
    }

    // Otherwise, drop the task
    this.eventEmitter.emit({
      id: `queue_dropped_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: 'DROPPED' as BackpressureEventType,
      providerId: item.providerId,
      details: {
        priority: item.priority,
        reason: 'QUEUE_FULL',
        queueDepth: targetQueue.length,
        task: item.task
      }
    });

    return {
      queued: false,
      reason: 'QUEUE_FULL',
      item: undefined
    };
  }

  /**
   * Check if any lower priority queue has space
   * Only applies to medium priority items checking for low priority space
   */
  private hasLowerPrioritySpace(): boolean {
    // Only low priority queue is lower than medium priority
    return this.lowPriorityQueue.length < this.config.low;
  }

  /**
   * Defer task to lower priority queue
   * Only handles medium → low demotion (never low → medium promotion)
   */
  private deferToLowerPriority(item: QueueItem): QueueResult {
    // Only medium priority items can be deferred to low priority
    if (item.priority !== 'medium') {
      return {
        queued: false,
        reason: 'QUEUE_FULL',
        item: undefined
      };
    }

    // Check if low priority queue has space
    if (this.lowPriorityQueue.length >= this.config.low) {
      return {
        queued: false,
        reason: 'QUEUE_FULL',
        item: undefined
      };
    }

    const newItem: QueueItem = {
      ...item,
      priority: 'low' // Demote from medium to low
    };

    this.lowPriorityQueue.push(newItem);
    this.totalQueued++;

    this.eventEmitter.emit({
      id: `queue_deferred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: 'DEFERRED' as BackpressureEventType,
      providerId: item.providerId,
      details: {
        originalPriority: 'medium',
        newPriority: 'low',
        originalProviderId: item.providerId
      }
    });

    return {
      queued: true,
      position: this.lowPriorityQueue.length,
      waitTime: this.calculateWaitTime(this.lowPriorityQueue, this.lowPriorityQueue.length - 1),
      item: newItem
    };
  }

  /**
   * Dequeue item from specific queue
   */
  private dequeueFromQueue(priority: 'high' | 'medium' | 'low', queue: QueueItem[]): QueueItem | null {
    if (queue.length === 0) return null;

    const item = queue.shift()!;
    this.totalQueued--;

    this.eventEmitter.emit({
      id: `queue_allowed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: 'ALLOWED' as BackpressureEventType,
      providerId: item.providerId,
      details: {
        priority,
        taskId: item.id,
        waitTime: Date.now() - item.queuedAt
      }
    });

    return item;
  }

  /**
   * Get queue array by priority
   */
  private getQueueByPriority(priority: 'high' | 'medium' | 'low'): QueueItem[] {
    switch (priority) {
      case 'high': return this.highPriorityQueue;
      case 'medium': return this.mediumPriorityQueue;
      case 'low': return this.lowPriorityQueue;
    }
  }

  /**
   * Calculate utilization percentage
   */
  private calculateUtilization(capacity: number, current: number): number {
    return capacity > 0 ? (current / capacity) * 100 : 0;
  }

  /**
   * Calculate estimated wait time based on queue depth and item estimates
   */
  private calculateWaitTime(queue: QueueItem[], position: number): number {
    if (position === 0) return 0;

    let totalWait = 0;
    for (let i = 0; i < Math.min(position, queue.length); i++) {
      const estimatedTime = queue[i].estimatedTime || 5000; // Default 5s estimate
      totalWait += estimatedTime;
    }

    // Add some variance for realistic estimates
    return totalWait + (Math.random() * 1000 - 500); // ±500ms variance
  }
}

/**
 * Simple event emitter for backpressure events
 */
export class BackpressureEventEmitter {
  private listeners: Map<BackpressureEventType, Array<(event: BackpressureEvent) => void>> = new Map();

  on(eventType: BackpressureEventType, callback: (event: BackpressureEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
  }

  emit(event: BackpressureEvent): void {
    const callbacks = this.listeners.get(event.type) || [];
    callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in backpressure event callback:', error);
      }
    });
  }

  off(eventType: BackpressureEventType, callback: (event: BackpressureEvent) => void): void {
    const callbacks = this.listeners.get(eventType) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
}

/**
 * Factory function to create queue manager with default config
 */
export function createQueueManager(
  highCapacity: number = 50,
  mediumCapacity: number = 100,
  lowCapacity: number = 200
): QueueManager {
  const config: QueueCapConfig = { high: highCapacity, medium: mediumCapacity, low: lowCapacity };
  const eventEmitter = new BackpressureEventEmitter();
  return new QueueManager(config, eventEmitter);
}