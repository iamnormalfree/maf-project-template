// SupervisorDecisionEngine - Decision-making engine for supervision system
// Analyzes supervisor context and generates prioritized decisions

import type { SupervisionContext } from './types';
import { SupervisorDecisionTable } from './decision-table';

// Import SupervisorDecision from types.ts to avoid conflicts
import type { SupervisorDecision } from './types';

/**
 * Data collector interface for gathering supervision metrics
 */
export interface DataCollector {
  collectContext(): Promise<SupervisionContext>;
}

/**
 * Threshold manager for evaluating supervisor metrics
 */
export interface ThresholdManager {
  evaluateThresholds(context: SupervisionContext): {
    healthy: boolean;
    warnings: string[];
  };
}

/**
 * Decision engine configuration
 */
export interface DecisionEngineConfig {
  /** Enable debug logging */
  debug?: boolean;

  /** Maximum number of decisions to return */
  maxDecisions?: number;

  /** Minimum confidence threshold for decisions */
  minConfidence?: number;
}

/**
 * Supervisor decision action types
 */
export enum SupervisorActionType {
  CHECK_MAIL = 'CHECK_MAIL',
  PICK_TASK = 'PICK_TASK',
  PEER_REVIEW = 'PEER_REVIEW',
  CONTINUE = 'CONTINUE',
  WAIT = 'WAIT',
  SHUTDOWN = 'SHUTDOWN',
  NO_ACTION = 'NO_ACTION',
  CLEANUP_SESSIONS = 'CLEANUP_SESSIONS',
}

/**
 * Legacy decision interface (for backward compatibility)
 * @deprecated Use SupervisorDecision from types.ts instead
 */
export interface LegacySupervisorDecision {
  action: string;
  priority: number;
}

/**
 * Supervisor decision result
 * Combines decision from decision table with execution priority
 */
export interface DecisionResult {
  /** The decision */
  decision: SupervisorDecision;

  /** Execution priority (higher = execute first) */
  priority: number;

  /** Source of the decision (table, fallback, etc.) */
  source: string;
}

/**
 * SupervisorDecisionEngine - Main decision-making engine
 *
 * Responsibilities:
 * - Analyze supervisor context (agents, tasks, sessions)
 * - Generate prioritized decisions using decision table
 * - Coordinate with data collector for context gathering
 * - Return actionable supervisor decisions
 */
export class SupervisorDecisionEngineImpl {
  private config: Required<DecisionEngineConfig>;

  constructor(
    private dataCollector: DataCollector,
    private decisionTable: SupervisorDecisionTable,
    private thresholdManager: ThresholdManager,
    config: DecisionEngineConfig = {}
  ) {
    this.config = {
      debug: config.debug ?? false,
      maxDecisions: config.maxDecisions ?? 10,
      minConfidence: config.minConfidence ?? 0.5,
    };
  }

  /**
   * Main decision method - analyzes context and returns prioritized decisions
   *
   * Process:
   * 1. Collect current supervision context
   * 2. Evaluate thresholds for health check
   * 3. Query decision table for matching rules
   * 4. Rank and prioritize decisions
   * 5. Return actionable decisions
   */
  async decide(): Promise<DecisionResult[]> {
    try {
      // Step 1: Collect current context
      const context = await this.dataCollector.collectContext();

      // Step 2: Evaluate thresholds (health check)
      const thresholdResult = this.thresholdManager.evaluateThresholds(context);

      // Step 3: Query decision table
      const tableDecision = this.decisionTable.evaluate(context);

      // Step 4: Process and prioritize decisions
      const results = this.processDecisions(
        context,
        thresholdResult,
        tableDecision
      );

      // Debug logging
      if (this.config.debug) {
        console.debug('[SupervisorDecisionEngine] Decision results:', {
          context: {
            agentCount: context.agents?.length ?? 0,
            sessionCount: context.sessions?.length ?? 0,
          },
          thresholdResult,
          decisionCount: results.length,
          decisions: results.map(r => ({
            action: r.decision.action.type,
            priority: r.priority,
            confidence: r.decision.confidence,
          })),
        });
      }

      return results;
    } catch (error) {
      console.error('[SupervisorDecisionEngine] Error in decide():', error);

      // Return safe fallback decision on error
      return [
        {
          decision: {
            action: { type: SupervisorActionType.WAIT, target: 'supervisor' },
            reasoning: `Error in decision engine: ${(error as Error).message}. Waiting for retry.`,
            confidence: 0.5,
          },
          priority: 0,
          source: 'fallback-error',
        },
      ];
    }
  }

