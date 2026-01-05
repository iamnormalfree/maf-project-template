// ABOUTME: TDD tests for file reservation system
// ABOUTME: Tests lease acquisition, conflict detection, and expiration handling

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { FileReservationManager } from '../file';

describe('FileReservationManager (TDD)', () => {
  let reservationManager: FileReservationManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create unique test database
    testDbPath = join(__dirname, '../../..', '__tests__', 'test-reservations-' + randomUUID() + '.db');
    reservationManager = new FileReservationManager({
      dbPath: testDbPath,
      agentId: 'test-agent-' + randomUUID()
    });
    
    // Initialize the reservation manager
    await reservationManager.initialize();
  });

  afterEach(async () => {
    await reservationManager.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Lease Acquisition', () => {
    it('should acquire lease for unreserved file', async () => {
      const filePath = '/test/unreserved-file.ts';
      const leaseDuration = 60000; // 1 minute
      
      const lease = await reservationManager.acquireLease({
        filePath,
        durationMs: leaseDuration,
        reason: 'Test lease acquisition'
      });

      expect(lease).toBeDefined();
      expect(lease.filePath).toBe(filePath);
      expect(lease.agentId).toBe(reservationManager.getAgentId());
      expect(lease.expiresAt).toBeGreaterThan(Date.now());
      expect(lease.expiresAt).toBeLessThanOrEqual(Date.now() + leaseDuration);
    });

    it('should reject lease for already leased file', async () => {
      const filePath = '/test/already-leased.ts';
      const otherAgent = new FileReservationManager({
        dbPath: testDbPath,
        agentId: 'other-agent'
      });
      await otherAgent.initialize();

      // First agent acquires lease
      await otherAgent.acquireLease({
        filePath,
        durationMs: 60000,
        reason: 'First lease'
      });

      // Second agent should fail to acquire lease
      await expect(reservationManager.acquireLease({
        filePath,
        durationMs: 60000,
        reason: 'Conflicting lease'
      })).rejects.toThrow(/already leased/);
      
      await otherAgent.close();
    });

    it('should acquire lease for expired reservation', async () => {
      const filePath = '/test/expired-lease.ts';
      const otherAgent = new FileReservationManager({
        dbPath: testDbPath,
        agentId: 'other-agent'
      });
      await otherAgent.initialize();

      // First agent acquires lease with very short duration
      await otherAgent.acquireLease({
        filePath,
        durationMs: 1, // 1ms - will expire immediately
        reason: 'Expiring lease'
      });

      // Wait for lease to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be able to acquire lease now
      const lease = await reservationManager.acquireLease({
        filePath,
        durationMs: 60000,
        reason: 'New lease after expiration'
      });

      expect(lease.filePath).toBe(filePath);
      expect(lease.agentId).toBe(reservationManager.getAgentId());
      
      await otherAgent.close();
    });
  });

  describe('Lease Release', () => {
    it('should release active lease', async () => {
      const filePath = '/test/release-lease.ts';
      
      // Acquire lease
      await reservationManager.acquireLease({
        filePath,
        durationMs: 60000,
        reason: 'Lease to release'
      });

      // Release lease
      await reservationManager.releaseLease(filePath);

      // Should be able to acquire lease again
      const newLease = await reservationManager.acquireLease({
        filePath,
        durationMs: 60000,
        reason: 'New lease after release'
      });

      expect(newLease.filePath).toBe(filePath);
    });

    it('should handle releasing non-existent lease gracefully', async () => {
      const filePath = '/test/non-existent-lease.ts';
      
      // Should not throw error
      await expect(reservationManager.releaseLease(filePath)).resolves.toBeUndefined();
    });
  });

  describe('Conflict Detection', () => {
    it('should detect conflicts for staged files', async () => {
      const stagedFiles = [
        '/test/conflict-file-1.ts',
        '/test/conflict-file-2.ts',
        '/test/free-file.ts'
      ];

      const otherAgent = new FileReservationManager({
        dbPath: testDbPath,
        agentId: 'other-agent'
      });
      await otherAgent.initialize();

      // Other agent leases some files
      await otherAgent.acquireLease({
        filePath: '/test/conflict-file-1.ts',
        durationMs: 60000,
        reason: 'Other agent work'
      });

      await otherAgent.acquireLease({
        filePath: '/test/conflict-file-2.ts',
        durationMs: 60000,
        reason: 'Other agent work'
      });

      // Check for conflicts
      const conflicts = await reservationManager.checkConflicts(stagedFiles);

      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].filePath).toBe('/test/conflict-file-1.ts');
      expect(conflicts[0].leasedBy).toBe('other-agent');
      expect(conflicts[1].filePath).toBe('/test/conflict-file-2.ts');
      expect(conflicts[1].leasedBy).toBe('other-agent');
      
      await otherAgent.close();
    });

    it('should return empty array when no conflicts exist', async () => {
      const stagedFiles = ['/test/free-file-1.ts', '/test/free-file-2.ts'];

      const conflicts = await reservationManager.checkConflicts(stagedFiles);

      expect(conflicts).toHaveLength(0);
    });

    it('should ignore own leases', async () => {
      const stagedFiles = ['/test/own-lease.ts'];

      // Acquire lease with our own agent
      await reservationManager.acquireLease({
        filePath: '/test/own-lease.ts',
        durationMs: 60000,
        reason: 'Own agent work'
      });

      // Should not detect conflict with own lease
      const conflicts = await reservationManager.checkConflicts(stagedFiles);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('Lease Renewal', () => {
    it('should renew active lease', async () => {
      const filePath = '/test/renewal-lease.ts';
      const initialDuration = 60000;
      
      // Acquire initial lease
      const lease = await reservationManager.acquireLease({
        filePath,
        durationMs: initialDuration,
        reason: 'Initial lease'
      });

      const originalExpiresAt = lease.expiresAt;

      // Wait a bit and renew
      await new Promise(resolve => setTimeout(resolve, 10));
      const renewedLease = await reservationManager.renewLease(filePath, 30000);

      expect(renewedLease.expiresAt).toBeGreaterThan(originalExpiresAt);
      expect(renewedLease.filePath).toBe(filePath);
      expect(renewedLease.agentId).toBe(reservationManager.getAgentId());
    });

    it('should fail to renew non-existent lease', async () => {
      const filePath = '/test/non-existent-renewal.ts';

      await expect(reservationManager.renewLease(filePath, 60000))
        .rejects.toThrow(/No active lease found/);
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean expired leases', async () => {
      const filePath = '/test/cleanup-expired.ts';
      
      // Create lease that expires immediately
      await reservationManager.acquireLease({
        filePath,
        durationMs: 1,
        reason: 'Expiring lease for cleanup'
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Run cleanup
      const cleanedCount = await reservationManager.cleanupExpiredLeases();

      expect(cleanedCount).toBeGreaterThan(0);
    });
  });
});
