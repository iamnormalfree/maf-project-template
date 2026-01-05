// ABOUTME: File reservation management for MAF coordination
// ABOUTME: Handles lease acquisition, conflict detection, and expiration management

import { randomUUID } from 'node:crypto';
import { ReservationStore, FileReservation } from '../store/reservation';
import type { MafReservationCheck } from '../core/protocols';

export interface LeaseRequest {
  filePath: string;
  durationMs: number;
  reason?: string;
}

export interface Lease {
  id: string;
  filePath: string;
  agentId: string;
  expiresAt: number;
  createdAt: number;
  reason?: string;
}

export interface ConflictInfo {
  filePath: string;
  leasedBy: string;
  expiresAt: number;
  leaseReason?: string;
}

export interface FileReservationManagerConfig {
  dbPath: string;
  agentId: string;
  defaultLeaseDurationMs?: number;
  cleanupIntervalMs?: number;
}

export class FileReservationManager {
  private store: ReservationStore;
  private config: FileReservationManagerConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: FileReservationManagerConfig) {
    this.config = {
      defaultLeaseDurationMs: 60000, // 1 minute default
      cleanupIntervalMs: 300000, // 5 minutes
      ...config
    };

    this.store = new ReservationStore({
      dbPath: this.config.dbPath
    });
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    
    // Register this agent if not exists
    await this.store.createAgent({
      id: this.config.agentId,
      name: 'Agent ' + this.config.agentId,
      type: 'worker',
      status: 'active',
      capabilities: 'file_reservation',
      metadata: JSON.stringify({ version: '1.0.0' }),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Start cleanup timer
    this.startCleanupTimer();
  }

  async acquireLease(request: LeaseRequest): Promise<Lease> {
    const now = Date.now();
    const expiresAt = now + request.durationMs;

    try {
      await this.store.executeTransaction(async () => {
        // Check for existing active lease
        const existing = this.store.getReservationSync(request.filePath);
        
        if (existing) {
          if (existing.agentId === this.config.agentId) {
            // Own lease - update expiry
            this.store.updateReservationSync(request.filePath, {
              leaseExpiresAt: expiresAt,
              updatedAt: now,
              status: 'active'
            });
          } else if (existing.status === 'active' && existing.leaseExpiresAt > now) {
            // Other agent's active lease - conflict, do not take over
            throw new Error(
              'File already leased by ' + existing.agentId + ' until ' + new Date(existing.leaseExpiresAt).toISOString()
            );
          } else {
            // Expired or inactive lease - can take over
            this.store.updateReservationSync(request.filePath, {
              agentId: this.config.agentId,
              leaseExpiresAt: expiresAt,
              updatedAt: now,
              status: 'active',
              leaseReason: request.reason
            });
          }
        } else {
          // No existing lease - create new one
          this.store.createReservationSync({
            filePath: request.filePath,
            agentId: this.config.agentId,
            leaseExpiresAt: expiresAt,
            createdAt: now,
            updatedAt: now,
            status: 'active',
            leaseReason: request.reason
          });
        }
      });

      return {
        id: randomUUID(),
        filePath: request.filePath,
        agentId: this.config.agentId,
        expiresAt,
        createdAt: now,
        reason: request.reason
      };

    } catch (error) {
      throw new Error('Failed to acquire lease for ' + request.filePath + ': ' + error);
    }
  }

  async releaseLease(filePath: string): Promise<void> {
    try {
      const existing = await this.store.getReservation(filePath);
      
      if (existing && existing.agentId === this.config.agentId) {
        await this.store.updateReservation(filePath, {
          status: 'released',
          updatedAt: Date.now()
        });
      }
      // If no existing lease or not owned by us, silently succeed

    } catch (error) {
      throw new Error('Failed to release lease for ' + filePath + ': ' + error);
    }
  }

  async renewLease(filePath: string, additionalDurationMs: number): Promise<Lease> {
    const now = Date.now();
    
    try {
      const existing = await this.store.getReservation(filePath);
      
      if (!existing) {
        throw new Error('No active lease found for ' + filePath);
      }

      if (existing.agentId !== this.config.agentId) {
        throw new Error('Cannot renew lease owned by ' + existing.agentId);
      }

      if (existing.status !== 'active') {
        throw new Error('Cannot renew lease with status ' + existing.status);
      }

      const baseTime = Math.max(existing.leaseExpiresAt, now);
      const newExpiresAt = baseTime + additionalDurationMs;
      
      await this.store.updateReservation(filePath, {
        leaseExpiresAt: newExpiresAt,
        updatedAt: now
      });

      return {
        id: existing.id || randomUUID(),
        filePath,
        agentId: this.config.agentId,
        expiresAt: newExpiresAt,
        createdAt: existing.createdAt,
        reason: existing.leaseReason
      };

    } catch (error) {
      throw new Error('Failed to renew lease for ' + filePath + ': ' + error);
    }
  }

  async checkConflicts(filePaths: string[]): Promise<ConflictInfo[]> {
    const conflicts = await this.store.findConflicts(filePaths, this.config.agentId);
    
    return conflicts.map(conflict => ({
      filePath: conflict.filePath,
      leasedBy: conflict.agentId,
      expiresAt: conflict.leaseExpiresAt
    }));
  }

  async performReservationCheck(stagedFiles: string[]): Promise<MafReservationCheck> {
    const conflicts = await this.checkConflicts(stagedFiles);
    const allowOverride = process.env.MAF_RESERVATION_OVERRIDE === 'true';

    return {
      type: 'RESERVATION_CHECK',
      agentId: this.config.agentId,
      stagedFiles,
      allowOverride,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      timestamp: Date.now()
    };
  }

  async cleanupExpiredLeases(): Promise<number> {
    try {
      const cleanedCount = await this.store.cleanupExpiredReservations();
      
      if (cleanedCount > 0) {
        console.log('Cleaned up ' + cleanedCount + ' expired lease(s)');
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup expired leases:', error);
      return 0;
    }
  }

  getAgentId(): string {
    return this.config.agentId;
  }

  private startCleanupTimer(): void {
    if (this.config.cleanupIntervalMs && this.config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredLeases().catch(error => {
          console.error('Scheduled cleanup failed:', error);
        });
      }, this.config.cleanupIntervalMs);
    }
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async close(): Promise<void> {
    this.stopCleanupTimer();
    
    // Release all active leases owned by this agent
    try {
      // Note: This would require a method to find all leases by agent
      // For now, just close the store connection
      await this.store.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Utility methods for testing and diagnostics
  async getActiveLeases(): Promise<FileReservation[]> {
    // This would need to be implemented in the store
    // For now, return empty array
    return [];
  }

  async getReservationInfo(filePath: string): Promise<FileReservation | undefined> {
    return await this.store.getReservation(filePath);
  }
}
