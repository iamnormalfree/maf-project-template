// ABOUTME: Simple integration test for MAF preflight coordinator
// ABOUTME: Tests core functionality without complex mocking

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { MafPreflightCoordinator } from '../preflight-coordinator';

describe('MafPreflightCoordinator Integration', () => {
  const testDir = '/tmp/maf-preflight-simple-test';
  const configDir = join(testDir, '.maf', 'config');
  
  beforeEach(() => {
    // Clean up and set up test directory
    if (existsSync(testDir)) {
      execSync(`rm -rf ${testDir}`, { stdio: 'ignore' });
    }
    execSync(`mkdir -p ${configDir}`, { stdio: 'ignore' });
    
    // Set up environment variables for testing
    process.env.MAF_AGENT_MAIL_ROOT = testDir;
    process.env.MAF_RUNTIME = 'file';
    process.env.MAF_AGENT_ID = 'test-agent';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      execSync(`rm -rf ${testDir}`, { stdio: 'ignore' });
    }
    
    // Reset environment variables
    delete process.env.MAF_AGENT_MAIL_ROOT;
    delete process.env.MAF_RUNTIME;
    delete process.env.MAF_AGENT_ID;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should create coordinator with default options', () => {
    const coordinator = new MafPreflightCoordinator();
    expect(coordinator).toBeInstanceOf(MafPreflightCoordinator);
  });

  it('should validate environment variables', async () => {
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validateEnvironment();
    
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('required');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should validate Python installation', async () => {
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validatePython();
    
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('pipAvailable');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should validate MCP configurations', async () => {
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validateMcpConfigs();
    
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('configurations');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should detect missing MCP configuration files', async () => {
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validateMcpConfigs();
    
    expect(result.valid).toBe(false);
    expect(result.configurations).toHaveLength(3);
    expect(result.configurations.every((config: any) => !config.valid)).toBe(true);
  });

  it('should detect missing required environment variables', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MAF_AGENT_ID;
    
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.validateEnvironment();
    
    expect(result.valid).toBe(false);
    expect(result.errors.some((error: string) => 
      error.includes('OPENAI_API_KEY')
    )).toBe(true);
  });

  it('should run complete preflight check', async () => {
    const coordinator = new MafPreflightCoordinator({ 
      agentId: 'test-integration-agent'
    });
    
    const result = await coordinator.runPreflightCheck({ 
      evidenceCollection: false 
    });
    
    expect(result).toHaveProperty('executionId');
    expect(result).toHaveProperty('agentId');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('validations');
    expect(['passed', 'failed', 'skipped', 'timeout']).toContain(result.status);
    expect(result.result).toHaveProperty('summary');
    expect(result.result).toHaveProperty('recommendations');
  });

  it('should generate recommendations when validation fails', async () => {
    const coordinator = new MafPreflightCoordinator();
    const result = await coordinator.runPreflightCheck({ 
      evidenceCollection: false 
    });
    
    expect(Array.isArray(result.result.recommendations)).toBe(true);
    expect(typeof result.result.summary).toBe('string');
  });

  it('should have CLI functionality available', async () => {
    const { runPreflightCli } = await import('../preflight-coordinator');
    expect(typeof runPreflightCli).toBe('function');
  });
});
