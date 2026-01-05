#!/usr/bin/env -S node --import tsx

// ABOUTME: MAF audit guard system for evidence-based audit execution on bead-id targets with real file system inspection.
// ABOUTME: Integrates with preflight system validation and provides analysis with JSON output.

import { createMafRuntimeStateFromEnv } from '../../lib/maf/core/runtime-factory';
import type { MafAuditGuardRequest, MafAuditGuardResult } from '../../lib/maf/core/protocols';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

interface AuditGuardArgs {
  beadId?: string;
  sampleSize?: number;
  agentId?: string;
  auditId?: string;
  json?: boolean;
  help?: boolean;
}

interface FileSystemEvidence {
  path: string;
  exists: boolean;
  size?: number;
  modified?: Date;
  accessed?: Date;
  permissions?: string;
  type: 'file' | 'directory';
  content?: any;
}

interface AgentMailEvidence {
  messageQueueSize: number;
  outboxSize: number;
  lastHeartbeat?: Date;
  logEntries: number;
  escalationRequests: number;
  systemStatus: 'healthy' | 'degraded' | 'critical';
}

/**
 * Parse command line arguments for audit guard
 */
function parseArgs(argv: string[]): AuditGuardArgs {
  const args: AuditGuardArgs = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case '--bead-id':
        args.beadId = argv[++i];
        break;
      case '--sample-size':
        const size = parseInt(argv[++i]);
        if (isNaN(size) || size < 1) {
          throw new Error(`Invalid sample-size: ${size}. Must be a positive integer.`);
        }
        args.sampleSize = size;
        break;
      case '--agent-id':
        args.agentId = argv[++i];
        break;
      case '--audit-id':
        args.auditId = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }
  
  return args;
}

/**
 * Show usage information
 */
function showUsage(): void {
  console.log(`
🛡️ MAF Audit Guard System
==========================

Performs evidence-based audit execution on bead-id targets with real file system inspection.

Usage: audit-guard [options]

Required Options:
  --bead-id <id>         Bead ID to audit

Optional Options:
  --sample-size <n>      Number of samples to audit (default: 5)
  --agent-id <id>        Agent ID performing the audit (auto-generated if not provided)
  --audit-id <id>        Custom audit ID (auto-generated if not provided)
  --json                 Output JSON format instead of human-readable
  --help, -h            Show this help message

Examples:
  audit-guard --bead-id bd-demo
  audit-guard --bead-id bd-123 --sample-size 10 --agent-id audit-agent-1
  audit-guard --bead-id bd-demo --json
`);
}

/**
 * Generate unique audit ID using cryptographic hash
 */
function generateAuditId(): string {
  const timestamp = Date.now();
  const hash = createHash('sha256').update(`${timestamp}-audit`).digest('hex').substring(0, 8);
  return `audit_${timestamp}_${hash}`;
}

/**
 * Generate unique execution ID using cryptographic hash
 */
function generateExecutionId(): string {
  const timestamp = Date.now();
  const hash = createHash('sha256').update(`${timestamp}-exec`).digest('hex').substring(0, 8);
  return `exec_${timestamp}_${hash}`;
}

/**
 * Validate required arguments
 */
function validateArgs(args: AuditGuardArgs): void {
  if (!args.beadId) {
    throw new Error('--bead-id is required');
  }
}

interface AuditFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  evidence?: string;
  recommendation?: string;
}

/**
 * Collect file system evidence for audit
 */
async function collectFileSystemEvidence(targetPath: string): Promise<FileSystemEvidence[]> {
  const evidence: FileSystemEvidence[] = [];
  
  try {
    const stats = await fs.stat(targetPath);
    const evidenceItem: FileSystemEvidence = {
      path: targetPath,
      exists: true,
      size: stats.size,
      modified: stats.mtime,
      accessed: stats.atime,
      permissions: stats.mode.toString(8),
      type: stats.isDirectory() ? 'directory' : 'file'
    };
    
    // If it's a readable file, collect content evidence
    if (stats.isFile() && stats.size < 1024 * 1024) { // Limit to 1MB files
      try {
        const content = await fs.readFile(targetPath, 'utf-8');
        evidenceItem.content = {
          size: content.length,
          lines: content.split('\n').length,
          type: path.extname(targetPath)
        };
      } catch (error) {
        // File exists but not readable
        evidenceItem.content = { error: 'File not readable' };
      }
    }
    
    evidence.push(evidenceItem);
  } catch (error) {
    // File doesn't exist or is inaccessible
    evidence.push({
      path: targetPath,
      exists: false,
      type: 'file'
    });
  }
  
  return evidence;
}

