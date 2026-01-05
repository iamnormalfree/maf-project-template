// SupervisorDecisionTable - Decision table evaluation for supervision system
// Implements rule-based decision making with priority handling and context matching

import type { SupervisorDecision, SupervisionContext } from './types';

/**
 * Decision rule definition
 * Rules are evaluated in priority order (higher priority = evaluated first)
 */
export interface DecisionRule {
  /** Unique rule identifier */
  id: string;

  /** Rule name/description */
  name: string;

  /** Priority (higher = evaluated first) */
  priority: number;

  /** Condition function - returns true if rule matches context */
  condition: (context: SupervisionContext) => boolean;

  /** Action to take if condition matches */
  action: SupervisorAction;

  /** Reasoning for this decision */
  reasoning: string;

  /** Confidence in this decision (0-1) */
  confidence: number;
}

/** Supervisor action type */
export interface SupervisorAction {
  type: string;
  target: string;
  parameters?: any;
}

/**
 * Decision table configuration
 */
export interface DecisionTableConfig {
  /** Maximum number of rules to evaluate before stopping */
  maxRules?: number;

  /** Whether to continue evaluating after first match */
  continueAfterMatch?: boolean;

  /** Default confidence for decisions without explicit confidence */
  defaultConfidence?: number;
}

/**
 * SupervisorDecisionTable evaluates decision rules against supervision context
 *
 * Features:
 * - Priority-based rule evaluation (higher priority first)
 * - Context-aware condition matching
 * - Decision aggregation from multiple matched rules
 * - Configurable evaluation strategy (stop at first match vs. collect all)
 */
export class SupervisorDecisionTable {
  private rules: Map<string, DecisionRule> = new Map();
  private config: Required<DecisionTableConfig>;

  constructor(config: DecisionTableConfig = {}) {
    this.config = {
      maxRules: config.maxRules ?? 100,
      continueAfterMatch: config.continueAfterMatch ?? false,
      defaultConfidence: config.defaultConfidence ?? 0.8,
    };
  }

  /**
   * Add a decision rule to the table
   */
  addRule(rule: DecisionRule): this {
    this.rules.set(rule.id, {
      ...rule,
      confidence: rule.confidence ?? this.config.defaultConfidence,
    });
    return this;
  }

  /**
   * Remove a decision rule from the table
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get all rules sorted by priority (highest first)
   */
  private getSortedRules(): DecisionRule[] {
    return Array.from(this.rules.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  /**
   * Evaluate the decision table against the given context
   *
   * Returns:
   * - Single decision if continueAfterMatch is false (default)
   * - Array of decisions if continueAfterMatch is true
   */
  evaluate(context: SupervisionContext): SupervisorDecision | SupervisorDecision[] {
    const sortedRules = this.getSortedRules();
    const matches: SupervisorDecision[] = [];

    // Evaluate rules in priority order
    for (const rule of sortedRules.slice(0, this.config.maxRules)) {
      try {
        if (rule.condition(context)) {
          const decision: SupervisorDecision = {
            action: rule.action,
            reasoning: rule.reasoning,
            confidence: rule.confidence,
          };

          matches.push(decision);

          // Stop after first match if configured
          if (!this.config.continueAfterMatch) {
            return decision;
          }
        }
      } catch (error) {
        // Log error but continue evaluating other rules
        console.error(
          `DecisionTable: Error evaluating rule ${rule.id}:`,
              error
        );
      }
    }

    // Return results based on configuration
    if (!this.config.continueAfterMatch) {
      // No match found - return null decision
      return {
        action: { type: 'NO_ACTION', target: '' },
        reasoning: 'No matching rules found',
        confidence: 0,
      };
    }

    return matches;
  }

  /**
   * Get the number of rules in the table
   */
  getRuleCount(): number {
    return this.rules.size;
  }

  /**
   * Clear all rules from the table
   */
  clearRules(): void {
    this.rules.clear();
  }

  /**
   * Get all rule IDs
   */
  getRuleIds(): string[] {
    return Array.from(this.rules.keys());
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): DecisionRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Update an existing rule
   */
  updateRule(ruleId: string, updates: Partial<DecisionRule>): boolean {
    const existing = this.rules.get(ruleId);
    if (!existing) {
      return false;
    }

    this.rules.set(ruleId, {
      ...existing,
      ...updates,
      id: ruleId, // Preserve ID
    });
    return true;
  }

  /**
   * Evaluate rules and return only matching rule IDs
   * Useful for debugging and testing
   */
  evaluateMatches(context: SupervisionContext): string[] {
    const sortedRules = this.getSortedRules();
    const matches: string[] = [];

    for (const rule of sortedRules.slice(0, this.config.maxRules)) {
      try {
        if (rule.condition(context)) {
          matches.push(rule.id);

          if (!this.config.continueAfterMatch) {
            break;
          }
        }
      } catch (error) {
        console.error(
          `DecisionTable: Error evaluating rule ${rule.id}:`,
              error
        );
      }
    }

    return matches;
  }

  /**
   * Create a decision table with default supervision rules
   */
  static withDefaults(): SupervisorDecisionTable {
    const table = new SupervisorDecisionTable({
      continueAfterMatch: false,
      defaultConfidence: 0.8,
    });

    // Add default rules for common supervision scenarios
    table.addRule({
      id: 'idle-agent-check',
      name: 'Check for idle agents',
      priority: 100,
      condition: (context: SupervisionContext) => {
        const now = Date.now();
        const idleThreshold = 5 * 60 * 1000; // 5 minutes

        return context.agents.some(
          (agent) =>
            agent.status === 'idle' &&
            now - agent.lastSeen.getTime() > idleThreshold
        );
      },
      action: {
        type: 'CHECK_MAIL',
        target: 'supervisor',
      },
      reasoning: 'Agent has been idle for more than 5 minutes, checking for new tasks',
      confidence: 0.9,
    });

    table.addRule({
      id: 'task-assignment',
      name: 'Assign available tasks to idle agents',
      priority: 90,
      condition: (context: SupervisionContext) => {
        const idleAgents = context.agents.filter((a) => a.status === 'idle');
        return idleAgents.length > 0;
      },
      action: {
        type: 'PICK_TASK',
        target: 'supervisor',
      },
      reasoning: 'Idle agents available, assigning tasks from queue',
      confidence: 0.85,
    });

    table.addRule({
      id: 'session-cleanup',
      name: 'Clean up expired sessions',
      priority: 80,
      condition: (context: SupervisionContext) => {
        const now = Date.now();
        const sessionTimeout = 60 * 60 * 1000; // 1 hour

        return context.sessions.some(
          (session) => now - session.startTime.getTime() > sessionTimeout
        );
      },
      action: {
        type: 'CLEANUP_SESSIONS',
        target: 'supervisor',
      },
      reasoning: 'Expired sessions detected, initiating cleanup',
      confidence: 0.95,
    });

    return table;
  }
}

/**
 * Create a new SupervisorDecisionTable with the given configuration
 */
export function createSupervisorDecisionTable(
  config?: DecisionTableConfig
): SupervisorDecisionTable {
  return new SupervisorDecisionTable(config);
}
