// ABOUTME: Tests for MAF CI gate decision logic and persistence (CAN-065).
// ABOUTME: Covers reviewer policies plus SQLite-backed review cycle escalation.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

import type { GateInput } from '../../../scripts/maf/ci/review-gates';
import {
  decide,
  evaluateGate,
  getReviewCyclesFromDb,
  requiresGpt5,
} from '../../../scripts/maf/ci/review-gates';

const schemaSql = readFileSync(join(__dirname, '../store/schema.sql'), 'utf8');

function createTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'maf-ci-gate-'));
  const dbPath = join(dir, 'maf.db');
  const db = new Database(dbPath);
  db.exec(schemaSql);
  db.close();
  return {
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedTask(dbPath: string, taskId: string) {
  const db = new Database(dbPath);
  const now = Date.now();
  db.prepare(
    `INSERT INTO tasks(id, state, priority, payload_json, created_at, updated_at, attempts, token_budget, cost_budget_cents, policy_label)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
  ).run(taskId, 'READY', 100, '{}', now, now, 0, 0, 0, 'private');
  db.close();
}

function restoreEnv(key: string, value: string | undefined) {
  if (typeof value === 'undefined') {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('MAF CI Review Gates', () => {
  describe('requiresGpt5', () => {
    it('requires GPT-5 when risk is HIGH', () => {
      expect(
        requiresGpt5({
          taskId: 'task-high-risk',
          risk: 'HIGH',
        }),
      ).toBe(true);
    });

    it('requires GPT-5 for HEAVY tier work even if risk is low', () => {
      expect(
        requiresGpt5({
          taskId: 'task-heavy',
          tier: 'HEAVY',
          risk: 'LOW',
        }),
      ).toBe(true);
    });

    it('requires GPT-5 when Tier-1 files are touched', () => {
      expect(
        requiresGpt5({
          taskId: 'task-tier1',
          tier1Files: ['lib/maf/core/coordinator.ts'],
        }),
      ).toBe(true);
    });

    it('does not require GPT-5 for medium risk without Tier-1 files', () => {
      expect(
        requiresGpt5({
          taskId: 'task-medium',
          tier: 'MEDIUM',
          risk: 'MEDIUM',
        }),
      ).toBe(false);
    });
  });

  describe('decide', () => {
    it('fails when codex summary is missing', () => {
      const result = decide({ taskId: 'missing-codex' });
      expect(result.pass).toBe(false);
      expect(result.code).toBe(3);
      expect(result.reason).toBe('codex summary missing');
    });

    it('fails when codex has blocking issues', () => {
      const result = decide({
        taskId: 'codex-blocking',
        codex: { issues: 2, blocking: 1 },
      });
      expect(result.pass).toBe(false);
      expect(result.code).toBe(1);
      expect(result.reason).toBe('codex blocking issues');
    });

    it('fails when GPT-5 is required but missing', () => {
      const result = decide({
        taskId: 'missing-gpt5',
        risk: 'HIGH',
        codex: { issues: 0, blocking: 0 },
      });
      expect(result.pass).toBe(false);
      expect(result.code).toBe(2);
      expect(result.reason).toBe('gpt5 review required but missing');
    });

    it('fails when GPT-5 has blocking issues', () => {
      const result = decide({
        taskId: 'gpt5-blocking',
        risk: 'HIGH',
        codex: { issues: 0, blocking: 0 },
        gpt5: { issues: 3, blocking: 1 },
      });
      expect(result.pass).toBe(false);
      expect(result.code).toBe(1);
      expect(result.reason).toBe('gpt5 blocking issues');
    });

    it('passes when codex and GPT-5 (if present) have no blocking issues', () => {
      const result = decide({
        taskId: 'clean-reviews',
        tier: 'LIGHT',
        codex: { issues: 1, blocking: 0 },
        gpt5: { issues: 2, blocking: 0 },
      });
      expect(result.pass).toBe(true);
      expect(result.code).toBe(0);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('review cycle persistence and escalation', () => {
    it('persists each attempt and escalates when total review cycles reach the threshold', async () => {
      const envDb = process.env.MAF_DB_PATH;
      const envThreshold = process.env.ESCALATION_THRESHOLD;
      const { dbPath, cleanup } = createTempDb();
      process.env.MAF_DB_PATH = dbPath;
      delete process.env.ESCALATION_THRESHOLD;

      const taskId = `task-${Date.now()}`;
      const baseInput: GateInput = {
        taskId,
        tier: 'MEDIUM',
        risk: 'LOW',
        codex: { issues: 0, blocking: 0 },
      };
      seedTask(dbPath, taskId);

      try {
        await evaluateGate({ ...baseInput });
        await evaluateGate({ ...baseInput });
        const third = await evaluateGate({ ...baseInput });

        expect(third.output.reviewCycles).toBe(3);
        expect(third.output.escalationRecommended).toBe(true);
        expect(third.output.escalationReason).toContain('Review cycles (3)');

        const cycles = await getReviewCyclesFromDb(taskId);
        expect(cycles).toBe(3);

        const db = new Database(dbPath);
        const attempts = db
          .prepare(
            `SELECT attempt FROM evidence WHERE task_id = ? AND verifier = 'gate' ORDER BY attempt`,
          )
          .all(taskId)
          .map((row: { attempt: number }) => row.attempt);
        db.close();

        expect(attempts).toEqual([0, 1, 2]);
      } finally {
        restoreEnv('MAF_DB_PATH', envDb);
        restoreEnv('ESCALATION_THRESHOLD', envThreshold);
        cleanup();
      }
    });
  });
});
