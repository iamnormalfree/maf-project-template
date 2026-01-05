// ABOUTME: Tracks context usage thresholds so agents can checkpoint before hitting limits.
// ABOUTME: Currently exposes the agreed 85/90/95 policy for future orchestrator logic.

export const CONTEXT_THRESHOLDS = {
  PREPARE: 0.85,
  GRACEFUL: 0.9,
  EMERGENCY: 0.95,
} as const;

export type ContextStage = keyof typeof CONTEXT_THRESHOLDS | 'SAFE';

export function getContextStage(usageRatio: number): ContextStage {
  if (usageRatio >= CONTEXT_THRESHOLDS.EMERGENCY) return 'EMERGENCY';
  if (usageRatio >= CONTEXT_THRESHOLDS.GRACEFUL) return 'GRACEFUL';
  if (usageRatio >= CONTEXT_THRESHOLDS.PREPARE) return 'PREPARE';
  return 'SAFE';
}
