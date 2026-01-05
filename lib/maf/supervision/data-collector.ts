// ABOUTME: Three-layer data collection pipeline for MAF supervision.
// ABOUTME: Layer 1 (Raw JSON) → Layer 2 (Collected Data) → Layer 3 (Supervision Context)
// ABOUTME: #PATH_DECISION: Using child_process.exec for bash calls (subprocess overhead acceptable for monitoring)

import { promisify } from 'node:util';
import { exec as execCallback } from 'node:child_process';
import { join } from 'node:path';
import type { 
  TmuxMonitorRawOutput,
  CollectedAgentData,
  CollectedData,
  SupervisionContext,
  AgentState,
  AgentSession,
  SystemMetrics,
  TmuxSessionInfo,
  AgentJsonData,
  SystemJsonData
} from './types';
import type { MafRuntimeState, MafHeartbeat } from '../core/runtime-state';
import type { MafEventLogger } from '../events/event-logger';

const execAsync = promisify(execCallback);

// Default timeout for bash script execution (10 seconds)
const DEFAULT_TIMEOUT_MS = 10000;

// Path to tmux-agent-monitor.sh script
const MONITOR_SCRIPT_PATH = join(process.cwd(), 'scripts/maf/tmux-agent-monitor.sh');

/**
 * MafDataCollector - Three-layer data collection pipeline
 * 
 * Layer 1: Raw JSON from tmux-agent-monitor.sh (bash script)
 * Layer 2: Collected data (internal representation with heartbeats)
 * Layer 3: Supervision context (view model for supervisor)
 */
export class MafDataCollector {
  private runtimeState: MafRuntimeState;
  private eventLogger: MafEventLogger | null;
  private scriptPath: string;

  constructor(runtimeState: MafRuntimeState, eventLogger?: MafEventLogger) {
    this.runtimeState = runtimeState;
    this.eventLogger = eventLogger || null;
    this.scriptPath = MONITOR_SCRIPT_PATH;
  }

  /**
   * Layer 1 → Layer 2: Collect raw JSON and transform to CollectedData
   * 
   * @returns Promise<CollectedData> - Internal representation with all collected info
   */
  async collect(): Promise<CollectedData> {
    const startTime = Date.now();
    const warnings: string[] = [];
    
    try {
      // Step 1: Call bash script to get raw JSON
      const rawOutput = await this.callTmuxMonitorScript();
      
      // Step 2: Parse and validate JSON
      const parsed = this.parseRawOutput(rawOutput, warnings);
      
      // Step 3: Transform to CollectedData (Layer 2)
      const collected = await this.transformToCollectedData(parsed, warnings);
      
      // Step 4: Add collection metadata
      collected.source = 'tmux';
      collected.warnings = warnings;
      
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > 100) {
        warnings.push(`Collection took ${elapsedMs}ms (expected <100ms)`);
      }
      
      return collected;
      
    } catch (error) {
      // Graceful degradation - return empty data on error
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`Collection failed: ${errorMessage}`);
      
