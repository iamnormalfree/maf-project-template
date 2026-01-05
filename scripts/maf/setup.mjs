#!/usr/bin/env node
// ABOUTME: Setup script for MAF (Multi-Agent Framework) dependencies and configuration.
// ABOUTME: Ensures all required tools and configurations are properly initialized.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

const setupSteps = [
  {
    name: 'Create MAF Working Directories',
    action: () => {
      const dirs = [
        join(PROJECT_ROOT, '.maf'),
        join(PROJECT_ROOT, '.maf', 'agents'),
        join(PROJECT_ROOT, '.maf', 'state'),
        join(PROJECT_ROOT, '.maf', 'logs')
      ];
      
      dirs.forEach(dir => {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        }
      });
      return true;
    },
    critical: true
  },
  {
    name: 'Verify Beads CLI Installation',
    action: () => {
      try {
        const version = execSync('bd --version', { encoding: 'utf8' });
        if (!version.includes('0.22.1')) {
          throw new Error(`Expected beads version 0.22.1, found ${version}`);
        }
        console.log(`Beads CLI verified: ${version.trim()}`);
        return true;
      } catch (error) {
        console.error('❌ Beads CLI issue:', error.message);
        console.log('To install: npm install -g @beads/bd');
        return false;
      }
    },
    critical: true
  },
  {
    name: 'Create MAF Configuration',
    action: () => {
      const configPath = join(PROJECT_ROOT, '.maf', 'config.json');
      if (!existsSync(configPath)) {
        const config = {
          version: '1.0.0',
          created: new Date().toISOString(),
          agents: {},
          scheduler: {
            max_concurrent_agents: 5,
            heartbeat_interval: 30000
          },
          supervision: {
            enabled: true,
            health_check_interval: 60000
          }
        };
        
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('Created MAF configuration:', configPath);
      }
      return true;
    },
    critical: false
  },
  {
    name: 'Verify Node.js Dependencies',
    action: () => {
      try {
        execSync('npm list --depth=0 >/dev/null 2>&1', { cwd: PROJECT_ROOT });
        console.log('Node.js dependencies verified');
        return true;
      } catch (error) {
        console.warn('⚠️  Dependency check failed - consider running npm install');
        return false;
      }
    },
    critical: false
  }
];

async function runSetup() {
  console.log('🔧 MAF Setup');
  console.log('============');
  console.log('');

  let passed = 0;
  let failed = 0;
  let criticalFailures = 0;

  for (const step of setupSteps) {
    console.log(`🔄 ${step.name}...`);
    
    try {
      const result = step.action();
      
      if (result) {
        console.log(`✅ ${step.name} - COMPLETED`);
        passed++;
      } else {
        console.log(`❌ ${step.name} - FAILED`);
        failed++;
        if (step.critical) criticalFailures++;
      }
    } catch (error) {
      console.error(`❌ ${step.name} - ERROR: ${error.message}`);
      failed++;
      if (step.critical) criticalFailures++;
    }
    
    console.log('');
  }

  console.log('📊 Setup Summary');
  console.log('=================');
  console.log(`Completed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Critical: ${criticalFailures}`);
  console.log('');

  if (criticalFailures > 0) {
    console.error('❌ CRITICAL SETUP FAILURES - MAF not ready');
    console.log('Please resolve critical failures before using MAF.');
    process.exit(1);
  } else if (failed > 0) {
    console.warn('⚠️  Some setup steps failed - MAF may have reduced functionality');
    console.log('Consider resolving warnings for optimal performance.');
    process.exit(2);
  } else {
    console.log('✅ MAF setup completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('- Run health check: npm run maf:health-check');
    console.log('- Bootstrap agents: npm run maf:bootstrap-agent-mail');
    console.log('- Test integration: npm run maf:test-beads-flow');
    process.exit(0);
  }
}

runSetup().catch(error => {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
});
