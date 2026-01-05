// ABOUTME: Agent communication system for message routing between escalation targets.

import type { MafEscalationRequest } from '../core/protocols';
import fs from 'fs/promises';
import path from 'path';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  channel: string;
  type: string;
  payload: any;
  timestamp: number;
  read: boolean;
}

export interface AgentChannel {
  id: string;
  name: string;
  type: 'agent-mail' | 'minimax-debug-1' | 'codex-senior';
  active: boolean;
  lastActivity: number;
}

/**
 * Agent Communication Manager
 */
export class AgentCommunicationManager {
  private config: { agentMailRoot: string };
  private channels: Map<string, AgentChannel> = new Map();
  
  constructor(agentMailRoot: string = '.agent-mail') {
    this.config = { agentMailRoot };
    this.initializeChannels();
  }

  /**
   * Initialize default communication channels
   */
  private async initializeChannels(): Promise<void> {
    const now = Date.now();
    const defaultChannels: AgentChannel[] = [
      {
        id: 'agent-mail',
        name: 'Agent Mail System',
        type: 'agent-mail',
        active: true,
        lastActivity: now
      },
      {
        id: 'minimax-debug-1',
        name: 'MiniMax Debug Channel',
        type: 'minimax-debug-1',
        active: true,
        lastActivity: now
      },
      {
        id: 'codex-senior',
        name: 'Codex Senior Channel',
        type: 'codex-senior',
        active: true,
        lastActivity: now
      }
    ];

    for (const channel of defaultChannels) {
      this.channels.set(channel.id, channel);
      
      // Ensure channel directory exists
      const channelDir = path.join(this.config.agentMailRoot, 'channels', channel.id);
      await fs.mkdir(channelDir, { recursive: true });
    }
  }

  /**
   * Get all active channels
   */
  getActiveChannels(): AgentChannel[] {
    return Array.from(this.channels.values()).filter(channel => channel.active);
  }

  /**
   * Send escalation request to target channel
   */
  async sendEscalation(escalation: MafEscalationRequest, targetChannel: string): Promise<string> {
    const message = {
      from: escalation.agentId,
      to: targetChannel,
      channel: targetChannel,
      type: 'ESCALATION_REQUEST',
      payload: escalation
    };

    return this.sendMessage(message);
  }

  /**
   * Send message to a specific channel
   */
  async sendMessage(messageData: Omit<AgentMessage, 'id' | 'timestamp' | 'read'>): Promise<string> {
    const now = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const message: AgentMessage = {
      ...messageData,
      id: `msg_${now}_${random}`,
      timestamp: now,
      read: false
    };

    const channel = this.channels.get(messageData.channel);
    if (!channel || !channel.active) {
      throw new Error(`Channel ${messageData.channel} is not available`);
    }

    // Update channel activity
    channel.lastActivity = now;

    try {
      await this.persistMessage(message);
      return message.id;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch messages for a specific channel
   */
  async fetchMessages(channelId: string): Promise<AgentMessage[]> {
    const channelDir = path.join(this.config.agentMailRoot, 'channels', channelId);
    
    try {
      const files = await fs.readdir(channelDir);
      const messageFiles = files.filter(file => file.endsWith('.json'));
      
      const messages: AgentMessage[] = [];
      
      for (const file of messageFiles) {
        try {
          const filePath = path.join(channelDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const message: AgentMessage = JSON.parse(content);
          messages.push(message);
        } catch (error) {
          // Skip invalid message files
          console.warn(`Invalid message file: ${file}`);
        }
      }
      
      // Sort by timestamp (newest first)
      return messages.sort((a, b) => b.timestamp - a.timestamp);
      
    } catch (error) {
      // Channel directory doesn't exist or is not accessible
      return [];
    }
  }

  /**
   * Persist message to file system
   */
  private async persistMessage(message: AgentMessage): Promise<void> {
    const channelDir = path.join(this.config.agentMailRoot, 'channels', message.channel);
    const messageFile = path.join(channelDir, `${message.id}.json`);
    
    await fs.writeFile(messageFile, JSON.stringify(message, null, 2));
  }
}

/**
 * Create agent communication manager with default configuration
 */
export function createAgentCommunicationManager(agentMailRoot: string = '.agent-mail'): AgentCommunicationManager {
  return new AgentCommunicationManager(agentMailRoot);
}
