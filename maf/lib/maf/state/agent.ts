// ABOUTME: Agent state management for MAF coordinator system
// ABOUTME: Handles agent registration, capability tracking, and escalation state

import { randomUUID } from 'node:crypto';
import { createMafRuntimeStateFromEnv } from '../core/runtime-factory';
import type { MafEscalationRequest, MafEscalationResponse } from '../core/protocols';

export interface AgentCapabilities {
  preflightValidation: boolean;
  reservationManagement: boolean;
  escalationHandling: boolean;
  smokeTesting: boolean;
  auditGuard: boolean;
}

export interface CommunicationChannel {
  type: 'inbox' | 'outbox' | 'escalation' | 'broadcast';
  address: string;
  lastActivity?: number;
  isActive: boolean;
}

export interface EscalationState {
  currentLevel: number;
  maxLevel: number;
  activeEscalations: Array<{
    escalationId: string;
    target: string;
    reason: string;
    timestamp: number;
    status: 'pending' | 'approved' | 'rejected' | 'deferred';
  }>;
  escalationHistory: Array<{
    escalationId: string;
    level: number;
    action: string;
    reason: string;
    timestamp: number;
  }>;
}

export interface AgentState {
  id: string;
  type: string;
  status: 'active' | 'idle' | 'busy' | 'escalated' | 'error';
  capabilities: AgentCapabilities;
  communicationChannels: CommunicationChannel[];
  escalationState: EscalationState;
  currentReservation?: {
    beadId: string;
    files: string[];
    expiresAt: number;
  };
  lastHeartbeat: number;
  metadata: {
    registeredAt: number;
    version: string;
    platform: string;
    sessionId?: string;
  };
}

export class AgentStateManager {
  private runtimeState = createMafRuntimeStateFromEnv();
  private agents = new Map<string, AgentState>();

  /**
   * Register a new agent with the system
   */
  async registerAgent(agentConfig: {
    id?: string;
    type: string;
    capabilities: Partial<AgentCapabilities>;
    metadata?: Partial<AgentState['metadata']>;
  }): Promise<AgentState> {
    const agentId = agentConfig.id || randomUUID();
    
    const agentState: AgentState = {
      id: agentId,
      type: agentConfig.type,
      status: 'idle',
      capabilities: {
        preflightValidation: agentConfig.capabilities.preflightValidation ?? false,
        reservationManagement: agentConfig.capabilities.reservationManagement ?? false,
        escalationHandling: agentConfig.capabilities.escalationHandling ?? false,
        smokeTesting: agentConfig.capabilities.smokeTesting ?? false,
        auditGuard: agentConfig.capabilities.auditGuard ?? false,
      },
      communicationChannels: [],
      escalationState: {
        currentLevel: 0,
        maxLevel: 3,
        activeEscalations: [],
        escalationHistory: []
      },
      lastHeartbeat: Date.now(),
      metadata: {
        registeredAt: Date.now(),
        version: '1.0.0',
        platform: process.platform,
        sessionId: randomUUID(),
        ...agentConfig.metadata
      }
    };

    this.agents.set(agentId, agentState);

    try {
      const runtime = await this.runtimeState;
      await runtime.enqueue({
        type: 'AGENT_REGISTERED',
        agentId,
        agentType: agentConfig.type,
        capabilities: JSON.stringify(agentState.capabilities),
        timestamp: Date.now()
      });

      // Store agent heartbeat in SQLite if available
      await this.upsertHeartbeat(agentId, 'idle');
    } catch (error) {
      console.error('Failed to register agent in runtime:', error);
    }

    return agentState;
  }

  /**
   * Get current state of an agent
   */
  async getAgentState(agentId: string): Promise<AgentState | null> {
    // Check local cache first
    const cachedAgent = this.agents.get(agentId);
    if (cachedAgent) {
      return cachedAgent;
    }

    // Try to load from runtime storage
    try {
      const runtime = await this.runtimeState;
      // This would query the SQLite database or file system for agent state
      // For now, return null as placeholder
      return null;
    } catch (error) {
      console.error('Failed to get agent state:', error);
      return null;
    }
  }

  /**
   * Update agent state
   */
  async updateAgentState(
    agentId: string, 
    updates: Partial<AgentState>
  ): Promise<void> {
    const currentState = await this.getAgentState(agentId);
    if (!currentState) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const updatedState = { ...currentState, ...updates };
    this.agents.set(agentId, updatedState);

    try {
      // Agent state event logging disabled due to type conflicts
      // const runtime = await this.runtimeState;
      // await runtime.enqueue({
      //   type: 'WORK_COMPLETE',
      //   agentId,
      //   updates: JSON.stringify(updatedState),
      //   timestamp: Date.now()
      // });

      // Update heartbeat if status changed
      if (updates.status) {
        await this.upsertHeartbeat(agentId, updates.status as 'active' | 'idle' | 'busy' | 'escalated' | 'error');
      }
    } catch (error) {
      console.error('Failed to update agent state:', error);
    }
  }

  /**
   * Store heartbeat in runtime (SQLite or file-based)
   */
  private async upsertHeartbeat(agentId: string, status: 'active' | 'idle' | 'busy' | 'escalated' | 'error'): Promise<void> {
    try {
      const runtime = await this.runtimeState;

      // Map AgentState status to runtime heartbeat status
      const mappedStatus = status === 'active' || status === 'busy' ? 'working' :
                           status === 'escalated' || status === 'error' ? 'blocked' : 'idle';

      await runtime.upsertHeartbeat({
        agentId,
        lastSeen: Date.now(),
        status: mappedStatus,
        contextUsagePercent: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100
      });
    } catch (error) {
      console.error('Failed to upsert heartbeat:', error);
    }
  }
}

// Export singleton instance
export const agentStateManager = new AgentStateManager();