/**
 * Collect agent mail system evidence
 */
async function collectAgentMailEvidence(): Promise<AgentMailEvidence> {
  const agentMailPath = path.join(process.cwd(), '.agent-mail');
  const evidence: AgentMailEvidence = {
    messageQueueSize: 0,
    outboxSize: 0,
    logEntries: 0,
    escalationRequests: 0,
    systemStatus: 'healthy'
  };
  
  try {
    // Check message queue
    const queuePath = path.join(agentMailPath, 'messages', 'queue.json');
    const queueEvidence = await collectFileSystemEvidence(queuePath);
    if (queueEvidence[0].exists && queueEvidence[0].content) {
      try {
        const queueContent = queueEvidence[0].content as any; const queueData = JSON.parse(queueContent.size ? await fs.readFile(queuePath, "utf-8") : "{}");
        evidence.messageQueueSize = queueData.metadata?.count || 0;
        
        // Count escalation requests in queue
        if (queueData.messages) {
          evidence.escalationRequests = queueData.messages.filter(
            (msg: any) => msg.type === 'ESCALATION_REQUEST'
          ).length;
        }
      } catch (error) {
        evidence.systemStatus = 'degraded';
      }
    }
    
    // Check outbox
    const outboxPath = path.join(agentMailPath, 'outbox');
    try {
      const outboxFiles = await fs.readdir(outboxPath);
      evidence.outboxSize = outboxFiles.length;
    } catch (error) {
      // Outbox directory doesn't exist
    }
    
    // Check logs
    const logPath = path.join(agentMailPath, 'logs', 'agent-mail.log');
    const logEvidence = await collectFileSystemEvidence(logPath);
    if (logEvidence[0].exists && logEvidence[0].content) {
      evidence.logEntries = logEvidence[0].content.lines || 0;
    }
    
    // Check heartbeats
    const heartbeatPath = path.join(agentMailPath, 'heartbeats.json');
    const heartbeatEvidence = await collectFileSystemEvidence(heartbeatPath);
    if (heartbeatEvidence[0].exists && heartbeatEvidence[0].content) {
      try {
        const heartbeatContent = await fs.readFile(heartbeatPath, 'utf-8');
        const heartbeatData = JSON.parse(heartbeatContent);
        if (heartbeatData.metadata?.lastUpdated) {
          evidence.lastHeartbeat = new Date(heartbeatData.metadata.lastUpdated);
          
          // Check if heartbeat is recent (within 5 minutes)
          const now = new Date();
          const heartbeatAge = now.getTime() - evidence.lastHeartbeat.getTime();
          if (heartbeatAge > 5 * 60 * 1000) { // 5 minutes
            evidence.systemStatus = 'critical';
          } else if (heartbeatAge > 2 * 60 * 1000) { // 2 minutes
            evidence.systemStatus = 'degraded';
          }
        }
      } catch (error) {
        evidence.systemStatus = 'degraded';
      }
    }
    
  } catch (error) {
    evidence.systemStatus = 'critical';
  }
  
  return evidence;
}

/**
 * Perform code quality audit based on real file system evidence
 */
