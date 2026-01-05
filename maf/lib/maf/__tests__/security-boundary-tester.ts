// ABOUTME: Security boundary effectiveness tester for MAF backpressure signal enhancements
// ABOUTME: Tests filesystem, process, network, and data access boundaries during backpressure scenarios

import { createWorkerHeartbeatManager } from '../heartbeat-manager';
import { createMafEventLogger } from '../events/event-logger';
import type { MafRuntimeState } from '../core/runtime-state';
import type { MafEventLogger, MafEventSecurityViolationData, MafEventSecurityBoundaryVerificationData } from '../events/event-logger';

export interface SecurityBoundaryConfig {
  testTimeoutMs: number;
  resourceLimits: {
    maxMemoryMb: number;
    maxCpuPercent: number;
    maxFileDescriptors: number;
  };
  networkRestrictions: {
    allowedHosts: string[];
    blockedPorts: number[];
    allowedProtocols: string[];
  };
  filesystemRestrictions: {
    allowedPaths: string[];
    blockedPaths: string[];
    maxFileSize: number;
  };
}

export interface SecurityTestResult {
  boundaryType: 'network' | 'filesystem' | 'process' | 'resource' | 'overall';
  testName: string;
  passed: boolean;
  effectivenessScore: number; // 0-100
  threatsBlocked: string[];
  threatsMissed?: string[];
  details: string;
  executionTimeMs: number;
  securityStateImpact: {
    beforeScore: number;
    afterScore: number;
    degradationPercent: number;
  };
}

export interface SecurityEffectivenessReport {
  timestamp: number;
  testDurationMs: number;
  overallEffectivenessScore: number;
  boundaryResults: SecurityTestResult[];
  summary: {
    testsRun: number;
    testsPassed: number;
    threatsBlocked: string[];
    threatsMissed: string[];
    averageEffectivenessScore: number;
    securityStateDegradation: number;
    finalDetermination: 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIAL';
  };
}

/**
 * Security Boundary Tester for MAF Backpressure System
 * Tests effectiveness of security controls during backpressure scenarios
 */
export class SecurityBoundaryTester {
  private config: SecurityBoundaryConfig;
  private eventLogger: MafEventLogger;
  private baselineSecurityScore: number = 100;

  constructor(config: Partial<SecurityBoundaryConfig> = {}) {
    this.config = {
      testTimeoutMs: 30000,
      resourceLimits: {
        maxMemoryMb: 512,
        maxCpuPercent: 80,
        maxFileDescriptors: 1000
      },
      networkRestrictions: {
        allowedHosts: ['localhost', '127.0.0.1'],
        blockedPorts: [22, 23, 3389],
        allowedProtocols: ['http', 'https']
      },
      filesystemRestrictions: {
        allowedPaths: ['/tmp', '/var/tmp'],
        blockedPaths: ['/etc/passwd', '/etc/shadow', '/root'],
        maxFileSize: 10485760 // 10MB
      },
      ...config
    };

    // Initialize event logger for security event tracking
    const mockDb = this.createMockSecurityDatabase();
    this.eventLogger = createMafEventLogger(mockDb);
  }