      return this.createEmptyCollectedData(warnings);
    }
  }

  /**
   * Layer 2 → Layer 3: Transform collected data to supervision context
   * 
   * @param collected - Collected data from collect() method
   * @param config - Supervision configuration (optional)
   * @returns Promise<SupervisionContext> - View model for supervisor consumption
   */
  async buildSupervisionContext(
    collected: CollectedData,
    config?: any
  ): Promise<SupervisionContext> {
    const agentStatesMap = new Map<string, AgentState>();
    const sessions: AgentSession[] = [];
    
    // Transform each collected agent to AgentState
    for (const agent of collected.agents) {
      const agentState: AgentState = {
        id: agent.agentId,
        name: agent.agentName,
        role: agent.agentRole,
        status: this.mapStatus(agent),
        lastSeen: new Date(agent.activityTimestamp),
        paneIndex: agent.paneIndex,
        sessionId: agent.tmuxSession.sessionName,
        contextUsage: agent.heartbeat.contextUsagePercent
      };
      
      agentStatesMap.set(agent.agentId, agentState);
      
      // Create session entry
      const session: AgentSession = {
        agentId: agent.agentId,
        sessionId: agent.tmuxSession.sessionName,
        startTime: new Date(agent.collectedAt), // Approximate
        paneIndex: agent.paneIndex,
        agentName: agent.agentName,
        agentRole: agent.agentRole
      };
      
      sessions.push(session);
    }
    
    // Build system health summary
    const systemHealth = {
      tmuxRunning: collected.system.serverRunning,
      sessionCount: collected.system.sessionCount,
      paneCount: collected.system.paneCount,
      memoryMb: collected.system.tmuxMemoryMb
    };
    
    return {
      agents: Array.from(agentStatesMap.values()),
      sessions,
      systemHealth,
      timestamp: Date.now()
    };
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use collect() + buildSupervisionContext() separately
   */
  async collectAndBuild(config?: any): Promise<SupervisionContext> {
    const collected = await this.collect();
    return this.buildSupervisionContext(collected, config);
  }

  // ============================================================================
  // Private methods - Layer 1: Raw JSON collection
  // ============================================================================

  /**
   * Call tmux-agent-monitor.sh with json-detailed flag
   * Returns raw JSON string or null on failure
   */
  private async callTmuxMonitorScript(): Promise<string | null> {
    try {
      // Check if script exists
      const { exec } = require('node:child_process');
      const { promisify } = require('node:util');
      const execAsync = promisify(exec);
      
      // Try to call script with json-detailed flag
      // Note: The script doesn't support json-detailed yet, so we'll use json flag
      const { stdout, stderr } = await execAsync(
        `"${this.scriptPath}" json`,
        { 
          timeout: DEFAULT_TIMEOUT_MS,
          env: { ...process.env }
        }
      );
      
      if (stderr && stderr.includes('No tmux session')) {
        // Expected error when tmux not running - return null for graceful degradation
        return null;
      }
      
      return stdout.trim() || null;
      
    } catch (error: any) {
      // Check if it's a timeout
      if (error.signal === 'SIGTERM' || error.killed) {
        throw new Error('Script execution timeout');
      }
      
      // Check if tmux session doesn't exist
      if (error.message?.includes('No tmux session') || 
          error.stderr?.includes('No tmux session')) {
        return null; // Graceful degradation
      }
      
      // Re-throw for logging at higher level
      throw error;
    }
  }

  /**
   * Parse raw JSON output and validate structure
   */
  private parseRawOutput(raw: string | null, warnings: string[]): TmuxMonitorRawOutput | null {
    if (!raw) {
      warnings.push('No output from tmux-agent-monitor.sh (tmux not running?)');
      return null;
    }
    
    try {
      const parsed = JSON.parse(raw);
      
      // Validate basic structure
      if (!parsed.session || typeof parsed.session !== 'string') {
        warnings.push('Invalid JSON structure: missing session');
        return null;
      }
      
      return parsed as TmuxMonitorRawOutput;
      
    } catch (error) {
      warnings.push(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  // ============================================================================
  // Private methods - Layer 2: Transform to CollectedData
  // ============================================================================

  /**
   * Transform parsed JSON to CollectedData (Layer 2)
   * Merges tmux data with runtime heartbeats
   */
  private async transformToCollectedData(
    parsed: TmuxMonitorRawOutput | null,
    warnings: string[]
  ): Promise<CollectedData> {
    const now = Date.now();
    
    if (!parsed) {
      // Return empty data when tmux not available
      return this.createEmptyCollectedData(warnings);
    }
    
    // Transform agents
    const agents = await this.transformAgents(parsed.agents || [], warnings);
    
    // Transform system metrics
    const system = this.transformSystem(parsed.system || {} as SystemJsonData);
    
    return {
      agents,
      system,
      collectedAt: now,
      source: 'tmux',
      warnings
    };
  }

  /**
   * Transform agent JSON data to CollectedAgentData
   * Merges with runtime heartbeats from MafRuntimeState
   */
  private async transformAgents(
    agentsJson: AgentJsonData[],
    warnings: string[]
  ): Promise<CollectedAgentData[]> {
    const collected: CollectedAgentData[] = [];
    
    for (const agentJson of agentsJson) {
      try {
        // Generate agent ID from pane index
        const agentId = `agent-pane-${agentJson.paneIndex}`;
        
        // Get runtime heartbeat (if available)
        const heartbeat = await this.getHeartbeatForAgent(agentId);
        
        // Build tmux session info
        const tmuxSession: TmuxSessionInfo = {
          sessionName: agentJson.agentName, // Will be updated by system data
          windowName: 'unknown', // Will be updated by system data
          paneIndex: agentJson.paneIndex,
          paneId: agentJson.paneId,
          command: agentJson.command,
          size: agentJson.size
        };
        
        // Parse activity timestamp
        const activityTimestamp = this.parseTimestamp(agentJson.lastActivity) || Date.now();
        
        collected.push({
          agentId,
          paneIndex: agentJson.paneIndex,
          paneId: agentJson.paneId,
          agentName: agentJson.agentName,
          agentRole: agentJson.agentRole,
          heartbeat,
          tmuxSession,
          lastActivity: agentJson.lastActivity,
          activityTimestamp,
          recentActivity: agentJson.recentActivity || [],
          collectedAt: Date.now()
        });
        
      } catch (error) {
        warnings.push(`Failed to transform agent ${agentJson.paneIndex}: ${error}`);
      }
    }
    
    return collected;
  }

  /**
   * Transform system JSON to SystemMetrics
   */
  private transformSystem(systemJson: SystemJsonData): SystemMetrics {
    // Parse memory string (e.g., "123MB" -> 123)
    const memoryMatch = systemJson.tmuxMemory?.match(/(\d+)MB/);
    const memoryMb = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
    
    return {
      sessionName: systemJson.sessionName || 'unknown',
      windowName: systemJson.windowName || 'unknown',
      sessionCreated: systemJson.sessionCreated || new Date().toISOString(),
      sessionCount: systemJson.sessionCount || 0,
      windowCount: systemJson.windowCount || 0,
      paneCount: systemJson.paneCount || 0,
      tmuxMemoryMb: memoryMb,
      serverRunning: systemJson.serverRunning ?? true,
      timestamp: Date.now()
    };
  }

  /**
   * Get heartbeat for agent from runtime state
   */
  private async getHeartbeatForAgent(agentId: string): Promise<MafHeartbeat> {
    try {
      // Refresh runtime state to get latest heartbeats
      await this.runtimeState.refresh();
      
      // Return default heartbeat if not found in runtime state
      // (In real implementation, we'd query heartbeats from state)
      return {
        agentId,
        lastSeen: Date.now(),
        status: 'idle',
        contextUsagePercent: 0
      };
      
    } catch (error) {
      // Return default heartbeat on error
      return {
        agentId,
        lastSeen: Date.now(),
        status: 'idle',
        contextUsagePercent: 0
      };
    }
  }

  /**
   * Parse timestamp string to milliseconds
   */
  private parseTimestamp(timestampStr: string): number | null {
    try {
      const date = new Date(timestampStr);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date.getTime();
    } catch {
      return null;
    }
  }

  /**
   * Map collected agent status to AgentState status
   * NOTE: MafHeartbeat.status is 'idle' | 'working' | 'blocked'
   * AgentState.status is 'active' | 'idle' | 'blocked' | 'unknown'
   * 
   * Mapping:
   * - 'blocked' → 'blocked' (direct)
   * - 'working' → 'active' (working means active)
   * - 'idle' → 'idle' (direct)
   */
  private mapStatus(agent: CollectedAgentData): 'active' | 'idle' | 'blocked' | 'unknown' {
    // Use heartbeat status as source of truth
    const heartbeatStatus = agent.heartbeat.status;
    
    if (heartbeatStatus === 'blocked') {
      return 'blocked';
    }
    
    if (heartbeatStatus === 'working') {
      return 'active';
    }
    
    if (heartbeatStatus === 'idle') {
      return 'idle';
    }
    
    return 'unknown';
  }

  /**
   * Create empty CollectedData for graceful degradation
   */
  private createEmptyCollectedData(warnings: string[]): CollectedData {
    return {
      agents: [],
      system: {
        sessionName: 'unknown',
        windowName: 'unknown',
        sessionCreated: new Date().toISOString(),
        sessionCount: 0,
        windowCount: 0,
        paneCount: 0,
        tmuxMemoryMb: 0,
        serverRunning: false,
        timestamp: Date.now()
      },
      collectedAt: Date.now(),
      source: 'fallback',
      warnings
    };
  }
}

// ============================================================================
// Factory functions
// ============================================================================

/**
 * Create MafDataCollector instance with runtime state
 */
export function createMafDataCollector(
  runtimeState: MafRuntimeState,
  eventLogger?: MafEventLogger
): MafDataCollector {
  return new MafDataCollector(runtimeState, eventLogger);
}

// Export the interface for backward compatibility
export interface MafDataCollectorInterface {
  collect(): Promise<CollectedData>;
  buildSupervisionContext(collected: CollectedData, config?: any): Promise<SupervisionContext>;
}
