// ABOUTME: Test data builders for various supervisor scenarios
// ABOUTME: Provides reusable builders for agent sessions, registry data, and supervision contexts

import type { 
  AgentState, 
  AgentSupervisionState,
  AgentSession,
  AgentRegistryEntry,
  MafHeartbeat
} from "../../../../lib/maf/supervision/types";
import type { SupervisorCliConfig } from "../../supervisor";

/**
 * Builder for AgentState objects
 */
export class AgentStateBuilder {
  private state: Partial<AgentState> = {};

  constructor(agentId: string = "test-agent") {
    this.state.agentId = agentId;
    this.state.status = "healthy" as any;
    this.state.contextUsagePercent = 50;
    this.state.taskState = "idle" as any;
    this.state.lastSeen = Date.now();
    this.state.agentType = "claude-worker";
    this.state.resourceUsage = {
      contextTokens: 64000,
      contextCapacity: 128000,
      cpuPercent: 50,
      memoryMb: 256
    };
    this.state.metrics = {
      tasksCompleted: 10,
      tasksFailed: 1,
      avgTaskDuration: 30000,
      successRate: 91,
      escalationsInitiated: 0,
      interventionsReceived: 0,
      currentStreak: 5,
      performanceTrend: "stable" as any
    };
  }

  withStatus(status: "healthy" | "degraded" | "unhealthy" | "critical" | "unknown"): this {
    this.state.status = status as any;
    return this;
  }

  withContextUsage(percentage: number): this {
    this.state.contextUsagePercent = percentage;
    this.state.resourceUsage!.contextTokens = Math.round(percentage * 128000 / 100);
    return this;
  }

  withTaskState(taskState: "idle" | "thinking" | "working" | "blocked" | "waiting" | "error" | "recovering"): this {
    this.state.taskState = taskState as any;
    return this;
  }

  withCurrentTask(taskId: string): this {
    this.state.currentTaskId = taskId;
    return this;
  }

  withAgentType(agentType: string): this {
    this.state.agentType = agentType;
    return this;
  }

  build(): AgentState {
    if (!this.state.agentId) throw new Error("Agent ID is required");
    if (!this.state.status) throw new Error("Status is required");
    if (!this.state.taskState) throw new Error("Task state is required");
    if (!this.state.lastSeen) throw new Error("Last seen is required");
    if (!this.state.agentType) throw new Error("Agent type is required");
    if (!this.state.resourceUsage) throw new Error("Resource usage is required");
    if (!this.state.metrics) throw new Error("Metrics is required");

    return this.state as AgentState;
  }
}

/**
 * Builder for AgentSession objects
 */
export class AgentSessionBuilder {
  private session: Partial<AgentSession> = {};

  constructor(agentId: string = "test-agent") {
    this.session.agentId = agentId;
    this.session.tmuxSession = `maf-agent-${agentId}`;
    this.session.agentType = "claude-worker";
    this.session.discoveryMethod = "correlated";
    this.session.lastSeen = Date.now();
    this.session.contextUsagePercent = 50;
    this.session.taskState = "idle";
    this.session.sessionStatus = "running";
  }

  withDiscoveryMethod(method: "registry" | "tmux" | "correlated"): this {
    this.session.discoveryMethod = method;
    return this;
  }

  withSessionStatus(status: "running" | "stopped" | "unknown"): this {
    this.session.sessionStatus = status;
    return this;
  }

  build(): AgentSession {
    if (!this.session.agentId) throw new Error("Agent ID is required");
    if (!this.session.tmuxSession) throw new Error("tmux session is required");
    if (!this.session.agentType) throw new Error("Agent type is required");
    if (!this.session.discoveryMethod) throw new Error("Discovery method is required");
    if (!this.session.lastSeen) throw new Error("Last seen is required");
    if (!this.session.sessionStatus) throw new Error("Session status is required");

    return this.session as AgentSession;
  }
}

/**
 * Utility functions for creating test data
 */
export function createAgentRegistry(agents: AgentRegistryEntry[]): string {
  return JSON.stringify({ agents }, null, 2);
}

export function createMafHeartbeat(agentId: string, contextUsage: number, status: string = "idle"): MafHeartbeat {
  return {
    agentId,
    lastSeen: Date.now(),
    status: status as any,
    contextUsagePercent: contextUsage
  };
}
