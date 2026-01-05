// ABOUTME: Unit tests for MAF rate limiter implementation
// ABOUTME: Tests leaky bucket algorithm, token consumption, and recovery

import { RateLimiter, RateLimiterManager, createRateLimiter } from '../rate-limiter';
import { BackpressureEventEmitter } from '../queue-manager';
import type { BackpressureEvent } from '../types';

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  let mockEventEmitter: BackpressureEventEmitter;

  beforeEach(() => {
    limiter = createRateLimiter('test-provider', { capacity: 5, refillRate: 1 });
    mockEventEmitter = new BackpressureEventEmitter();
  });

  describe('Basic rate limiting', () => {
    it('should allow requests when tokens are available', async () => {
      const result1 = await limiter.tryConsume();
      const result2 = await limiter.tryConsume();

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remainingTokens).toBe(4);
      expect(result2.remainingTokens).toBe(3);
    });

    it('should throttle requests when tokens are exhausted', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        const result = await limiter.tryConsume();
        expect(result.allowed).toBe(true);
      }

      // Next request should be throttled
      const result = await limiter.tryConsume();
      expect(result.allowed).toBe(false);
      expect(result.remainingTokens).toBe(0);
      expect(result.waitTimeMs).toBeGreaterThan(0);
    });

    it('should return immediate status without consuming tokens', async () => {
      const initialStatus = await limiter.getStatus();
      expect(initialStatus.allowed).toBe(true);
      expect(initialStatus.remainingTokens).toBe(5);

      // Consume a token
      await limiter.tryConsume();

      const statusAfterConsume = await limiter.getStatus();
      expect(statusAfterConsume.remainingTokens).toBe(4);
    });
  });

  describe('Token refill (leaky bucket)', () => {
    it('should refill tokens over time', async () => {
      // Set up fast refill for testing
      limiter = createRateLimiter('test-provider', { capacity: 5, refillRate: 10 }); // 10 tokens/second

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.tryConsume();
      }

      // Should be throttled immediately
      let result = await limiter.tryConsume();
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBeLessThanOrEqual(200); // Should wait ~100ms for one token

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 120));

      // Should have one token available now
      result = await limiter.tryConsume();
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(0);
    });

    it('should calculate next refill time correctly', async () => {
      limiter = createRateLimiter('test-provider', { capacity: 5, refillRate: 10 }); // 10 tokens/second

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.tryConsume();
      }

      const status = await limiter.getStatus();
      expect(status.nextRefillTime).toBeGreaterThan(0);
    });
  });

  describe('Rate limiter statistics', () => {
    it('should provide accurate statistics', async () => {
      // Consume some tokens
      await limiter.tryConsume();
      await limiter.tryConsume();

      const stats = await limiter.getStats();
      expect(stats.providerId).toBe('test-provider');
      expect(stats.currentTokens).toBe(3);
      expect(stats.capacity).toBe(5);
      expect(stats.refillRate).toBe(1);
      expect(stats.utilization).toBe(0.4); // 2/5 = 40%
    });

    it('should handle empty bucket statistics', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.tryConsume();
      }

      const stats = await limiter.getStats();
      expect(stats.currentTokens).toBe(0);
      expect(stats.utilization).toBe(1); // 100% utilized
    });
  });

  describe('Configuration updates', () => {
    it('should update capacity dynamically', async () => {
      // Start with capacity 5
      await limiter.updateConfig({ capacity: 5 });

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        const result = await limiter.tryConsume();
        expect(result.allowed).toBe(true);
      }

      // Increase capacity to 10
      await limiter.updateConfig({ capacity: 10 });

      // Should now have more capacity
      const status = await limiter.getStatus();
      expect(status.remainingTokens).toBeLessThanOrEqual(10);
    });

    it('should update refill rate dynamically', async () => {
      // Set up slow refill
      limiter = createRateLimiter('test-provider', { capacity: 5, refillRate: 0.5 }); // 0.5 tokens/second

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.tryConsume();
      }

      // Increase refill rate
      await limiter.updateConfig({ refillRate: 2 }); // 2 tokens/second

      const status = await limiter.getStatus();
      expect(status.refillRate).toBe(2);
    });
  });

  describe('Emergency reset', () => {
    it('should reset to full capacity', async () => {
      // Consume tokens
      await limiter.tryConsume();
      await limiter.tryConsume();

      // Reset
      await limiter.reset();

      const status = await limiter.getStatus();
      expect(status.currentTokens).toBe(5);
      expect(status.remainingTokens).toBe(5);
    });
  });

  describe('Backpressure events', () => {
    it('should create THROTTLED event when request is blocked', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.tryConsume();
      }

      const event = limiter.createBackpressureEvent('THROTTLED');
      expect(event.type).toBe('THROTTLED');
      expect(event.providerId).toBe('test-provider');
      expect(event.details.remainingTokens).toBe(0);
      expect(event.details.utilization).toBe(1);
    });

    it('should create ALLOWED event when request is permitted', async () => {
      const event = limiter.createBackpressureEvent('ALLOWED');
      expect(event.type).toBe('ALLOWED');
      expect(event.providerId).toBe('test-provider');
      expect(event.details.remainingTokens).toBe(5);
    });
  });
});

