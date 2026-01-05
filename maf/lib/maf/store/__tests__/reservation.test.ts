// ABOUTME: TDD tests for reservation database operations
// ABOUTME: Tests CRUD operations, transactions, and performance optimization

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { ReservationStore } from '../reservation';

describe('ReservationStore (TDD)', () => {
  let reservationStore: ReservationStore;
  let testDbPath: string;

  beforeEach(async () => {
    // Create unique test database
    testDbPath = join(__dirname, '../../..', '__tests__', 'test-reservation-store-' + randomUUID() + '.db');
    reservationStore = new ReservationStore({
      dbPath: testDbPath
    });
    await reservationStore.initialize();
  });

  afterEach(async () => {
    await reservationStore.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Database Initialization', () => {
    it('should create database with all required tables', async () => {
      const tables = await reservationStore.getTables();
      
      expect(tables).toContain('file_reservations');
      expect(tables).toContain('agents');
      expect(tables).toContain('reservation_conflicts');
    });

    it('should create indexes for performance optimization', async () => {
      const indexes = await reservationStore.getIndexes();
      
      expect(indexes).toContain('idx_file_reservations_path_status');
      expect(indexes).toContain('idx_file_reservations_agent_expires');
      expect(indexes).toContain('idx_agents_type_status');
    });
  });

  describe('File Reservation CRUD Operations', () => {
    it('should create new file reservation', async () => {
      const reservation = {
        id: 'reservation-' + randomUUID(),
        filePath: '/test/new-file.ts',
        agentId: 'test-agent',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active' as const,
        leaseReason: 'Test reservation'
      };

      await reservationStore.createReservation(reservation);
      
      const retrieved = await reservationStore.getReservation(reservation.filePath);
      expect(retrieved).toMatchObject(reservation);
    });

    it('should enforce unique file path constraint', async () => {
      const filePath = '/test/unique-file.ts';
      
      // Create first reservation
      await reservationStore.createReservation({
        id: 'reservation-1',
        filePath,
        agentId: 'agent1',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'First reservation'
      });

      // Second reservation should fail
      await expect(reservationStore.createReservation({
        id: 'reservation-2',
        filePath,
        agentId: 'agent2',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Second reservation'
      })).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it('should update existing reservation', async () => {
      const filePath = '/test/update-file.ts';
      const originalReservation = {
        id: 'reservation-' + randomUUID(),
        filePath,
        agentId: 'test-agent',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
        status: 'active' as const,
        leaseReason: 'Original reservation'
      };

      await reservationStore.createReservation(originalReservation);

      const updates = {
        leaseExpiresAt: Date.now() + 120000,
        updatedAt: Date.now(),
        status: 'released' as const
      };

      await reservationStore.updateReservation(filePath, updates);
      
      const updated = await reservationStore.getReservation(filePath);
      expect(updated.leaseExpiresAt).toBe(updates.leaseExpiresAt);
      expect(updated.status).toBe(updates.status);
    });

    it('should delete reservation', async () => {
      const filePath = '/test/delete-file.ts';
      const reservation = {
        id: 'reservation-' + randomUUID(),
        filePath,
        agentId: 'test-agent',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active' as const,
        leaseReason: 'To be deleted'
      };

      await reservationStore.createReservation(reservation);
      await reservationStore.deleteReservation(filePath);
      
      const deleted = await reservationStore.getReservation(filePath);
      expect(deleted).toBeUndefined();
    });
  });

  describe('Conflict Query Operations', () => {
    it('should find active reservations for file paths', async () => {
      const filePaths = ['/test/file1.ts', '/test/file2.ts', '/test/file3.ts'];
      
      // Create reservations for first two files
      await reservationStore.createReservation({
        id: 'reservation-1',
        filePath: filePaths[0],
        agentId: 'other-agent',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Other agent work'
      });

      await reservationStore.createReservation({
        id: 'reservation-2',
        filePath: filePaths[1],
        agentId: 'another-agent',
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Another agent work'
      });

      const conflicts = await reservationStore.findConflicts(filePaths, 'test-agent');
      
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].filePath).toBe(filePaths[0]);
      expect(conflicts[0].agentId).toBe('other-agent');
      expect(conflicts[1].filePath).toBe(filePaths[1]);
      expect(conflicts[1].agentId).toBe('another-agent');
    });

    it('should ignore expired reservations', async () => {
      const filePaths = ['/test/expired-file.ts'];
      
      await reservationStore.createReservation({
        id: 'reservation-expired',
        filePath: filePaths[0],
        agentId: 'other-agent',
        leaseExpiresAt: Date.now() - 60000, // Expired
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Expired reservation'
      });

      const conflicts = await reservationStore.findConflicts(filePaths, 'test-agent');
      
      expect(conflicts).toHaveLength(0);
    });

    it('should ignore own reservations', async () => {
      const filePaths = ['/test/own-file.ts'];
      const agentId = 'test-agent';
      
      await reservationStore.createReservation({
        id: 'reservation-own',
        filePath: filePaths[0],
        agentId,
        leaseExpiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Own reservation'
      });

      const conflicts = await reservationStore.findConflicts(filePaths, agentId);
      
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('Agent Management', () => {
    it('should create and retrieve agents', async () => {
      const agent = {
        id: 'agent-' + randomUUID(),
        name: 'Test Agent',
        type: 'worker' as const,
        status: 'active' as const,
        lastSeen: Date.now(),
        capabilities: ['typescript', 'testing'],
        metadata: { version: '1.0.0' }
      };

      await reservationStore.createAgent(agent);
      
      const retrieved = await reservationStore.getAgent(agent.id);
      expect(retrieved).toMatchObject(agent);
    });

    it('should update agent heartbeat', async () => {
      const agentId = 'agent-' + randomUUID();
      
      await reservationStore.createAgent({
        id: agentId,
        name: 'Test Agent',
        type: 'worker',
        status: 'active',
        lastSeen: Date.now() - 10000,
        capabilities: [],
        metadata: {}
      });

      const newLastSeen = Date.now();
      await reservationStore.updateAgentHeartbeat(agentId, newLastSeen);
      
      const updated = await reservationStore.getAgent(agentId);
      expect(updated.lastSeen).toBe(newLastSeen);
    });
  });

  describe('Transaction Management', () => {
    it('should execute atomic transactions', async () => {
      const filePath1 = '/test/atomic-file1.ts';
      const filePath2 = '/test/atomic-file2.ts';
      
      // Start transaction
      await reservationStore.executeTransaction(async () => {
        await reservationStore.createReservation({
          id: 'reservation-1',
          filePath: filePath1,
          agentId: 'agent1',
          leaseExpiresAt: Date.now() + 60000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'active',
          leaseReason: 'Transaction test 1'
        });

        await reservationStore.createReservation({
          id: 'reservation-2',
          filePath: filePath2,
          agentId: 'agent2',
          leaseExpiresAt: Date.now() + 60000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'active',
          leaseReason: 'Transaction test 2'
        });
      });

      // Both reservations should exist
      const reservation1 = await reservationStore.getReservation(filePath1);
      const reservation2 = await reservationStore.getReservation(filePath2);
      
      expect(reservation1).toBeDefined();
      expect(reservation2).toBeDefined();
    });

    it('should rollback on transaction failure', async () => {
      const filePath = '/test/rollback-file.ts';
      
      // Transaction that should fail
      try {
        await reservationStore.executeTransaction(async () => {
          await reservationStore.createReservation({
            id: 'reservation-success',
            filePath,
            agentId: 'agent1',
            leaseExpiresAt: Date.now() + 60000,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'active',
            leaseReason: 'Should be rolled back'
          });

          // Simulate error
          throw new Error('Transaction failed');
        });
      } catch (error) {
        // Expected to fail
      }

      // Reservation should not exist due to rollback
      const reservation = await reservationStore.getReservation(filePath);
      expect(reservation).toBeUndefined();
    });
  });

  describe('Performance Optimization', () => {
    it('should handle bulk conflict queries efficiently', async () => {
      // Create many conflicting reservations
      const filePaths = Array.from({ length: 1000 }, (_, i) => `/test/bulk-file-${i}.ts`);
      
      for (let i = 0; i < 100; i++) {
        await reservationStore.createReservation({
          id: `reservation-${i}`,
          filePath: filePaths[i * 10], // Every 10th file
          agentId: `other-agent-${i}`,
          leaseExpiresAt: Date.now() + 60000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'active',
          leaseReason: 'Bulk test'
        });
      }

      const startTime = Date.now();
      const conflicts = await reservationStore.findConflicts(filePaths, 'test-agent');
      const duration = Date.now() - startTime;

      expect(conflicts).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean expired reservations', async () => {
      const expiredFilePath = '/test/expired-cleanup.ts';
      const activeFilePath = '/test/active-cleanup.ts';
      
      // Create expired reservation
      await reservationStore.createReservation({
        id: 'reservation-expired',
        filePath: expiredFilePath,
        agentId: 'agent1',
        leaseExpiresAt: Date.now() - 60000, // Expired
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Will be cleaned up'
      });

      // Create active reservation
      await reservationStore.createReservation({
        id: 'reservation-active',
        filePath: activeFilePath,
        agentId: 'agent2',
        leaseExpiresAt: Date.now() + 60000, // Active
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
        leaseReason: 'Will remain'
      });

      const cleanedCount = await reservationStore.cleanupExpiredReservations();
      
      expect(cleanedCount).toBe(1);
      
      const expiredReservation = await reservationStore.getReservation(expiredFilePath);
      const activeReservation = await reservationStore.getReservation(activeFilePath);
      
      expect(expiredReservation).toBeUndefined();
      expect(activeReservation).toBeDefined();
    });
  });
});
