// ABOUTME: Basic tests for MAF security module
// ABOUTME: Tests fundamental security functionality

import { SecureWorkspace, createSecureWorkspace } from '../index';
import { promises as fs } from 'fs';

describe('Basic Security Module', () => {
  let workspace: SecureWorkspace;

  beforeEach(async () => {
    workspace = createSecureWorkspace('test-123');
    await workspace.initialize();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  test('should create secure workspace', () => {
    const path = workspace.getWorkspacePath();
    expect(path).toContain('maf-test-123');
  });

  test('should allow legitimate file operations', async () => {
    await workspace.writeFile('test.txt', 'Hello World');
    const content = await workspace.readFile('test.txt');
    expect(content.toString()).toBe('Hello World');
  });

  test('should block path traversal attempts', async () => {
    await expect(
      workspace.writeFile('../../../etc/passwd', 'evil')
    ).rejects.toThrow('Path validation failed');

    await expect(
      workspace.readFile('../../../etc/passwd')
    ).rejects.toThrow('Path validation failed');
  });

  test('should track security metrics', async () => {
    await workspace.writeFile('test.txt', 'content');
    await workspace.readFile('test.txt');
    
    try {
      await workspace.writeFile('../../../etc/passwd', 'evil');
    } catch (e) {
      // Expected to fail
    }
    
    const metrics = workspace.getSecurityMetrics();
    expect(metrics.totalOperations).toBeGreaterThan(2);
    expect(metrics.blockedOperations).toBe(1);
  });
});
