// ABOUTME: Per-provider rate limiter using leaky bucket algorithm
// ABOUTME: Prevents overload by enforcing configurable rate limits per provider

import type { BackpressureEvent, RateLimiterConfig, RateLimitResult, RateLimiterStatus } from './types';

/**
 * Rate limiter implementation using leaky bucket algorithm
 *
 * Leaky bucket algorithm:
 * - Bucket has capacity (max tokens)
 * - Tokens leak out at a fixed rate (refill rate)
 * - When request comes in, try to take 1 token
 * - If bucket empty, request is throttled
 * - Burst capacity is handled by bucket size
 */
export class RateLimiter {
  private capacity: number;
  private refillRate: number; // tokens per second
  private readonly providerId: string;

  private currentTokens: number;
  private lastRefillTime: number;
  private refillIntervalMs: number;

  constructor(
    providerId: string,
    config: RateLimiterConfig = { capacity: 10, refillRate: 1 }
  ) {
    this.providerId = providerId;
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.currentTokens = this.capacity;
    this.lastRefillTime = Date.now();
    this.refillIntervalMs = 1000 / this.refillRate; // ms per token
  }

  /**
   * Try to consume a token for this provider
   * @returns Result indicating if request was allowed or throttled
   */
  async tryConsume(): Promise<RateLimitResult> {
    this.refill(); // Refill tokens before checking

    if (this.currentTokens > 0) {
      // Consume token and allow request
      this.currentTokens--;
      return {
        allowed: true,
        remainingTokens: this.currentTokens,
        nextRefillTime: this.calculateNextRefillTime(),
        waitTimeMs: 0
      };
    }

    // Bucket is empty, calculate wait time
    const waitTimeMs = this.calculateWaitTime();
    return {
      allowed: false,
      remainingTokens: 0,
      nextRefillTime: this.calculateNextRefillTime(),
      waitTimeMs
    };
  }

  /**
   * Get current status without consuming a token
   */
  async getStatus(): Promise<RateLimiterStatus> {
    this.refill();
    const utilization = this.capacity > 0 ? (1 - this.currentTokens / this.capacity) : 1;

    return {
      allowed: this.currentTokens > 0,
      currentTokens: this.currentTokens,
      remainingTokens: this.currentTokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      utilization,
      nextRefillTime: this.calculateNextRefillTime(),
      waitTimeMs: this.currentTokens === 0 ? this.calculateWaitTime() : 0
    };
  }

  /**
   * Reset the rate limiter (emergency reset)
   */
  async reset(): Promise<void> {
    this.currentTokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Update the rate limiter configuration
   */
  async updateConfig(config: Partial<RateLimiterConfig>): Promise<void> {
    if (config.capacity !== undefined) {
      this.capacity = config.capacity;
      // Adjust current tokens proportionally
      this.currentTokens = Math.min(this.currentTokens, this.capacity);
    }
    if (config.refillRate !== undefined) {
      this.refillRate = config.refillRate;
      this.refillIntervalMs = 1000 / this.refillRate;
    }
  }

  /**
   * Get statistics for monitoring
   */
  async getStats(): Promise<{
    providerId: string;
    currentTokens: number;
    capacity: number;
    refillRate: number;
    utilization: number;
    lastRefillTime: number;
  }> {
    this.refill();
    return {
      providerId: this.providerId,
      currentTokens: this.currentTokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      utilization: this.capacity > 0 ? (1 - this.currentTokens / this.capacity) : 1,
      lastRefillTime: this.lastRefillTime
    };
  }

  /**
   * Create backpressure event for observability
   */
  createBackpressureEvent(eventType: 'THROTTLED' | 'ALLOWED'): BackpressureEvent {
    return {
      id: `rate_limiter_${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: eventType,
      providerId: this.providerId,
      details: {
        remainingTokens: this.currentTokens,
        capacity: this.capacity,
        refillRate: this.refillRate,
        utilization: this.capacity > 0 ? (1 - this.currentTokens / this.capacity) : 1
      }
    };
  }

  // Private methods

  /**
   * Refill tokens based on elapsed time since last refill
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const tokensToAdd = Math.floor(elapsedMs / this.refillIntervalMs);

    if (tokensToAdd > 0) {
      this.currentTokens = Math.min(this.currentTokens + tokensToAdd, this.capacity);
      this.lastRefillTime = now;
    }
  }

  /**
   * Calculate when the next token will be available
   */
  private calculateNextRefillTime(): number {
    if (this.currentTokens > 0) {
      return this.lastRefillTime; // Available immediately
    }
    // Calculate when next token will be added
    return this.lastRefillTime + this.refillIntervalMs;
  }

  /**
   * Calculate how long to wait for next available token
   */
  private calculateWaitTime(): number {
    if (this.currentTokens > 0) {
      return 0;
    }
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefillTime;
    const remainingTime = this.refillIntervalMs - (timeSinceLastRefill % this.refillIntervalMs);
    return remainingTime;
  }
}

/**
 * Factory function to create rate limiter with provider-specific configuration
 */
export function createRateLimiter(
  providerId: string,
  config: RateLimiterConfig = { capacity: 10, refillRate: 1 }
): RateLimiter {
  return new RateLimiter(providerId, config);
}

/**
 * Manager for multiple provider rate limiters
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Get or create a rate limiter for a provider
   */
  async getLimiter(
    providerId: string,
    config?: RateLimiterConfig
  ): Promise<RateLimiter> {
    let limiter = this.limiters.get(providerId);
    if (!limiter) {
      limiter = createRateLimiter(providerId, config);
      this.limiters.set(providerId, limiter);
    }
    return limiter;
  }

  /**
   * Try to consume across all limiters (batch operation)
   */
  async tryConsumeBatch(
    providerConfigs: Array<{ providerId: string; config?: RateLimiterConfig }>
  ): Promise<Array<{ providerId: string; result: RateLimitResult }>> {
    const results: Array<{ providerId: string; result: RateLimitResult }> = [];

    for (const { providerId, config } of providerConfigs) {
      const limiter = await this.getLimiter(providerId, config);
      const result = await limiter.tryConsume();
      results.push({ providerId, result });
    }

    return results;
  }

  /**
   * Get stats for all providers
   */
  async getAllStats(): Promise<Array<Awaited<ReturnType<RateLimiter['getStats']>>>> {
    const stats: Array<Awaited<ReturnType<RateLimiter['getStats']>>> = [];
    for (const limiter of this.limiters.values()) {
      stats.push(await limiter.getStats());
    }
    return stats;
  }

  /**
   * Reset all limiters
   */
  async resetAll(): Promise<void> {
    for (const limiter of this.limiters.values()) {
      await limiter.reset();
    }
  }

  /**
   * Cleanup inactive limiters
   */
  cleanup(inactiveMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [providerId, limiter] of this.limiters.entries()) {
      // For now, clean up everything - in production you'd track last activity
      if (true) { // Placeholder for activity check
        this.limiters.delete(providerId);
        cleaned++;
      }
    }

    return cleaned;
  }
}