

// ABOUTME: Guarded demo script that seeds a SQLite DB with MAF schema and demonstrates task lifecycle.
// ABOUTME: Creates runtime/maf.db, applies schema.sql, runs READY→LEASED→RUNNING→VERIFYING→COMMITTED walkthrough.

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { mafTop } from '../../lib/maf/cli/top';
import { createMafEventLogger } from '../../lib/maf/events/event-logger';
import { runVerifications } from '../../lib/maf/verify/registry';
import { Scheduler } from '../../lib/maf/core/scheduler';

async function ensureBetterSqlite() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('better-sqlite3');
  } catch (err) {
    console.error('better-sqlite3 is not installed.');
    console.error('Install prerequisites (build tools), then:');
    console.error('  npm install better-sqlite3 --save-dev');
    process.exit(2);
  }
}

async function main() {
  await ensureBetterSqlite();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DB = require('better-sqlite3');

  const dbPath = process.env.MAF_DB_PATH || 'runtime/maf.db';
  if (!existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DB(dbPath);

  // Apply schema
  const schema = readFileSync('lib/maf/store/schema.sql', 'utf8');
  db.exec(schema);

  // Seed demo tasks with complete lifecycle walkthrough
  const count = db.prepare(`SELECT COUNT(*) as c FROM tasks`).get()?.c ?? 0;
  if (count === 0) {
    await runLifecycleWalkthrough(db);
  }

  console.log('\\n🎯 Demo complete. Final task counts:');
  mafTop(dbPath);
}

async function runLifecycleWalkthrough(db: any) {
  console.log('\\n🚀 Starting MAF Task Lifecycle Walkthrough');
  console.log('=====================================');

  const now = Date.now();

  // Create event logger and scheduler
  const eventLogger = createMafEventLogger(db);
  const scheduler = new Scheduler(db);

  // Insert initial READY task
  const taskId = 'demo-workflow-001';
  const payload = {
    tags: ['uncertainty:high:code', 'coverage:git-diff'],
    workdir: process.cwd(),
    files: ['lib/maf/demo-file.ts']
  };

  const ins = db.prepare(
    `INSERT INTO tasks(id, state, priority, payload_json, created_at, updated_at, attempts, token_budget, cost_budget_cents, policy_label)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
  );
  ins.run(taskId, 'READY', 100, JSON.stringify(payload), now, now, 0, 0, 0, 'private');

  console.log('\\n✅ 1. READY → Task created and ready for work');
  console.log(`   Task ID: ${taskId}`);
  console.log(`   Tags: ${payload.tags.join(', ')}`);

  // Step 1: Claim the task (READY → LEASED)
  console.log('\\n🔒 2. CLAIMING → Agent claims task lease');
  const lease = scheduler.reserve('demo-agent-001', 30000);
  if (!lease) {
    throw new Error('Failed to claim task lease');
  }
  console.log(`   Lease obtained for task: ${lease.task.id}`);
  console.log(`   Agent: demo-agent-001`);
  console.log(`   Lease expires: ${new Date(lease.lease_expires_at).toISOString()}`);

  // Step 2: Start work (LEASED → RUNNING)
  console.log('\\n▶️  3. RUNNING → Agent starts task execution');
  scheduler.start(taskId);
  console.log(`   Task ${taskId} is now RUNNING`);
  console.log(`   Event logged: RUNNING`);

  // Simulate work completion after a delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Step 3: Enter verification (RUNNING → VERIFYING)
  console.log('\\n🔍 4. VERIFYING → Task enters verification phase');
  scheduler.verifying(taskId);
  console.log(`   Task ${taskId} is now VERIFYING`);
  console.log(`   Event logged: VERIFYING`);

  // Step 4: Run verification with evidence capture
  console.log('\\n✓ 5. VERIFICATION → Running metacognitive tag verifiers');
  console.log('   Running verifiers: uncertainty:high:code, coverage:git-diff');

  const verificationResult = await runVerifications(payload.tags, {
    workdir: payload.workdir,
    payload
  });

  console.log(`   Verification result: ${verificationResult.pass ? '✅ PASS' : '❌ FAIL'}`);
  verificationResult.results.forEach(result => {
    console.log(`   - ${result.tag}: ${result.result}`);
    if (result.result === 'FAIL') {
      console.log(`     Details: ${JSON.stringify(result.details, null, 6).split('\\n').join('\\n     ')}`);
    }
  });

  // Step 5: Complete task (VERIFYING → COMMITTED)
  if (verificationResult.pass) {
    console.log('\\n✅ 6. COMMITTED → Task completed successfully');
    scheduler.committed(taskId);
    console.log(`   Task ${taskId} is now COMMITTED`);
    console.log(`   Event logged: COMMITTED`);
    console.log(`   Evidence recorded: ${JSON.stringify(verificationResult.results)}`);

    // Final step: Mark as DONE
    const doneUpdate = db.prepare(`UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?`);
    doneUpdate.run('DONE', Date.now(), taskId);
    console.log(`   Task ${taskId} is now DONE (terminal state)`);
  } else {
    console.log('\\n❌ 6. ROLLBACK → Task failed verification, rolling back');
    scheduler.error(taskId, new Error('Verification failed'), { step: 'verification', retryable: true });
    console.log(`   Task ${taskId} rolled back to READY`);
    console.log(`   Event logged: ERROR with context`);
  }

  // Display event history for the demo task
  console.log('\\n📋 7. EVENT HISTORY → Complete task lifecycle events');
  const events = scheduler.getTaskEvents(taskId);
  console.log(`   Total events for task ${taskId}: ${events.length}`);
  events.forEach((event, index) => {
    const timestamp = new Date(event.ts).toISOString();
    let dataDisplay = '{}';
    try {
      dataDisplay = event.data_json ? JSON.stringify(JSON.parse(event.data_json)) : '{}';
    } catch (parseError) {
      dataDisplay = event.data_json || '{}';
    }
    console.log(`   ${index + 1}. [${timestamp}] ${event.kind} - ${dataDisplay}`);
  });

  console.log('\\n🎉 Lifecycle walkthrough complete!');
  console.log('   Ready → Claimed → Running → Verifying → Committed → Done');
  console.log('   All events logged to SQLite events table');
  console.log('   Verification evidence captured and stored');
}

main().catch((e) => {
  console.error('maf:demo-sqlite failed:', e?.message || e);
  process.exit(1);
});