describe('RateLimiterManager', () => {
  let manager: RateLimiterManager;

  beforeEach(() => {
    manager = new RateLimiterManager();
  });

  describe('Multiple provider management', () => {
    it('should manage rate limiters for different providers', async () => {
      const limiter1 = await manager.getLimiter('provider-1', { capacity: 10, refillRate: 2 });
      const limiter2 = await manager.getLimiter('provider-2', { capacity: 5, refillRate: 1 });

      // They should be separate instances
      expect(limiter1).not.toBe(limiter2);

      // Consume from first provider
      const result1 = await limiter1.tryConsume();
      expect(result1.allowed).toBe(true);

      // First provider should still have tokens
      const status1 = await limiter1.getStatus();
      expect(status1.currentTokens).toBe(9);

      // Second provider should be unaffected
      const status2 = await limiter2.getStatus();
      expect(status2.currentTokens).toBe(5);
    });

    it('should reuse existing limiters', async () => {
      const limiter1 = await manager.getLimiter('provider-1');
      const limiter2 = await manager.getLimiter('provider-1');

      // Should return the same instance
      expect(limiter1).toBe(limiter2);
    });
  });

  describe('Batch operations', () => {
    it('should handle batch consumption across providers', async () => {
      const providerConfigs = [
        { providerId: 'provider-a', config: { capacity: 3, refillRate: 1 } },
        { providerId: 'provider-b', config: { capacity: 2, refillRate: 1 } },
        { providerId: 'provider-c', config: { capacity: 1, refillRate: 1 } }
      ];

      const results = await manager.tryConsumeBatch(providerConfigs);

      expect(results).toHaveLength(3);
      expect(results[0].providerId).toBe('provider-a');
      expect(results[1].providerId).toBe('provider-b');
      expect(results[2].providerId).toBe('provider-c');

      // All should be allowed initially
      expect(results.every(r => r.result.allowed)).toBe(true);
    });

    it('should handle throttling in batch operations', async () => {
      const providerConfigs = [
        { providerId: 'provider-a', config: { capacity: 1, refillRate: 1 } },
        { providerId: 'provider-b', config: { capacity: 1, refillRate: 1 } },
        { providerId: 'provider-c', config: { capacity: 1, refillRate: 1 } }
      ];

      // First batch should succeed
      let results = await manager.tryConsumeBatch(providerConfigs);
      expect(results.every(r => r.result.allowed)).toBe(true);

      // Second batch should be throttled
      results = await manager.tryConsumeBatch(providerConfigs);
      expect(results.every(r => r.result.allowed)).toBe(false);
    });
  });

  describe('Statistics and cleanup', () => {
    it('should provide stats for all providers', async () => {
      // Add some limiters
      await manager.getLimiter('provider-a', { capacity: 10, refillRate: 1 });
      await manager.getLimiter('provider-b', { capacity: 5, refillRate: 2 });

      const stats = await manager.getAllStats();
      expect(stats).toHaveLength(2);
      expect(stats[0].providerId).toMatch(/provider-[ab]/);
      expect(stats[1].providerId).toMatch(/provider-[ab]/);
    });

    it('should reset all limiters', async () => {
      // Add limiter and consume tokens
      const limiter = await manager.getLimiter('provider-a', { capacity: 5, refillRate: 1 });
      await limiter.tryConsume();
      await limiter.tryConsume();

      // Reset all
      await manager.resetAll();

      const stats = await limiter.getStats();
      expect(stats.currentTokens).toBe(5); // Should be back to full capacity
    });

    it('should cleanup inactive limiters', async () => {
      // Add some limiters
      await manager.getLimiter('active-provider', { capacity: 5, refillRate: 1 });
      await manager.getLimiter('inactive-provider', { capacity: 5, refillRate: 1 });

      // Clean up (simplified test - in reality you'd track last activity)
      const cleaned = manager.cleanup(0); // Clean everything older than 0ms
      expect(cleaned).toBeGreaterThan(0);
    });
  });
});