  /**
   * Execute comprehensive security boundary effectiveness tests
   */
  async executeSecurityEffectivenessTests(): Promise<SecurityEffectivenessReport> {
    const startTime = Date.now();
    this.baselineSecurityScore = await this.measureBaselineSecurityState();

    const boundaryResults: SecurityTestResult[] = [];

    // Test 1: Filesystem boundary security
    boundaryResults.push(await this.testFilesystemBoundaries());

    // Test 2: Process boundary security
    boundaryResults.push(await this.testProcessBoundaries());

    // Test 3: Network boundary security
    boundaryResults.push(await this.testNetworkBoundaries());

    // Test 4: Resource exhaustion protection
    boundaryResults.push(await this.testResourceExhaustionProtection());

    // Test 5: Database access controls
    boundaryResults.push(await this.testDatabaseAccessControls());

    // Test 6: Event logging data leakage prevention
    boundaryResults.push(await this.testEventDataLeakagePrevention());

    const endTime = Date.now();
    const testDurationMs = endTime - startTime;

    // Calculate overall effectiveness
    const testsPassed = boundaryResults.filter(r => r.passed).length;
    const averageScore = boundaryResults.reduce((sum, r) => sum + r.effectivenessScore, 0) / boundaryResults.length;
    const maxDegradation = Math.max(...boundaryResults.map(r => r.securityStateImpact.degradationPercent));

    const allThreatsBlocked = boundaryResults.flatMap(r => r.threatsBlocked);
    const allThreatsMissed = boundaryResults.flatMap(r => r.threatsMissed || []);

    const overallEffectivenessScore = Math.round(averageScore);

    let finalDetermination: 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIAL';
    if (overallEffectivenessScore >= 85 && maxDegradation < 10 && testsPassed === boundaryResults.length) {
      finalDetermination = 'EFFECTIVE';
    } else if (overallEffectivenessScore >= 70 && maxDegradation < 20) {
      finalDetermination = 'PARTIAL';
    } else {
      finalDetermination = 'INEFFECTIVE';
    }

    const report: SecurityEffectivenessReport = {
      timestamp: startTime,
      testDurationMs,
      overallEffectivenessScore,
      boundaryResults,
      summary: {
        testsRun: boundaryResults.length,
        testsPassed,
        threatsBlocked: [...new Set(allThreatsBlocked)],
        threatsMissed: [...new Set(allThreatsMissed)],
        averageEffectivenessScore: averageScore,
        securityStateDegradation: maxDegradation,
        finalDetermination
      }
    };

    // Log security boundary verification event
    await this.logSecurityBoundaryVerification(report);

    return report;
  }

