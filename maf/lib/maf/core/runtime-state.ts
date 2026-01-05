// ABOUTME: Captures shared leases, heartbeats, and metrics layered on top of agent mail.
// ABOUTME: Provides file-based persistence to .agent-mail directory for multi-agent coordination.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from "node:crypto";
import type { MafProtocolEnvelope } from './protocols';

export interface MafLease {
  filePath: string;
  agentId: string;
  expiresAt: number;
}

export interface MafHeartbeat {
  agentId: string;
  lastSeen: number;
  status: 'idle' | 'working' | 'blocked';
  contextUsagePercent: number;
}

export interface MafRuntimeState {
  enqueue(message: MafProtocolEnvelope): Promise<void>;
  acquireLease(lease: MafLease): Promise<void>;
  releaseLease(filePath: string): Promise<void>;
  upsertHeartbeat(heartbeat: MafHeartbeat): Promise<void>;
  refresh(): Promise<void>;
  renew(taskId: string, agentId: string, ttlMs: number): Promise<boolean>;
  expireLeases(now: number): number;
}

// File-based runtime state that persists to .agent-mail directory
export function createFileBasedRuntimeState(agentMailRoot: string = '.agent-mail'): MafRuntimeState {
  const leasesPath = join(agentMailRoot, 'reservations', 'reservations.db');
  const heartbeatsPath = join(agentMailRoot, 'heartbeats.json');
  const messagesPath = join(agentMailRoot, 'messages', 'queue.json');

  // Ensure directories exist
  ensureDirectoryExists(join(agentMailRoot, 'reservations'));
  ensureDirectoryExists(join(agentMailRoot, 'messages'));

  // Helper functions for file I/O
  function ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function loadReservations(): any {
    try {
      if (!existsSync(leasesPath)) {
        return { reservations: [], version: '1.0.0', metadata: { createdAt: new Date().toISOString() } };
      }
      const content = readFileSync(leasesPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load reservations: ${error}`);
      return { reservations: [], version: '1.0.0' };
    }
  }

  function saveReservations(data: any): void {
    try {
      data.metadata.lastUpdated = new Date().toISOString();
      writeFileSync(leasesPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Failed to save reservations: ${error}`);
      throw error;
    }
  }

  function loadHeartbeats(): Map<string, MafHeartbeat> {
    try {
      if (!existsSync(heartbeatsPath)) {
        return new Map();
      }
      const content = readFileSync(heartbeatsPath, 'utf8');
      const data = JSON.parse(content);
      return new Map(Object.entries(data.heartbeats || {}));
    } catch (error) {
      console.warn(`Failed to load heartbeats: ${error}`);
      return new Map();
    }
  }

  function saveHeartbeats(heartbeats: Map<string, MafHeartbeat>): void {
    try {
      const data = {
        version: '1.0.0',
        metadata: {
          lastUpdated: new Date().toISOString(),
          count: heartbeats.size
        },
        heartbeats: Object.fromEntries(heartbeats)
      };
      writeFileSync(heartbeatsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Failed to save heartbeats: ${error}`);
      throw error;
    }
  }

  function loadMessageQueue(): MafProtocolEnvelope[] {
    try {
      if (!existsSync(messagesPath)) {
        return [];
      }
      const content = readFileSync(messagesPath, 'utf8');
      const data = JSON.parse(content);
      return data.messages || [];
    } catch (error) {
      console.warn(`Failed to load message queue: ${error}`);
      return [];
    }
  }

  function saveMessageQueue(messages: MafProtocolEnvelope[]): void {
    try {
      const data = {
        version: '1.0.0',
        metadata: {
          lastUpdated: new Date().toISOString(),
          count: messages.length
        },
        messages
      };
      writeFileSync(messagesPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Failed to save message queue: ${error}`);
      throw error;
    }
  }

  return {
    async enqueue(message: MafProtocolEnvelope): Promise<void> {
      const messages = loadMessageQueue();
      messages.push({
        ...message,
        timestamp: Date.now()
      });
      saveMessageQueue(messages);
    },

    async acquireLease(lease: MafLease): Promise<void> {
      const data = loadReservations();

      // Check for existing lease on this file
      const existingLease = data.reservations.find((r: any) =>
        r.filePath === lease.filePath && r.status === 'active'
      );

      if (existingLease) {
        // Check if lease has expired
        const expiresTime = typeof existingLease.expiresAt === 'string'
          ? new Date(existingLease.expiresAt).getTime()
          : existingLease.expiresAt;

        if (expiresTime > Date.now()) {
          throw new Error(`File already leased by ${existingLease.agentId} until ${new Date(expiresTime).toISOString()}`);
        } else {
          // Mark existing lease as expired
          existingLease.status = 'expired';
        }
      }

      // Add new lease
      const reservation = {
        id: `lease_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId: lease.agentId,
        filePath: lease.filePath,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(lease.expiresAt).toISOString(),
        status: 'active' as const,
        purpose: 'File lease for multi-agent coordination'
      };

      data.reservations.push(reservation);
      saveReservations(data);
    },

    async releaseLease(filePath: string): Promise<void> {
      const data = loadReservations();
      const leaseIndex = data.reservations.findIndex((r: any) =>
        r.filePath === filePath && r.status === 'active'
      );

      if (leaseIndex !== -1) {
        data.reservations[leaseIndex].status = 'released';
        data.reservations[leaseIndex].releasedAt = new Date().toISOString();
        saveReservations(data);
      }
    },

    async upsertHeartbeat(heartbeat: MafHeartbeat): Promise<void> {
      const heartbeats = loadHeartbeats();
      heartbeats.set(heartbeat.agentId, heartbeat);
      saveHeartbeats(heartbeats);
    },

    async refresh(): Promise<void> {
      const data = loadReservations();
      const now = Date.now();

      // Mark expired leases as expired
      let updated = false;
      for (const reservation of data.reservations) {
        if (reservation.status === 'active' && new Date(reservation.expiresAt).getTime() <= now) {
          reservation.status = 'expired';
          reservation.expiredAt = new Date().toISOString();
          updated = true;
        }
      }

      if (updated) {
        saveReservations(data);
      }

      // Clean up old heartbeats (older than 5 minutes)
      const heartbeats = loadHeartbeats();
      const heartbeatThreshold = now - (5 * 60 * 1000); // 5 minutes
      let heartbeatUpdated = false;

      for (const [agentId, heartbeat] of Array.from(heartbeats.entries())) {
        if (heartbeat.lastSeen < heartbeatThreshold) {
          heartbeats.delete(agentId);
          heartbeatUpdated = true;
        }
      }

      if (heartbeatUpdated) {
        saveHeartbeats(heartbeats);
      }
    },

    async renew(taskId: string, agentId: string, ttlMs: number): Promise<boolean> {
      try {
        const data = loadReservations();
        const now = Date.now();
        const maxExpiresAt = 8.64e15; // Maximum valid Date timestamp in ms
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
          console.warn("Rejecting renewal with invalid TTL:", ttlMs);
          return false;
        }
        const newExpiresAt = now + ttlMs;
        if (!Number.isFinite(newExpiresAt) || newExpiresAt <= now || newExpiresAt > maxExpiresAt) {
          console.warn("Rejecting renewal with invalid expiration:", newExpiresAt);
          return false;
        }
        
        // Find the reservation by synthetic task mapping
        const reservation = data.reservations.find((r: any) => {
          const syntheticTaskId = `file_${createHash("sha256").update(r.filePath).digest("hex").substring(0, 16)}`;
          return syntheticTaskId === taskId && r.agentId === agentId && r.status === "active";
        });
        
        if (!reservation) {
          console.warn(`Failed to renew lease for task ${taskId} by agent ${agentId} - not found or not owned`);
          return false;
        }
        
        // Update the lease expiration
        reservation.expiresAt = new Date(newExpiresAt).toISOString();
        saveReservations(data);
        
        const logLevel = (process.env.MAF_LOG_LEVEL || process.env.LOG_LEVEL || '').toLowerCase();
        if (logLevel === 'debug') {
          console.log(`Renewed lease for task ${taskId} by agent ${agentId} until ${new Date(newExpiresAt).toISOString()}`);
        }
        return true;
      } catch (error) {
        console.error("Failed to renew lease:", error);
        throw new Error("Lease renewal failed: " + error);
      }
    },

    expireLeases(now: number): number {
      try {
        const data = loadReservations();
        let expiredCount = 0;
        
        // Mark expired leases as expired
        for (const reservation of data.reservations) {
          if (reservation.status === "active" && new Date(reservation.expiresAt).getTime() <= now) {
            reservation.status = "expired";
            reservation.expiredAt = new Date().toISOString();
            expiredCount++;
          }
        }
        
        if (expiredCount > 0) {
          saveReservations(data);
          console.log(`Marked ${expiredCount} leases as expired`);
        }
        
        return expiredCount;
      } catch (error) {
        console.error("Failed to expire leases:", error);
        throw new Error("Lease expiration failed: " + error);
      }
    },
  };
}

export function createInMemoryRuntimeState(): MafRuntimeState {
  const leases = new Map<string, MafLease>();
  const heartbeats = new Map<string, MafHeartbeat>();

  return {
    async enqueue() {
      // In-memory implementation - no persistence
    },
    async acquireLease(lease) {
      leases.set(lease.filePath, lease);
    },
    async releaseLease(filePath) {
      leases.delete(filePath);
    },
    async upsertHeartbeat(heartbeat) {
      heartbeats.set(heartbeat.agentId, heartbeat);
    },
    async refresh() {
      const now = Date.now();
      for (const [key, lease] of Array.from(leases.entries())) {
        if (lease.expiresAt <= now) {
          leases.delete(key);
        }
      }
    },

    async renew(taskId: string, agentId: string, ttlMs: number): Promise<boolean> {
      // In-memory implementation doesn"t support task ID-based lease renewal
      // This would need taskId -> filePath mapping for completeness
      return false;
    },

    expireLeases(now: number): number {
      let expiredCount = 0;
      for (const [key, lease] of Array.from(leases.entries())) {
        if (lease.expiresAt <= now) {
          leases.delete(key);
          expiredCount++;
        }
      }
      return expiredCount;
    },
  };
}