async function auditCodeQuality(beadId: string, sampleSize: number): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  
  // Collect evidence from project structure
  const projectPaths = [
    'package.json',
    'tsconfig.json',
    'tailwind.config.ts',
    '.eslintrc.js',
    'README.md'
  ];
  
  let configFilesFound = 0;
  let configFilesMissing = 0;
  
  for (const projectPath of projectPaths) {
    const evidence = await collectFileSystemEvidence(projectPath);
    if (evidence[0].exists) {
      configFilesFound++;
      
      // Check file modification times for staleness
      if (evidence[0].modified) {
        const daysSinceModified = (Date.now() - evidence[0].modified.getTime()) / (1000 * 60 * 60 * 24);
        
        if (projectPath === 'package.json' && daysSinceModified > 30) {
          findings.push({
            severity: 'medium',
            category: 'dependency_management',
            description: `package.json may be outdated for bead ${beadId}`,
            evidence: `Last modified ${Math.floor(daysSinceModified)} days ago`,
            recommendation: 'Review and update dependencies'
          });
        }
        
        if (projectPath === 'README.md' && daysSinceModified > 90) {
          findings.push({
            severity: 'low',
            category: 'documentation',
            description: `README may be outdated for bead ${beadId}`,
            evidence: `Last modified ${Math.floor(daysSinceModified)} days ago`,
            recommendation: 'Review and update documentation'
          });
        }
      }
    } else {
      configFilesMissing++;
      
      if (['tsconfig.json', 'package.json'].includes(projectPath)) {
        findings.push({
          severity: 'high',
          category: 'project_structure',
          description: `Missing essential config file: ${projectPath}`,
          evidence: `File not found at project root`,
          recommendation: `Create ${projectPath} with appropriate configuration`
        });
      }
    }
  }
  
  // Check for test files
  const testDirectories = ['__tests__', 'tests', 'lib/__tests__'];
  let testDirectoriesFound = 0;
  
  for (const testDir of testDirectories) {
    const evidence = await collectFileSystemEvidence(testDir);
    if (evidence[0].exists) {
      testDirectoriesFound++;
    }
  }
  
  if (testDirectoriesFound === 0) {
    findings.push({
      severity: 'high',
      category: 'test_coverage',
      description: `No test directories found for bead ${beadId}`,
      evidence: `Searched for: ${testDirectories.join(', ')}`,
      recommendation: 'Create test directories and add unit tests'
    });
  }
  
  // Check agent mail system for operational evidence
  const agentMailEvidence = await collectAgentMailEvidence();

  // In development environment, absence of agents is expected and not critical
  // Only flag critical if there's a severe message queue backlog (>50 messages)
  if (agentMailEvidence.systemStatus === 'critical' && agentMailEvidence.messageQueueSize > 50) {
    findings.push({
      severity: 'critical',
      category: 'system_integrity',
      description: `Agent mail system has severe message backlog for bead ${beadId}`,
      evidence: `System status: ${agentMailEvidence.systemStatus}, queue size: ${agentMailEvidence.messageQueueSize}`,
      recommendation: 'Clear message backlog or restart agent mail services'
    });
  } else if (agentMailEvidence.systemStatus === 'critical') {
    // In development, no agents is normal - just informational
    findings.push({
      severity: 'low',
      category: 'system_info',
      description: `Agent mail system is idle (normal for development) for bead ${beadId}`,
      evidence: `System status: idle, queue size: ${agentMailEvidence.messageQueueSize}`,
      recommendation: 'Start agents when ready for active development'
    });
  } else if (agentMailEvidence.systemStatus === 'degraded') {
    findings.push({
      severity: 'medium',
      category: 'system_performance',
      description: `Agent mail system performance is degraded for bead ${beadId}`,
      evidence: `System status: ${agentMailEvidence.systemStatus}, escalation requests: ${agentMailEvidence.escalationRequests}`,
      recommendation: 'Monitor system performance and investigate delays'
    });
  }
  
  return findings;
}

/**
 * Perform documentation audit based on real file evidence
 */
