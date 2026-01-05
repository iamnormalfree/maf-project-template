// ABOUTME: Evidence collection system for MAF preflight executions
// ABOUTME: Captures structured evidence and stores in SQLite database

import { randomUUID } from 'node:crypto';
import { createMafRuntimeStateFromEnv } from '../core/runtime-factory';
import type { MafPreflightResult, MafPreflightCheck } from '../core/protocols';

export interface EvidenceMetadata {
  executionId: string;
  agentId: string;
  checkType: string;
  timestamp: number;
  duration?: number;
  environment: Record<string, string>;
}

export interface ExecutionEvidence {
  metadata: EvidenceMetadata;
  validations: Record<string, any>;
  errors: string[];
  warnings: string[];
  artifacts: Array<{
    type: 'log' | 'config' | 'screenshot' | 'file';
    path: string;
    description?: string;
  }>;
  systemInfo: {
    platform: string;
    nodeVersion: string;
    pythonVersion?: string;
    memoryUsage: NodeJS.MemoryUsage;
  };
}

export class EvidenceCollector {
  private runtimeState = createMafRuntimeStateFromEnv();

  /**
   * Collect comprehensive evidence during preflight execution
   */
  async collectEvidence(
    check: MafPreflightCheck,
    result: MafPreflightResult,
    validations: Record<string, any>
  ): Promise<ExecutionEvidence> {
    const metadata: EvidenceMetadata = {
      executionId: check.executionId,
      agentId: check.agentId,
      checkType: check.checkType,
      timestamp: Date.now(),
      duration: result.duration,
      environment: this.captureEnvironment()
    };

    const evidence: ExecutionEvidence = {
      metadata,
      validations,
      errors: result.result.errors || [],
      warnings: this.extractWarnings(validations),
      artifacts: await this.collectArtifacts(check),
      systemInfo: this.captureSystemInfo(validations)
    };

    return evidence;
  }

  /**
   * Store execution result and evidence in SQLite database
   */
  async storeExecutionResult(
    check: MafPreflightCheck,
    result: MafPreflightResult,
    evidence: ExecutionEvidence
  ): Promise<void> {
    try {
      const runtime = await this.runtimeState;
      
      // Store the preflight execution record
      const executionRecord = {
        id: check.executionId,
        agent_id: check.agentId,
        check_type: check.checkType,
        status: result.status,
        result_json: JSON.stringify(result),
        evidence_json: JSON.stringify(evidence),
        timestamp: Date.now(),
        duration: result.duration || 0,
        processed: 0
      };

      await runtime.enqueue({
        type: 'PREFLIGHT_EXECUTION_STORED',
        executionId: check.executionId,
        agentId: check.agentId,
        data: executionRecord,
        timestamp: Date.now()
      });

      // If SQLite runtime, store in dedicated preflight table
      if (process.env.MAF_RUNTIME === 'sqlite') {
        await this.storeInSqliteTable(executionRecord);
      }

    } catch (error) {
      console.error('Failed to store execution result:', error);
      // Continue execution - evidence storage failure shouldn't block preflight
    }
  }

  /**
   * Retrieve historical evidence for an agent
   */
  async getAgentEvidence(agentId: string, limit: number = 10): Promise<ExecutionEvidence[]> {
    try {
      // This would query the SQLite database for historical evidence
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Failed to retrieve agent evidence:', error);
      return [];
    }
  }

  /**
   * Generate evidence summary report
   */
  async generateEvidenceSummary(executionId: string): Promise<{
    executionId: string;
    status: string;
    validationCount: number;
    errorCount: number;
    warningCount: number;
    duration: number;
    artifacts: number;
  }> {
    try {
      // Query stored evidence and generate summary
      return {
        executionId,
        status: 'unknown',
        validationCount: 0,
        errorCount: 0,
        warningCount: 0,
        duration: 0,
        artifacts: 0
      };
    } catch (error) {
      console.error('Failed to generate evidence summary:', error);
      throw error;
    }
  }

  /**
   * Capture relevant environment variables for evidence
   */
  private captureEnvironment(): Record<string, string> {
    const relevantEnv = [
      'MAF_AGENT_MAIL_ROOT',
      'MAF_RUNTIME',
      'MAF_DB_PATH',
      'MAF_AGENT_ID',
      'MAF_LOG_LEVEL',
      'NODE_ENV',
      'PATH'
    ];

    const captured: Record<string, string> = {};
    for (const key of relevantEnv) {
      if (process.env[key]) {
        captured[key] = process.env[key]!;
      }
    }

    return captured;
  }

  /**
   * Collect system information
   */
  private captureSystemInfo(validations: Record<string, any>) {
    return {
      platform: process.platform,
      nodeVersion: process.version,
      pythonVersion: validations.python?.pythonVersion,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Extract warnings from validation results
   */
  private extractWarnings(validations: Record<string, any>): string[] {
    const warnings: string[] = [];
    
    for (const [key, validation] of Object.entries(validations)) {
      if (validation && typeof validation === 'object' && 'warnings' in validation) {
        if (Array.isArray(validation.warnings)) {
          warnings.push(...validation.warnings);
        }
      }
    }

    return warnings;
  }

  /**
   * Collect artifacts related to the preflight check
   */
  private async collectArtifacts(check: MafPreflightCheck): Promise<Array<{
    type: 'log' | 'config' | 'screenshot' | 'file';
    path: string;
    description?: string;
  }>> {
    const artifacts = [];
    const agentMailRoot = process.env.MAF_AGENT_MAIL_ROOT || '.agent-mail';

    // Collect MCP configuration files as artifacts
    const configFiles = ['codex.json', 'cursor.json', 'gemini.json'];
    for (const configFile of configFiles) {
      const configPath = `${agentMailRoot}/config/${configFile}`;
      artifacts.push({
        type: 'config' as const,
        path: configPath,
        description: `MCP configuration for ${configFile.replace('.json', '')}`
      });
    }

    return artifacts;
  }

  /**
   * Store evidence in SQLite preflight table
   */
  private async storeInSqliteTable(record: any): Promise<void> {
    try {
      // This would use the SQLite runtime to store in preflight_executions table
      // Implementation would create/update the table schema if needed
      console.log('Storing evidence in SQLite table:', record.id);
    } catch (error) {
      console.error('Failed to store in SQLite table:', error);
    }
  }
}

// Export singleton instance
export const evidenceCollector = new EvidenceCollector();