  /**
   * Process decision table results into prioritized decision list
   */
  private processDecisions(
    context: SupervisionContext,
    thresholdResult: { healthy: boolean; warnings: string[] },
    tableDecision: SupervisorDecision | SupervisorDecision[]
  ): DecisionResult[] {
    const results: DecisionResult[] = [];

    // Handle array of decisions (if continueAfterMatch was enabled)
    const decisions = Array.isArray(tableDecision)
      ? tableDecision
      : [tableDecision];

    // Filter out NO_ACTION and low-confidence decisions
    const validDecisions = decisions.filter(
      (d) =>
        d.action.type !== SupervisorActionType.NO_ACTION &&
        d.confidence >= this.config.minConfidence
    );

    // Convert to DecisionResult with priority
    for (const decision of validDecisions) {
      results.push({
        decision,
        priority: this.calculatePriority(decision, context, thresholdResult),
        source: 'decision-table',
      });
    }

    // Add threshold-based decisions if system is unhealthy
    if (!thresholdResult.healthy && thresholdResult.warnings.length > 0) {
      results.push({
        decision: {
          action: {
            type: SupervisorActionType.WAIT,
            target: 'supervisor',
            parameters: { reason: 'System unhealthy, waiting for recovery' },
          },
          reasoning: `Threshold warnings: ${thresholdResult.warnings.join(', ')}`,
          confidence: 0.9,
        },
        priority: 100, // High priority for health issues
        source: 'threshold-check',
      });
    }

    // Sort by priority (higher first) and limit results
    results.sort((a, b) => b.priority - a.priority);
    return results.slice(0, this.config.maxDecisions);
  }

  /**
   * Calculate execution priority for a decision
   *
   * Priority factors:
   * - Confidence (higher confidence = higher priority)
   * - Action type (certain actions get priority boost)
   * - Context factors (number of idle agents, pending tasks, etc.)
   */
  private calculatePriority(
    decision: SupervisorDecision,
    context: SupervisionContext,
    thresholdResult: { healthy: boolean; warnings: string[] }
  ): number {
    let priority = 50; // Base priority

    // Confidence boosts priority
    priority += decision.confidence * 30;

    // Action-type specific priorities
    const actionType = decision.action.type;

    switch (actionType) {
      case SupervisorActionType.CHECK_MAIL:
        priority += 20;
        break;

      case SupervisorActionType.PICK_TASK:
        // Higher priority if many idle agents
        const idleAgentCount =
          context.agents?.filter((a) => a.status === 'idle').length ?? 0;
        priority += 10 + idleAgentCount * 5;
        break;

      case SupervisorActionType.SHUTDOWN:
        priority += 100; // Highest priority
        break;

      case SupervisorActionType.CLEANUP_SESSIONS:
        priority += 15;
        break;

      case SupervisorActionType.WAIT:
        priority -= 20; // Lower priority for waiting
        break;

      case SupervisorActionType.NO_ACTION:
        priority = 0; // No priority for no action
        break;
    }

    // Context-based adjustments
    const agentCount = context.agents?.length ?? 0;
    const sessionCount = context.sessions?.length ?? 0;

    // Boost priority if many agents are idle and waiting for work
    if (actionType === SupervisorActionType.PICK_TASK && agentCount > 0) {
      const idleRatio =
        (context.agents?.filter((a) => a.status === 'idle').length ?? 0) /
        agentCount;
      if (idleRatio > 0.5) {
        priority += 15;
      }
    }

    // Reduce priority if system is unhealthy (except for health-related actions)
    if (!thresholdResult.healthy && actionType !== SupervisorActionType.WAIT) {
      priority -= 10;
    }

    return Math.max(0, Math.min(100, priority)); // Clamp to 0-100
  }

  /**
   * Get configuration
   */
  getConfig(): DecisionEngineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DecisionEngineConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Health check for the decision engine
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    checks: {
      dataCollector: boolean;
      decisionTable: boolean;
      thresholdManager: boolean;
    };
  }> {
    const checks = {
      dataCollector: !!this.dataCollector,
      decisionTable: !!this.decisionTable,
      thresholdManager: !!this.thresholdManager,
    };

    return {
      healthy: Object.values(checks).every((v) => v),
      checks,
    };
  }
}

/**
 * Factory function to create a new SupervisorDecisionEngine
 */
export function createSupervisorDecisionEngine(
  dataCollector: DataCollector,
  decisionTable: SupervisorDecisionTable,
  thresholdManager: ThresholdManager,
  config?: DecisionEngineConfig
): SupervisorDecisionEngineImpl {
  return new SupervisorDecisionEngineImpl(
    dataCollector,
    decisionTable,
    thresholdManager,
    config
  );
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use SupervisorDecisionEngineImpl instead
 */
export class SupervisorDecisionEngine {
  constructor(
    private dataCollector: DataCollector,
    private decisionTable: SupervisorDecisionTable,
    private thresholdManager: ThresholdManager,
    private config: DecisionEngineConfig = {}
  ) {
    console.warn(
      '[SupervisorDecisionEngine] Legacy class constructor called. ' +
        'Please use createSupervisorDecisionEngine() factory function instead.'
    );
  }

  async decide(): Promise<DecisionResult[]> {
    const impl = new SupervisorDecisionEngineImpl(
      this.dataCollector,
      this.decisionTable,
      this.thresholdManager,
      this.config
    );
    return impl.decide();
  }
}

// Re-export types from decision-table for convenience
export type {
  DecisionRule,
  DecisionTableConfig,
  SupervisorAction,
} from './decision-table';
