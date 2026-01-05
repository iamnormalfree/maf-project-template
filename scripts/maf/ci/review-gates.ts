#!/usr/bin/env -S node --import tsx

// ABOUTME: CI gate script for MAF commit policy (Codex first, GPT‑5 on risk).
// ABOUTME: Reads JSON input, decides pass/fail, optionally records evidence in SQLite.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ReviewerSummary = { issues: number; blocking: number; notes?: any[] } | undefined;
export type GateInput = {
  taskId: string;
  tier?: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL';
  risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  tier1Files?: string[];
  codex?: ReviewerSummary;
  gpt5?: ReviewerSummary;
  evidence?: any[];
  reviewCycles?: number;
};
export type GateDecision = {
  pass: boolean;
  code: number;
  reason?: string;
  escalationRecommended?: boolean;
  escalationReason?: string;
};
export type GateOutput = {
  success: boolean;
  code: number;
  reason: string | null;
  escalationRecommended: boolean;
  escalationReason: string | null;
  reviewCycles: number;
};

const GATE_VERIFIER = 'gate';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stdin') args.stdin = true;
    else if (a === '--input' && i + 1 < argv.length) {
      args.input = argv[++i];
    }
  }
  return args;
}

function requiresGpt5(input: GateInput): boolean {
  const tier1 = (input.tier1Files || []).length > 0;
  return input.risk === 'HIGH' || input.tier === 'HEAVY' || input.tier === 'FULL' || tier1;
}

// Query SQLite for existing review gate evidence to count review cycles
async function getReviewCyclesFromDb(taskId: string): Promise<number> {
  const dbPath = process.env.MAF_DB_PATH || 'runtime/maf.db';
  let db: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DB = require('better-sqlite3');
    db = new DB(dbPath);
    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM evidence
       WHERE task_id = ? AND verifier = ?`
    );
    const result = stmt.get(taskId, GATE_VERIFIER) as { count: number } | undefined;
    return result?.count || 0;
  } catch (_) {
    // SQLite not available
    return 0;
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {
        // ignore close errors
      }
    }
  }
}

function decide(input: GateInput): GateDecision {
  const codex = input.codex;
  if (!codex) return { pass: false, code: 3, reason: 'codex summary missing' };
  if (codex.blocking && codex.blocking > 0) return { pass: false, code: 1, reason: 'codex blocking issues' };

  const needGpt5 = requiresGpt5(input);
  if (needGpt5) {
    if (!input.gpt5) return { pass: false, code: 2, reason: 'gpt5 review required but missing' };
    if (input.gpt5.blocking && input.gpt5.blocking > 0) return { pass: false, code: 1, reason: 'gpt5 blocking issues' };
  }

  return { pass: true, code: 0 };
}

async function writeEvidenceIfPossible(input: GateInput, decision: GateDecision) {
  const dbPath = process.env.MAF_DB_PATH || 'runtime/maf.db';
  let db: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DB = require('better-sqlite3');
    db = new DB(dbPath);
    const now = Date.now();
    const attemptStmt = db.prepare(
      `SELECT COALESCE(MAX(attempt), -1) + 1 AS next_attempt
       FROM evidence
       WHERE task_id = ? AND verifier = ?`,
    );
    const attemptRow = attemptStmt.get(input.taskId, GATE_VERIFIER) as { next_attempt?: number } | undefined;
    const attempt =
      typeof attemptRow?.next_attempt === 'number' && Number.isFinite(attemptRow.next_attempt)
        ? attemptRow.next_attempt
        : 0;
    const details = {
      codex: input.codex || null,
      gpt5: input.gpt5 || null,
      risk: input.risk || 'LOW',
      tier: input.tier || 'LIGHT',
      tier1Files: input.tier1Files || [],
      reviewCycles: typeof input.reviewCycles === 'number' ? input.reviewCycles : null,
      decision: {
        pass: decision.pass,
        code: decision.code,
        reason: decision.reason || null,
        escalationRecommended: decision.escalationRecommended || false,
        escalationReason: decision.escalationReason || null,
      },
      evidence: input.evidence || [],
    };
    db.prepare(
      `INSERT INTO evidence(task_id, attempt, verifier, result, details_json)
       VALUES(?,?,?,? ,json(?))`,
    ).run(input.taskId, attempt, GATE_VERIFIER, decision.pass ? 'PASS' : 'FAIL', JSON.stringify(details));
    db.prepare(`INSERT INTO events(task_id, ts, kind, data_json) VALUES(?,?,?,json(?))`).run(
      input.taskId,
      now,
      'REVIEW_GATE',
      JSON.stringify({
        code: decision.code,
        reason: decision.reason || null,
        escalationRecommended: decision.escalationRecommended || false,
        escalationReason: decision.escalationReason || null,
      }),
    );
  } catch (_) {
    // sqlite not available; ignore
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {
        // ignore close errors
      }
    }
  }
}

export async function evaluateGate(input: GateInput): Promise<{ decision: GateDecision; output: GateOutput }> {
  const normalizedInput: GateInput = { ...input };
  const decision = decide(normalizedInput);
  const escalationThreshold = parseInt(process.env.ESCALATION_THRESHOLD || '3');
  const resolvedReviewCycles =
    typeof normalizedInput.reviewCycles === 'number'
      ? normalizedInput.reviewCycles
      : (await getReviewCyclesFromDb(normalizedInput.taskId)) + 1;
  normalizedInput.reviewCycles = resolvedReviewCycles;

  if (resolvedReviewCycles >= escalationThreshold) {
    decision.escalationRecommended = true;
    decision.escalationReason = `Review cycles (${resolvedReviewCycles}) >= escalation threshold (${escalationThreshold})`;
  } else {
    decision.escalationRecommended = false;
    delete decision.escalationReason;
  }

  await writeEvidenceIfPossible(normalizedInput, decision);

  const output: GateOutput = {
    success: decision.pass,
    code: decision.code,
    reason: decision.reason || null,
    escalationRecommended: decision.escalationRecommended || false,
    escalationReason: decision.escalationReason || null,
    reviewCycles: resolvedReviewCycles,
  };

  return { decision, output };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let raw = '';
  if (args.stdin) {
    raw = await new Promise<string>((resolve, reject) => {
      let s = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (s += c));
      process.stdin.on('end', () => resolve(s));
      process.stdin.on('error', (e) => reject(e));
    });
  } else if (typeof args.input === 'string') {
    raw = readFileSync(String(args.input), 'utf8');
  } else {
    console.error('Provide --stdin or --input <file>');
    process.exit(3);
  }

  let input: GateInput;
  try {
    input = JSON.parse(raw);
  } catch (e: any) {
    console.error('INVALID_INPUT: JSON parse failed:', e?.message || e);
    process.exit(3);
    return;
  }

  if (!input.taskId) {
    console.error('INVALID_INPUT: taskId required');
    process.exit(3);
  }

  const { decision, output } = await evaluateGate(input);
  console.log(JSON.stringify(output));
  process.exit(decision.code);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Gate failed:', e?.message || e);
    process.exit(1);
  });
}

export { parseArgs, requiresGpt5, decide, getReviewCyclesFromDb };