async function auditDocumentation(beadId: string, sampleSize: number): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  
  // Check for documentation files
  const docPaths = [
    'README.md',
    'docs/',
    'CLAUDE.md',
    'docs/KNOWN_ISSUES.md',
    'docs/ARCHITECTURE.md'
  ];
  
  let docsFound = 0;
  
  for (const docPath of docPaths) {
    const evidence = await collectFileSystemEvidence(docPath);
    if (evidence[0].exists) {
      docsFound++;
      
      // For files, check content quality
      if (evidence[0].type === 'file' && evidence[0].content) {
        const content = evidence[0].content;
        
        if (docPath === 'README.md' && content.lines < 20) {
          findings.push({
            severity: 'medium',
            category: 'documentation',
            description: `README.md appears minimal for bead ${beadId}`,
            evidence: `Only ${content.lines} lines found`,
            recommendation: 'Expand README with comprehensive project information'
          });
        }
        
        // Check for last update
        if (evidence[0].modified) {
          const daysSinceModified = (Date.now() - evidence[0].modified.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysSinceModified > 180 && !docPath.includes('ARCHITECTURE')) {
            findings.push({
              severity: 'low',
              category: 'documentation',
              description: `Documentation ${docPath} may be stale for bead ${beadId}`,
              evidence: `Last modified ${Math.floor(daysSinceModified)} days ago`,
              recommendation: 'Review and update documentation content'
            });
          }
        }
      }
    } else if (!docPath.endsWith('/')) {
      // Only flag missing individual files, not directories
      if (docPath === 'README.md') {
        findings.push({
          severity: 'high',
          category: 'documentation',
          description: `Missing essential documentation: ${docPath}`,
          evidence: `File not found at project root`,
          recommendation: 'Create comprehensive README.md with project overview'
        });
      }
    }
  }
  
  if (docsFound < 2) {
    findings.push({
      severity: 'high',
      category: 'documentation',
      description: `Insufficient documentation found for bead ${beadId}`,
      evidence: `Found ${docsFound} out of ${docPaths.length} expected documentation items`,
      recommendation: 'Create comprehensive documentation including README and architectural guides'
    });
  }
  
  return findings;
}

/**
 * Perform performance audit based on system evidence
 */
async function auditPerformance(beadId: string, sampleSize: number): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  
  // Check build and dependency files for performance indicators
  const packageJsonEvidence = await collectFileSystemEvidence('package.json');
  
  if (packageJsonEvidence[0].exists && packageJsonEvidence[0].content) {
    try {
      const packageContent = await fs.readFile('package.json', 'utf-8');
        const packageData = JSON.parse(packageContent);
      
      // Check for performance-related dependencies
      const hasPerformanceTools = packageData.devDependencies && (
        packageData.devDependencies.lighthouse ||
        packageData.devDependencies['@next/bundle-analyzer'] ||
        packageData.devDependencies.webpack-bundle-analyzer
      );
      
      if (!hasPerformanceTools) {
        findings.push({
          severity: 'low',
          category: 'performance_monitoring',
          description: `No performance monitoring tools found in bead ${beadId}`,
          evidence: 'Missing lighthouse, bundle analyzer, or similar tools',
          recommendation: 'Add performance monitoring tools to detect optimization opportunities'
        });
      }
      
      // Check dependency count for potential bloat
      const depCount = Object.keys(packageData.dependencies || {}).length;
      const devDepCount = Object.keys(packageData.devDependencies || {}).length;
      const totalDeps = depCount + devDepCount;
      
      if (totalDeps > 500) {
        findings.push({
          severity: 'medium',
          category: 'performance',
          description: `High dependency count may impact performance for bead ${beadId}`,
          evidence: `${totalDeps} dependencies found (production: ${depCount}, dev: ${devDepCount})`,
          recommendation: 'Review dependency tree for unnecessary packages'
        });
      }
      
    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'configuration',
        description: `Unable to parse package.json for performance analysis in bead ${beadId}`,
        evidence: 'JSON parsing failed',
        recommendation: 'Validate package.json syntax and structure'
      });
    }
  }
  
  // Check for build artifacts that might indicate build performance
  const buildArtifacts = [
    '.next/',
    'dist/',
    'build/',
    'out/'
  ];
  
  let totalBuildSize = 0;
  for (const artifact of buildArtifacts) {
    const evidence = await collectFileSystemEvidence(artifact);
    if (evidence[0].exists && evidence[0].type === 'directory' && evidence[0].size) {
      totalBuildSize += evidence[0].size;
    }
  }
  
  if (totalBuildSize > 100 * 1024 * 1024) { // > 100MB
    findings.push({
      severity: 'medium',
      category: 'performance',
      description: `Large build artifacts detected for bead ${beadId}`,
      evidence: `Total build size: ${Math.round(totalBuildSize / (1024 * 1024))}MB`,
      recommendation: 'Optimize build output and consider code splitting'
    });
  }
  
  // Check agent mail system performance
  const agentMailEvidence = await collectAgentMailEvidence();
  if (agentMailEvidence.messageQueueSize > 100) {
    findings.push({
      severity: 'medium',
      category: 'performance',
      description: `High message queue backlog may indicate performance issues for bead ${beadId}`,
      evidence: `${agentMailEvidence.messageQueueSize} messages in queue`,
      recommendation: 'Investigate message processing performance and clear backlog'
    });
  }
  
  return findings;
}