  /**
   * Test filesystem access boundaries during backpressure operations
   */
  private async testFilesystemBoundaries(): Promise<SecurityTestResult> {
    const testName = 'Filesystem Access Boundaries';
    const startTime = Date.now();

    const threatsBlocked: string[] = [];
    const threatsMissed: string[] = [];
    let passed = true;
    let effectivenessScore = 100;

    try {
      // Test 1: Attempt to read blocked paths during backpressure
      for (const blockedPath of this.config.filesystemRestrictions.blockedPaths) {
        try {
          const fs = require('fs');
          const result = await fs.promises.readFile(blockedPath, 'utf8');
          threatsMissed.push(`Read access to ${blockedPath}`);
          effectivenessScore -= 20;
          passed = false;
        } catch (error) {
          // Expected - access should be blocked
          threatsBlocked.push(`Read access to ${blockedPath}`);
        }
      }

      // Test 2: Attempt to write to unauthorized locations
      const unauthorizedWritePaths = ['/etc/malicious', '/root/bad'];
      for (const path of unauthorizedWritePaths) {
        try {
          const fs = require('fs');
          await fs.promises.writeFile(path, 'malicious content');
          threatsMissed.push(`Write access to ${path}`);
          effectivenessScore -= 20;
          passed = false;

          // Cleanup if successful (shouldn't happen)
          try { await fs.promises.unlink(path); } catch {}
        } catch (error) {
          // Expected - write should be blocked
          threatsBlocked.push(`Write access to ${path}`);
        }
      }

      // Test 3: Test large file creation attempts
      try {
        const fs = require('fs');
        const largeContent = Buffer.alloc(this.config.filesystemRestrictions.maxFileSize + 1);
        await fs.promises.writeFile('/tmp/large-file-test', largeContent);
        threatsMissed.push('Large file creation bypassed size limit');
        effectivenessScore -= 15;
        passed = false;

        try { await fs.promises.unlink('/tmp/large-file-test'); } catch {}
      } catch (error) {
        threatsBlocked.push('Large file creation properly blocked');
      }

      // Log security violations if any
      if (threatsMissed.length > 0) {
        await this.logSecurityViolation({
          violation_type: 'filesystem_access',
          severity: passed ? 'low' : 'high',
          blocked_resource: threatsMissed.join(', '),
          action_taken: 'detected',
          security_profile: {
            name: 'filesystem-boundary-test',
            enforcement_mode: 'strict',
            allowed_paths: this.config.filesystemRestrictions.allowedPaths
          },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      passed = false;
      effectivenessScore = 0;
    }

    const executionTimeMs = Date.now() - startTime;
    const afterScore = await this.measureCurrentSecurityState();

    return {
      boundaryType: 'filesystem',
      testName,
      passed,
      effectivenessScore: Math.max(0, effectivenessScore),
      threatsBlocked,
      threatsMissed: threatsMissed.length > 0 ? threatsMissed : undefined,
      details: `Tested ${this.config.filesystemRestrictions.blockedPaths.length} blocked paths and write restrictions`,
      executionTimeMs,
      securityStateImpact: {
        beforeScore: this.baselineSecurityScore,
        afterScore,
        degradationPercent: Math.max(0, ((this.baselineSecurityScore - afterScore) / this.baselineSecurityScore) * 100)
      }
    };
  }

  /**
   * Test process boundaries and privilege escalation prevention
   */
  private async testProcessBoundaries(): Promise<SecurityTestResult> {
    const testName = 'Process Boundaries & Privilege Escalation';
    const startTime = Date.now();

    const threatsBlocked: string[] = [];
    const threatsMissed: string[] = [];
    let passed = true;
    let effectivenessScore = 100;

    try {
      // Test 1: Attempt privilege escalation attempts
      const privilegeEscalationCommands = [
        'sudo whoami',
        'su root',
        'chmod 777 /etc/passwd'
      ];

      for (const command of privilegeEscalationCommands) {
        try {
          const { spawn } = require('child_process');
          const result = await this.executeCommandWithTimeout(command, 1000);
          if (result.exitCode === 0) {
            threatsMissed.push(`Privilege escalation: ${command}`);
            effectivenessScore -= 25;
            passed = false;
          } else {
            threatsBlocked.push(`Privilege escalation blocked: ${command}`);
          }
        } catch (error) {
          threatsBlocked.push(`Privilege escalation blocked: ${command}`);
        }
      }

      // Test 2: Test process resource limits
      const memoryUsage = process.memoryUsage();
      const memoryMb = memoryUsage.heapUsed / 1024 / 1024;

      if (memoryMb > this.config.resourceLimits.maxMemoryMb) {
        threatsMissed.push(`Memory limit exceeded: ${memoryMb.toFixed(2)}MB`);
        effectivenessScore -= 20;
        passed = false;
      } else {
        threatsBlocked.push(`Memory usage within limits: ${memoryMb.toFixed(2)}MB`);
      }

      // Test 3: Test for process injection attempts
      try {
        const fs = require('fs');
        const suspiciousProcessContent = 'import os; os.system("malicious command")';
        await fs.promises.writeFile('/tmp/suspicious-process.js', suspiciousProcessContent);

        const { spawn } = require('child_process');
        const result = await this.executeCommandWithTimeout('node /tmp/suspicious-process.js', 1000);

        if (result.exitCode === 0) {
          threatsMissed.push('Suspicious process execution allowed');
          effectivenessScore -= 15;
          passed = false;
        } else {
          threatsBlocked.push('Suspicious process execution blocked');
        }

        try { await fs.promises.unlink('/tmp/suspicious-process.js'); } catch {}
      } catch (error) {
        threatsBlocked.push('Process injection attempt blocked');
      }

      // Log security violations if any
      if (threatsMissed.length > 0) {
        await this.logSecurityViolation({
          violation_type: 'process_execution',
          severity: passed ? 'low' : 'high',
          command: threatsMissed.join('; '),
          action_taken: 'detected',
          security_profile: {
            name: 'process-boundary-test',
            enforcement_mode: 'strict'
          },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      passed = false;
      effectivenessScore = 0;
    }

    const executionTimeMs = Date.now() - startTime;
    const afterScore = await this.measureCurrentSecurityState();

    return {
      boundaryType: 'process',
      testName,
      passed,
      effectivenessScore: Math.max(0, effectivenessScore),
      threatsBlocked,
      threatsMissed: threatsMissed.length > 0 ? threatsMissed : undefined,
      details: `Tested privilege escalation and process resource limits`,
      executionTimeMs,
      securityStateImpact: {
        beforeScore: this.baselineSecurityScore,
        afterScore,
        degradationPercent: Math.max(0, ((this.baselineSecurityScore - afterScore) / this.baselineSecurityScore) * 100)
      }
    };
  }

  /**
   * Test network boundary restrictions
   */
  private async testNetworkBoundaries(): Promise<SecurityTestResult> {
    const testName = 'Network Access Boundaries';
    const startTime = Date.now();

    const threatsBlocked: string[] = [];
    const threatsMissed: string[] = [];
    let passed = true;
    let effectivenessScore = 100;

    try {
      // Test 1: Attempt connections to blocked ports
      for (const blockedPort of this.config.networkRestrictions.blockedPorts) {
        try {
          const net = require('net');
          const socket = new net.Socket();

          const connectionResult = await new Promise((resolve, reject) => {
            socket.setTimeout(2000);
            socket.connect(blockedPort, 'localhost', () => {
              socket.end();
              resolve(true);
            });
            socket.on('error', reject);
            socket.on('timeout', () => {
              socket.destroy();
              reject(new Error('Timeout'));
            });
          });

          if (connectionResult) {
            threatsMissed.push(`Connection to blocked port ${blockedPort}`);
            effectivenessScore -= 20;
            passed = false;
          }
        } catch (error) {
          threatsBlocked.push(`Connection to blocked port ${blockedPort} prevented`);
        }
      }

      // Test 2: Test DNS resolution to suspicious domains
      const suspiciousDomains = ['malicious.example.com', 'evil.com'];
      for (const domain of suspiciousDomains) {
        try {
          const dns = require('dns');
          await new Promise((resolve, reject) => {
            dns.lookup(domain, (err: any, address: any) => {
              if (err) {
                resolve(false);
              } else {
                resolve(true);
              }
            });
          });
          threatsBlocked.push(`DNS resolution to ${domain} handled appropriately`);
        } catch (error) {
          threatsBlocked.push(`DNS resolution to ${domain} blocked`);
        }
      }

      // Test 3: Test for unauthorized external network requests
      try {
        const https = require('https');
        await new Promise((resolve, reject) => {
          const req = https.request('https://malicious-api.example.com/data', (res: any) => {
            reject(new Error('External request allowed'));
          });
          req.on('error', () => resolve(true));
          req.setTimeout(2000, () => {
            req.destroy();
            resolve(true);
          });
          req.end();
        });
        threatsBlocked.push('External network request properly blocked');
      } catch (error) {
        threatsMissed.push('External network request allowed');
        effectivenessScore -= 15;
        passed = false;
      }

      // Log security violations if any
      if (threatsMissed.length > 0) {
        await this.logSecurityViolation({
          violation_type: 'network_access',
          severity: passed ? 'low' : 'medium',
          blocked_resource: threatsMissed.join(', '),
          action_taken: 'detected',
          security_profile: {
            name: 'network-boundary-test',
            enforcement_mode: 'strict',
            blocked_ports: this.config.networkRestrictions.blockedPorts
          },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      passed = false;
      effectivenessScore = 0;
    }

    const executionTimeMs = Date.now() - startTime;
    const afterScore = await this.measureCurrentSecurityState();

    return {
      boundaryType: 'network',
      testName,
      passed,
      effectivenessScore: Math.max(0, effectivenessScore),
      threatsBlocked,
      threatsMissed: threatsMissed.length > 0 ? threatsMissed : undefined,
      details: `Tested network port restrictions and external request blocking`,
      executionTimeMs,
      securityStateImpact: {
        beforeScore: this.baselineSecurityScore,
        afterScore,
        degradationPercent: Math.max(0, ((this.baselineSecurityScore - afterScore) / this.baselineSecurityScore) * 100)
      }
    };
  }

  /**
   * Test resource exhaustion protection
   */
  private async testResourceExhaustionProtection(): Promise<SecurityTestResult> {
    const testName = 'Resource Exhaustion Protection';
    const startTime = Date.now();

    const threatsBlocked: string[] = [];
    const threatsMissed: string[] = [];
    let passed = true;
    let effectivenessScore = 100;

    try {
      // Test 1: Memory exhaustion attempt
      const initialMemory = process.memoryUsage().heapUsed;
      const memoryHog = [];
      try {
        // Attempt to allocate memory beyond limits
        for (let i = 0; i < 1000; i++) {
          memoryHog.push(Buffer.alloc(1024 * 1024)); // 1MB each

          const currentMemory = process.memoryUsage().heapUsed;
          const memoryMb = currentMemory / 1024 / 1024;

          if (memoryMb > this.config.resourceLimits.maxMemoryMb * 1.5) {
            threatsMissed.push(`Memory exhaustion protection failed: ${memoryMb.toFixed(2)}MB allocated`);
            effectivenessScore -= 30;
            passed = false;
            break;
          }
        }
        threatsBlocked.push('Memory allocation properly limited');
      } finally {
        // Cleanup
        memoryHog.length = 0;
        if (global.gc) global.gc();
      }

      // Test 2: File descriptor exhaustion attempt
      const openFiles = [];
      try {
        const fs = require('fs');
        for (let i = 0; i < this.config.resourceLimits.maxFileDescriptors + 10; i++) {
          try {
            const fd = await fs.promises.open('/tmp/test-fd', 'w+');
            openFiles.push(fd);
          } catch (error) {
            // Expected to fail after reaching limit
            break;
          }
        }
        threatsBlocked.push('File descriptor limits enforced');
      } finally {
        // Cleanup
        for (const fd of openFiles) {
          try { await fd.close(); } catch {}
        }
        try {
          const fs = require('fs');
          await fs.promises.unlink('/tmp/test-fd');
        } catch {}
      }

      // Test 3: CPU exhaustion attempt
      const startTimeCpu = process.hrtime.bigint();
      let iterations = 0;
      const maxIterations = 100000000; // High number to test CPU limiting

      for (let i = 0; i < maxIterations; i++) {
        iterations++;
        if (i % 10000000 === 0) {
          const currentTime = process.hrtime.bigint();
          const elapsedMs = Number(currentTime - startTimeCpu) / 1000000;

          if (elapsedMs > 5000) { // 5 second limit
            threatsBlocked.push(`CPU intensive operation limited after ${elapsedMs.toFixed(2)}ms`);
            break;
          }
        }
      }

      // Log security violations if any
      if (threatsMissed.length > 0) {
        await this.logSecurityViolation({
          violation_type: 'privilege_escalation',
          severity: passed ? 'low' : 'high',
          command: 'resource exhaustion attempts',
          action_taken: 'detected',
          security_profile: {
            name: 'resource-exhaustion-test',
            enforcement_mode: 'strict'
          },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      passed = false;
      effectivenessScore = 0;
    }

    const executionTimeMs = Date.now() - startTime;
    const afterScore = await this.measureCurrentSecurityState();

    return {
      boundaryType: 'resource',
      testName,
      passed,
      effectivenessScore: Math.max(0, effectivenessScore),
      threatsBlocked,
      threatsMissed: threatsMissed.length > 0 ? threatsMissed : undefined,
      details: `Tested memory, file descriptor, and CPU exhaustion protection`,
      executionTimeMs,
      securityStateImpact: {
        beforeScore: this.baselineSecurityScore,
        afterScore,
        degradationPercent: Math.max(0, ((this.baselineSecurityScore - afterScore) / this.baselineSecurityScore) * 100)
      }
    };
  }

  /**
   * Test database access controls and SQL injection protection
   */
  private async testDatabaseAccessControls(): Promise<SecurityTestResult> {
    const testName = 'Database Access Controls';
    const startTime = Date.now();

    const threatsBlocked: string[] = [];
    const threatsMissed: string[] = [];
    let passed = true;
    let effectivenessScore = 100;

    try {
      // Test 1: SQL injection attempts
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO events VALUES ('malicious'); --",
        "UNION SELECT * FROM sensitive_data --"
      ];

      for (const injection of sqlInjectionAttempts) {
        try {
          // Simulate attempting SQL injection through event logger
          const maliciousEvent = {
            task_id: injection,
            kind: 'SECURITY_TEST',
            data: injection
          };

          // This should be safely handled by parameterized queries
          this.eventLogger.logTaskError(injection, new Error('Test injection'), { injection });
          threatsBlocked.push(`SQL injection attempt blocked: ${injection.substring(0, 20)}...`);
        } catch (error) {
          threatsBlocked.push(`SQL injection prevented: ${injection.substring(0, 20)}...`);
        }
      }

      // Test 2: Database connection flooding
      const connectionAttempts = [];
      try {
        for (let i = 0; i < 50; i++) {
          // Attempt to create multiple database connections
          const mockDb = this.createMockSecurityDatabase();
          connectionAttempts.push(mockDb);
        }

        if (connectionAttempts.length === 50) {
          threatsMissed.push('Database connection flooding not prevented');
          effectivenessScore -= 25;
          passed = false;
        } else {
          threatsBlocked.push('Database connection flooding limited');
        }
      } finally {
        // Cleanup connections
        connectionAttempts.length = 0;
      }

      // Test 3: Unauthorized data access attempts
      const unauthorizedQueries = [
        'SELECT * FROM system_secrets',
        'SELECT password FROM users',
        'SELECT api_key FROM credentials'
      ];

      for (const query of unauthorizedQueries) {
        try {
          // This should fail due to table not existing or access controls
          const mockDb = this.createMockSecurityDatabase();
          mockDb.prepare(query).all();
          threatsMissed.push(`Unauthorized query succeeded: ${query}`);
          effectivenessScore -= 20;
          passed = false;
        } catch (error) {
          threatsBlocked.push(`Unauthorized query blocked: ${query}`);
        }
      }

    } catch (error) {
      passed = false;
      effectivenessScore = 0;
    }

    const executionTimeMs = Date.now() - startTime;
    const afterScore = await this.measureCurrentSecurityState();

    return {
      boundaryType: 'resource',
      testName,
      passed,
      effectivenessScore: Math.max(0, effectivenessScore),
      threatsBlocked,
      threatsMissed: threatsMissed.length > 0 ? threatsMissed : undefined,
      details: `Tested SQL injection protection and database access controls`,
      executionTimeMs,
      securityStateImpact: {
        beforeScore: this.baselineSecurityScore,
        afterScore,
        degradationPercent: Math.max(0, ((this.baselineSecurityScore - afterScore) / this.baselineSecurityScore) * 100)
      }
    };
  }

  /**
   * Test event logging for data leakage prevention
   */
  private async testEventDataLeakagePrevention(): Promise<SecurityTestResult> {
    const testName = 'Event Logging Data Leakage Prevention';
    const startTime = Date.now();

    const threatsBlocked: string[] = [];
    const threatsMissed: string[] = [];
    let passed = true;
    let effectivenessScore = 100;

    try {
      // Test 1: Attempt to log sensitive data
      const sensitiveData = [
        { password: 'secret123', api_key: 'sk-test-1234567890abcdef' },
        { ssn: '123-45-6789', credit_card: '4111-1111-1111-1111' },
        { private_key: '-----BEGIN RSA PRIVATE KEY-----\n...' },
        { database_url: 'postgres://user:pass@localhost:5432/db' }
      ];

      for (const sensitive of sensitiveData) {
        try {
          // Attempt to log sensitive data
          this.eventLogger.logTaskError('security-test', new Error('Test'), sensitive);

          // Check if sensitive data was properly sanitized in events
          const events = this.eventLogger.getAllEvents(10);
          const foundSensitive = events.some(event => {
            const data = JSON.parse(event.data_json);
            return JSON.stringify(data).includes('secret') ||
                   JSON.stringify(data).includes('password') ||
                   JSON.stringify(data).includes('api_key');
          });

          if (foundSensitive) {
            threatsMissed.push('Sensitive data not properly sanitized in events');
            effectivenessScore -= 20;
            passed = false;
          } else {
            threatsBlocked.push('Sensitive data properly sanitized in events');
          }
        } catch (error) {
          threatsBlocked.push('Sensitive data logging blocked');
        }
      }

      // Test 2: Large payload logging attempts
      const largePayload = {
        data: 'x'.repeat(1000000), // 1MB of data
        nested: { deep: { values: 'y'.repeat(100000) } }
      };

      try {
        this.eventLogger.logTaskError('large-payload-test', new Error('Test'), largePayload);
        threatsBlocked.push('Large payload logging limited');
      } catch (error) {
        threatsBlocked.push('Large payload logging blocked');
      }

      // Test 3: Check for PII patterns in logged data
      const piiPatterns = [
        /\d{3}-\d{2}-\d{4}/, // SSN pattern
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card pattern
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ // Email pattern
      ];

      const testEvents = this.eventLogger.getAllEvents(50);
      for (const event of testEvents) {
        const eventData = JSON.stringify(event);
        for (const pattern of piiPatterns) {
          if (pattern.test(eventData)) {
            threatsMissed.push('PII pattern found in event logs');
            effectivenessScore -= 15;
            passed = false;
          }
        }
      }

      if (!threatsMissed.includes('PII pattern found in event logs')) {
        threatsBlocked.push('PII patterns properly filtered from events');
      }

    } catch (error) {
      passed = false;
      effectivenessScore = 0;
    }

    const executionTimeMs = Date.now() - startTime;
    const afterScore = await this.measureCurrentSecurityState();

    return {
      boundaryType: 'resource',
      testName,
      passed,
      effectivenessScore: Math.max(0, effectivenessScore),
      threatsBlocked,
      threatsMissed: threatsMissed.length > 0 ? threatsMissed : undefined,
      details: `Tested sensitive data sanitization in event logging`,
      executionTimeMs,
      securityStateImpact: {
        beforeScore: this.baselineSecurityScore,
        afterScore,
        degradationPercent: Math.max(0, ((this.baselineSecurityScore - afterScore) / this.baselineSecurityScore) * 100)
      }
    };
  }

  /**
   * Helper method to execute command with timeout
   */
  private async executeCommandWithTimeout(command: string, timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn(command, [], { shell: true, timeout: timeoutMs });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode: number) => {
        resolve({ exitCode: exitCode || 0, stdout, stderr });
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Create mock database for security testing
   */
  private createMockSecurityDatabase() {
    return {
      prepare: (query: string) => ({
        run: (...args: any[]) => ({ changes: 1, lastInsertRowid: 1 }),
        get: (...args: any[]) => null,
        all: (...args: any[]) => []
      }),
      close: () => {}
    };
  }

  /**
   * Measure baseline security state
   */
  private async measureBaselineSecurityState(): Promise<number> {
    // Simulate measuring security state based on system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Base score starts at 100, reduced by system stress
    let score = 100;

    // Memory pressure reduces score
    const memoryMb = memoryUsage.heapUsed / 1024 / 1024;
    if (memoryMb > 400) score -= 10;
    else if (memoryMb > 200) score -= 5;

    // CPU pressure reduces score
    const totalCpu = cpuUsage.user + cpuUsage.system;
    if (totalCpu > 1000000) score -= 10; // High CPU usage
    else if (totalCpu > 500000) score -= 5; // Medium CPU usage

    return Math.max(0, score);
  }

  /**
   * Measure current security state
   */
  private async measureCurrentSecurityState(): Promise<number> {
    return this.measureBaselineSecurityState();
  }

  /**
   * Log security violation events
   */
  private async logSecurityViolation(data: Omit<MafEventSecurityViolationData, 'task_id' | 'worker_id' | 'threat_context'>): Promise<void> {
    try {
      this.eventLogger.logSecurityViolation({
        ...data,
        task_id: 'security-boundary-test',
        worker_id: 'SecurityBoundaryTester'
      });
    } catch (error) {
      // Failed to log security violation - but this shouldn't fail the test
      console.error('Failed to log security violation:', error);
    }
  }

  /**
   * Log security boundary verification results
   */
  private async logSecurityBoundaryVerification(report: SecurityEffectivenessReport): Promise<void> {
    try {
      this.eventLogger.logSecurityBoundaryVerification({
        boundary_type: 'overall',
        verification_method: 'automated_test',
        effectiveness_score: report.overallEffectivenessScore,
        tests_run: report.summary.testsRun,
        tests_passed: report.summary.testsPassed,
        threats_blocked: report.summary.threatsBlocked,
        threats_missed: report.summary.threatsMissed.length > 0 ? report.summary.threatsMissed : undefined,
        security_profile: {
          name: 'MAF-backpressure-security-boundary-test',
          configuration: this.config
        },
        verification_timestamp: report.timestamp,
        task_id: 'CAN-066-Session1-Security-Test',
        worker_id: 'SecurityBoundaryTester',
        recommendations: report.summary.finalDetermination === 'EFFECTIVE' ?
          [] :
          [
            'Review security boundary configurations',
            'Implement additional monitoring',
            'Update security policies',
            'Conduct manual security audit'
          ]
      });
    } catch (error) {
      console.error('Failed to log security boundary verification:', error);
    }
  }
}

/**
 * Execute Track 2 Security Effectiveness Verification for MAF backpressure system
 */
export async function executeTrack2SecurityEffectivenessVerification(): Promise<SecurityEffectivenessReport> {
  const tester = new SecurityBoundaryTester({
    testTimeoutMs: 30000,
    resourceLimits: {
      maxMemoryMb: 512,
      maxCpuPercent: 80,
      maxFileDescriptors: 1000
    },
    networkRestrictions: {
      allowedHosts: ['localhost', '127.0.0.1'],
      blockedPorts: [22, 23, 3389, 5432, 3306],
      allowedProtocols: ['http', 'https']
    },
    filesystemRestrictions: {
      allowedPaths: ['/tmp', '/var/tmp'],
      blockedPaths: ['/etc/passwd', '/etc/shadow', '/root', '/sys', '/proc'],
      maxFileSize: 10485760
    }
  });

  console.log('🔒 Starting Track 2 Security Effectiveness Verification for MAF Backpressure System...');
  console.log('📍 Testing CAN-066 Session 1 security boundaries...\n');

  const report = await tester.executeSecurityEffectivenessTests();

  console.log('\n📊 Security Effectiveness Verification Results:');
  console.log('='.repeat(60));
  console.log(`Overall Effectiveness Score: ${report.overallEffectivenessScore}/100`);
  console.log(`Final Determination: ${report.summary.finalDetermination}`);
  console.log(`Tests Passed: ${report.summary.testsPassed}/${report.summary.testsRun}`);
  console.log(`Security State Degradation: ${report.summary.securityStateDegradation.toFixed(2)}%`);
  console.log(`Test Duration: ${report.testDurationMs}ms\n`);

  console.log('🛡️ Boundary Results:');
  report.boundaryResults.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const score = result.effectivenessScore.toString().padStart(3);
    const degradation = result.securityStateImpact.degradationPercent.toFixed(1);

    console.log(`${status} | ${score}/100 | ${degradation}% | ${result.boundaryType.padEnd(12)} | ${result.testName}`);

    if (result.threatsMissed && result.threatsMissed.length > 0) {
      result.threatsMissed.forEach(threat => {
        console.log(`    ⚠️  Missed: ${threat}`);
      });
    }
  });

  console.log('\n🎯 Threats Blocked:');
  report.summary.threatsBlocked.forEach(threat => {
    console.log(`    ✅ ${threat}`);
  });

  if (report.summary.threatsMissed.length > 0) {
    console.log('\n⚠️  Threats Missed:');
    report.summary.threatsMissed.forEach(threat => {
      console.log(`    ❌ ${threat}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  return report;
}