// ABOUTME: Mock factory for tmux operations and session simulation
// ABOUTME: Provides realistic tmux session discovery and management mocking

import { jest } from '@jest/globals';

export interface MockTmuxSession {
  sessionName: string;
  agentId: string;
  windows: number;
  created: string;
  status: 'running' | 'stopped' | 'unknown';
  lastActivity?: string;
  agentType?: string;
}

export interface MockTmuxState {
  sessions: Record<string, MockTmuxSession>;
  serverRunning: boolean;
  lastCommand?: string;
  commandHistory: string[];
}

export class TmuxMockFactory {
  private state: MockTmuxState = {
    sessions: {},
    serverRunning: true,
    commandHistory: []
  };

  /**
   * Create mock tmux session discovery function
   */
  createMockDiscovery() {
    return jest.fn().mockImplementation((command: string) => {
      this.state.commandHistory.push(command);
      this.state.lastCommand = command;

      if (!this.state.serverRunning) {
        throw new Error('tmux: no server running');
      }

      if (command.includes('list_agent_sessions')) {
        return Promise.resolve({
          stdout: this.formatSessionOutput(),
          stderr: ''
        });
      }

      // Default response for other commands
      return Promise.resolve({ stdout: '', stderr: '' });
    });
  }

  /**
   * Create mock spawnSync for tmux operations
   */
  createMockSpawnSync() {
    return jest.fn().mockImplementation((command: string, args?: string[]) => {
      this.state.commandHistory.push(command + ' ' + (args || []).join(' '));

      return {
        status: 0,
        stdout: '',
        stderr: ''
      } as any;
    });
  }

  /**
   * Add a mock tmux session
   */
  addSession(session: MockTmuxSession): void {
    this.state.sessions[session.sessionName] = {
      ...session,
      lastActivity: new Date().toISOString()
    };
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.state.sessions = {};
  }

  /**
   * Set server running state
   */
  setServerRunning(running: boolean): void {
    this.state.serverRunning = running;
  }

  /**
   * Get current sessions
   */
  getSessions(): Record<string, MockTmuxSession> {
    return { ...this.state.sessions };
  }

  /**
   * Format session output for tmux list command
   */
  private formatSessionOutput(): string {
    const lines: string[] = [];
    
    for (const [sessionName, session] of Object.entries(this.state.sessions)) {
      lines.push(sessionName);
      lines.push(`  Agent ID: ${session.agentId}`);
      lines.push(`  Windows: ${session.windows}`);
      lines.push(`  Created: ${session.created}`);
      if (session.lastActivity) {
        lines.push(`  Last Activity: ${session.lastActivity}`);
      }
      if (session.agentType) {
        lines.push(`  Agent Type: ${session.agentType}`);
      }
      lines.push(''); // Empty line between sessions
    }
    
    return lines.join('\n');
  }

  /**
   * Create realistic test scenarios
   */
  static createTestScenarios() {
    return {
      healthySystem: () => {
        const factory = new TmuxMockFactory();
        factory.addSession({
          sessionName: 'maf-agent-worker-001',
          agentId: 'worker-001',
          windows: 4,
          created: '2025-01-15T10:00:00Z',
          status: 'running',
          agentType: 'claude-worker'
        });
        factory.addSession({
          sessionName: 'maf-agent-reviewer-002',
          agentId: 'reviewer-002',
          windows: 2,
          created: '2025-01-15T10:05:00Z',
          status: 'running',
          agentType: 'codex-reviewer'
        });
        return factory;
      },

      emptySystem: () => {
        return new TmuxMockFactory();
      }
    };
  }
}

/**
 * Utility function to create tmux mock for tests
 */
export function createTmuxMock(): TmuxMockFactory {
  return new TmuxMockFactory();
}

/**
 * Pre-configured mock scenarios
 */
export const TMUX_SCENARIOS = TmuxMockFactory.createTestScenarios();