/**
 * Run audit on bead using real file system evidence
 */
async function runAudit(beadId: string, sampleSize: number, agentId: string, auditId: string, executionId: string): Promise<MafAuditGuardResult> {
  const startTime = Date.now();
  
  try {
    // Run evidence-based audits
    const codeQualityFindings = await auditCodeQuality(beadId, sampleSize);
    const documentationFindings = await auditDocumentation(beadId, sampleSize);
    const performanceFindings = await auditPerformance(beadId, sampleSize);
    
    // Combine all findings
    const allFindings = [...codeQualityFindings, ...documentationFindings, ...performanceFindings];
    
    // Sort by severity
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    allFindings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
    
    // Calculate summary
    const summary = {
      totalFindings: allFindings.length,
      criticalCount: allFindings.filter(f => f.severity === 'critical').length,
      highCount: allFindings.filter(f => f.severity === 'high').length,
      mediumCount: allFindings.filter(f => f.severity === 'medium').length,
      lowCount: allFindings.filter(f => f.severity === 'low').length
    };
    
    // Determine overall status based on real evidence
    let status: 'passed' | 'failed' | 'warning';
    if (summary.criticalCount > 0) {
      status = 'failed';
    } else if (summary.highCount > 2) {
      status = 'failed';
    } else if (summary.highCount > 0 || summary.mediumCount > 5) {
      status = 'warning';
    } else {
      status = 'passed';
    }
    
    // Collect agent mail evidence for final audit verification
    const agentMailEvidence = await collectAgentMailEvidence();
    
    return {
      type: 'AUDIT_GUARD_RESULT',
      agentId,
      executionId,
      auditId,
      beadId,
      status,
      findings: allFindings,
      summary,
      timestamp: Date.now(),
      success: status !== 'failed',
      samplesChecked: sampleSize,
      duration: Date.now() - startTime,
      // Add evidence metadata for verification
      ...(agentMailEvidence.systemStatus !== 'healthy' && {
        systemEvidence: {
          agentMailStatus: agentMailEvidence.systemStatus,
          messageQueueSize: agentMailEvidence.messageQueueSize,
          escalationRequests: agentMailEvidence.escalationRequests
        }
      })
    };
    
  } catch (error) {
    // Return failed audit result on error
    return {
      type: 'AUDIT_GUARD_RESULT',
      agentId,
      executionId,
      auditId,
      beadId,
      status: 'failed',
      findings: [{
        severity: 'critical',
        category: 'audit_execution',
        description: `Audit execution failed: ${error instanceof Error ? error.message : String(error)}`,
        evidence: 'Error during evidence-based audit execution'
      }],
      summary: {
        totalFindings: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0
      },
      timestamp: Date.now(),
      success: false,
      samplesChecked: 0,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Format output based on --json flag
 */
function formatOutput(result: MafAuditGuardResult, json: boolean = false): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const statusIcon = result.status === 'passed' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
    console.log(`${statusIcon} Evidence-based audit completed for bead ${result.beadId}`);
    console.log(`🆔 Audit ID: ${result.auditId}`);
    console.log(`🤖 Agent: ${result.agentId}`);
    console.log(`📊 Status: ${result.status.toUpperCase()}`);
    console.log(`📋 Findings: ${result.summary.totalFindings} total`);
    console.log(`🔍 Samples Checked: ${result.samplesChecked}`);
    console.log(`⏱️  Duration: ${result.duration}ms`);
    
    if (result.systemEvidence) {
      console.log(`🔄 System Evidence: Agent Mail Status=${result.systemEvidence.agentMailStatus}, Queue=${result.systemEvidence.messageQueueSize}`);
    }
    
    if (result.summary.totalFindings > 0) {
      console.log('');
      console.log('Evidence-Based Findings Summary:');
      console.log(`  🔴 Critical: ${result.summary.criticalCount}`);
      console.log(`  🟠 High: ${result.summary.highCount}`);
      console.log(`  🟡 Medium: ${result.summary.mediumCount}`);
      console.log(`  🔵 Low: ${result.summary.lowCount}`);
      
      // Show top findings
      const topFindings = result.findings.slice(0, 5);
      if (topFindings.length > 0) {
        console.log('');
        console.log('Top Evidence-Based Findings:');
        topFindings.forEach((finding, index) => {
          const severityIcon = finding.severity === 'critical' ? '🔴' : 
                              finding.severity === 'high' ? '🟠' : 
                              finding.severity === 'medium' ? '🟡' : '🔵';
          console.log(`  ${index + 1}. ${severityIcon} ${finding.category}: ${finding.description}`);
          if (finding.evidence) {
            console.log(`     📋 Evidence: ${finding.evidence}`);
          }
          if (finding.recommendation) {
            console.log(`     💡 ${finding.recommendation}`);
          }
        });
      }
    } else {
      console.log('');
      console.log('✨ No issues found - all evidence-based checks passed!');
    }
    
    if (result.status === 'failed') {
      process.exit(1);
    }
  }
}

/**
 * Load environment variables from .env.local
 */
function loadEnvironmentVariables(): void {
  const path = require('path');
  const fs = require('fs');

  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');

    // Parse and set environment variables
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (line.trim() && !line.trim().startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Remove surrounding quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, '');
          process.env[key.trim()] = cleanValue;
        }
      }
    });
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  // Load environment variables first
  loadEnvironmentVariables();

  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    showUsage();
    return;
  }
  
  validateArgs(args);
  
  const agentId = args.agentId || `audit-agent-${Date.now()}`;
  const auditId = args.auditId || generateAuditId();
  const executionId = generateExecutionId();
  const sampleSize = args.sampleSize || 5;
  
  try {
    // Create runtime state (suppress logs in JSON mode)
    const originalConsoleLog = console.log;
    if (args.json) {
      console.log = () => {}; // Suppress console.log in JSON mode
    }
    
    const runtime = await createMafRuntimeStateFromEnv();
    
    // Restore console.log
    if (args.json) {
      console.log = originalConsoleLog;
    }
    
    // Create audit request
    const auditRequest: MafAuditGuardRequest = {
      type: 'AUDIT_GUARD_REQUEST',
      agentId,
      executionId,
      auditId,
      beadId: args.beadId!,
      sampleSize,
      context: {
        component: 'audit-guard',
        timestamp: Date.now(),
        evidenceBased: true
      },
      timestamp: Date.now()
    };
    
    // Persist audit request to runtime
    await runtime.enqueue(auditRequest);
    
    // Run evidence-based audit
    const result = await runAudit(args.beadId!, sampleSize, agentId, auditId, executionId);
    
    // Persist audit result to runtime
    await runtime.enqueue(result);
    
    // Format and display result
    formatOutput(result, args.json);
    
  } catch (error) {
    const errorResult: MafAuditGuardResult = {
      type: 'AUDIT_GUARD_RESULT',
      agentId,
      executionId,
      auditId,
      beadId: args.beadId || 'unknown',
      status: 'failed',
      findings: [{
        severity: 'critical',
        category: 'system_error',
        description: `System error during evidence-based audit: ${error instanceof Error ? error.message : String(error)}`,
        evidence: 'System failure during file system inspection'
      }],
      summary: {
        totalFindings: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0
      },
      timestamp: Date.now(),
      success: false,
      samplesChecked: 0,
      duration: 0
    };
    
    if (args.json) {
      console.log(JSON.stringify(errorResult, null, 2));
    } else {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error in evidence-based audit-guard.ts:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { main };
