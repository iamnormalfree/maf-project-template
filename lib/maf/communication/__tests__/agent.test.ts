import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgentCommunicationManager, createAgentCommunicationManager } from '../agent';
import fs from 'fs/promises';
import path from 'path';

describe('Agent Communication Manager', () => {
  const TEST_AGENT_MAIL_ROOT = path.join(__dirname, '../../../.agent-mail-test-communication');
  let manager: AgentCommunicationManager;

  beforeEach(async () => {
    // Clean up any existing test directories
    try {
      await fs.rm(TEST_AGENT_MAIL_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }

    manager = createAgentCommunicationManager(TEST_AGENT_MAIL_ROOT);
    // Give some time for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(TEST_AGENT_MAIL_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  describe('Channel Management', () => {
    it('should initialize with default channels', () => {
      const activeChannels = manager.getActiveChannels();
      
      expect(activeChannels).toHaveLength(3);
      expect(activeChannels.map(c => c.id)).toEqual(
        expect.arrayContaining(['agent-mail', 'minimax-debug-1', 'codex-senior'])
      );
    });

    it('should have active channels', () => {
      const activeChannels = manager.getActiveChannels();
      
      activeChannels.forEach(channel => {
        expect(channel.active).toBe(true);
        expect(channel.name).toBeDefined();
        expect(['agent-mail', 'minimax-debug-1', 'codex-senior']).toContain(channel.type);
      });
    });
  });

  describe('Message Sending', () => {
    it('should send message to agent-mail channel', async () => {
      const messageId = await manager.sendMessage({
        from: 'test-agent-1',
        to: 'agent-mail',
        channel: 'agent-mail',
        type: 'TEST_MESSAGE',
        payload: { content: 'test message' }
      });

      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^msg_[0-9]+_[a-z0-9]+$/);
    });

    it('should send escalation to minimax-debug-1 channel', async () => {
      const escalation = {
        type: 'ESCALATION_REQUEST' as const,
        agentId: 'test-agent',
        executionId: 'exec-123',
        escalationId: 'esc-123',
        pathId: 'path-123',
        level: 1,
        context: { errorContext: 'test error' },
        reason: 'test escalation'
      };

      const messageId = await manager.sendEscalation(escalation, 'minimax-debug-1');

      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^msg_[0-9]+_[a-z0-9]+$/);
    });

    it('should throw error for invalid channel', async () => {
      await expect(manager.sendMessage({
        from: 'test-agent',
        to: 'invalid-channel',
        channel: 'invalid-channel',
        type: 'TEST_MESSAGE',
        payload: {}
      })).rejects.toThrow('Channel invalid-channel is not available');
    });
  });

  describe('Message Persistence', () => {
    it('should persist messages to file system', async () => {
      const messageId = await manager.sendMessage({
        from: 'test-agent',
        to: 'agent-mail',
        channel: 'agent-mail',
        type: 'TEST_MESSAGE',
        payload: { content: 'test message' }
      });

      // Check if message file was created
      const messageFile = path.join(TEST_AGENT_MAIL_ROOT, 'channels', 'agent-mail', `${messageId}.json`);
      await expect(fs.access(messageFile)).resolves.not.toThrow();

      // Check message content
      const content = await fs.readFile(messageFile, 'utf8');
      const message = JSON.parse(content);
      
      expect(message.id).toBe(messageId);
      expect(message.from).toBe('test-agent');
      expect(message.to).toBe('agent-mail');
      expect(message.type).toBe('TEST_MESSAGE');
      expect(message.read).toBe(false);
    });
  });

  describe('Message Fetching', () => {
    it('should fetch messages from channel', async () => {
      // Send a test message
      await manager.sendMessage({
        from: 'test-agent',
        to: 'agent-mail',
        channel: 'agent-mail',
        type: 'TEST_MESSAGE',
        payload: { content: 'test message' }
      });

      // Fetch messages
      const messages = await manager.fetchMessages('agent-mail');

      expect(messages).toHaveLength(1);
      expect(messages[0].payload.content).toBe('test message');
    });
  });
});
