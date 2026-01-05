#!/usr/bin/env node
// ABOUTME: Health check script for MAF (Multi-Agent Framework) systems.
// ABOUTME: Validates all MAF components are properly configured and operational.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

const checks = [
  {
    name: 'MAF Core Directory',
    check: () => existsSync(join(PROJECT_ROOT, 'lib', 'maf', 'index.ts')),
    critical: true
  },
  {
    name: 'MAF Beads Integration',
    check: () => existsSync(join(PROJECT_ROOT, 'lib', 'maf', 'beads')),
    critical: true
  },
  {
    name: 'MAF Scheduler Module',
    check: () => existsSync(join(PROJECT_ROOT, 'lib', 'maf', 'scheduling')),
    critical: false
  },
  {
    name: 'MAF Supervisor Module',
    check: () => existsSync(join(PROJECT_ROOT, 'lib', 'maf', 'supervision')),
    critical: false
  },
  {
    name: 'Beads CLI',
    check: () => {
      try {
        const version = execSync('bd --version', { encoding: 'utf8' });
        return version.includes('bd version');
      } catch {
        return false;
      }
    },
    critical: true
  },
  {
    name: 'Package.json MAF Scripts',
    check: () => {
      try {
        const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
        return packageJson.scripts && Object.keys(packageJson.scripts).some(key => key.startsWith('maf:'));
      } catch {
        return false;
      }
    },
    critical: false
  }
];

async function runHealthCheck() {
  console.log('🏥 MAF Health Check');
  console.log('==================');
  console.log('');

  let passed = 0;
  let failed = 0;
  let criticalFailures = 0;

  for (const check of checks) {
    try {
      const result = check.check();
      const status = result ? '✅' : '❌';
      const type = check.critical ? 'CRITICAL' : 'WARNING';
      
      console.log(`${status} ${check.name.padEnd(25)} ${result ? 'PASS' : `FAIL (${type})`}`);
      
      if (result) {
        passed++;
      } else {
        failed++;
        if (check.critical) {
          criticalFailures++;
        }
      }
    } catch (error) {
      console.error(`❌ ${check.name.padEnd(25)} ERROR (${error.message})`);
      failed++;
      if (check.critical) criticalFailures++;
    }
  }

  console.log('');
  console.log('📊 Summary');
  console.log('==========');
  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Critical: ${criticalFailures}`);
  console.log('');

  if (criticalFailures > 0) {
    console.error('❌ CRITICAL FAILURES - MAF system not operational');
    process.exit(1);
  } else if (failed > 0) {
    console.warn('⚠️  Some checks failed - MAF may have reduced functionality');
    process.exit(2);
  } else {
    console.log('✅ All checks passed - MAF system healthy');
    process.exit(0);
  }
}

runHealthCheck().catch(error => {
  console.error('❌ Health check failed:', error.message);
  process.exit(1);
});
