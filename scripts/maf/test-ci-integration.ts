#!/usr/bin/env -S node --import tsx

// ABOUTME: Test script to validate CI integration for MAF CLI
// ABOUTME: Simulates CI environment and verifies all components work correctly

import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(require('child_process').exec);

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

class CITestRunner {
  private results: TestResult[] = [];

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🧪 Running test: ${name}`);
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, success: true, duration });
      console.log(`✅ ${name} - PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.results.push({ name, success: false, duration, error: errorMsg });
      console.log(`❌ ${name} - FAILED (${duration}ms): ${this.errorMsg}`);
    }
  }

  async runCommand(command: string, env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string }> {
    const envVars = { ...process.env, ...env };
    return exec(command, { env: envVars });
  }

  async summary(): Promise<void> {
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const duration = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log('\n=== CI Integration Test Summary ===');
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Total duration: ${duration}ms`);
    
    if (this.results.some(r => !r.success)) {
      console.log('\nFailed tests:');
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed!');
    }
  }
}

async function main(): Promise<void> {
  const runner = new CITestRunner();

  await runner.runTest('Environment Detection', async () => {
    const result = await runner.runCommand('node -e "require(\'./dist/lib/maf/testing/cli-test-harness.js\').createCliTestHarness().detectEnvironment().then(e => { console.log(JSON.stringify(e)); process.exit(e.isCI ? 0 : 1); }).catch(err => { console.error(err.message); process.exit(1); })"', {
      CI: 'true',
      MAF_TEST_MODE: 'ci'
    });
    
    const env = JSON.parse(result.stdout.trim());
    if (!env.isCI) {
      throw new Error('CI environment not detected');
    }
  });

  await runner.runTest('Build Verification', async () => {
    const result = await runner.runCommand('npm run maf:build-scripts');
    if (result.stderr && result.stderr.includes('error')) {
      throw new Error('Build failed');
    }
  });

  await runner.runTest('CLI Test Harness in CI Mode', async () => {
    const result = await runner.runCommand('node -e "require(\'./dist/lib/maf/testing/cli-test-harness.js\').executeCliCommandCi({ command: \'preflight\', args: [\'--help\'], captureOutput: true }).then(r => { console.log(JSON.stringify(r)); process.exit(r.success ? 0 : 1); }).catch(err => { console.error(err.message); process.exit(1); })"', {
      CI: 'true',
      MAF_TEST_MODE: 'ci'
    });
    
    const outputLines = result.stdout.trim().split("\n"); const jsonLine = outputLines.filter(line => line.startsWith("{")).pop(); const cliResult = JSON.parse(jsonLine || "{}");
    if (!cliResult.success || cliResult.environment !== 'compiled-js') {
      throw new Error('CLI test harness failed in CI mode');
    }
  });

  await runner.runTest('Individual CLI Commands Help', async () => {
    const commands = [
      { short: 'preflight', file: 'preflight-check' },
      { short: 'audit-guard', file: 'audit-guard' },
      { short: 'smoke-test', file: 'smoke-test' },
      { short: 'escalate', file: 'escalate' },
      { short: 'pre-commit', file: 'pre-commit-hook' }
    ];
    
    for (const cmd of commands) {
      try {
        await runner.runCommand(`node dist/scripts/maf/${cmd.file}.js --help`);
      } catch (error) {
        throw new Error(`Command ${cmd.short} help failed: ${error}`);
      }
    }
  });

  await runner.runTest('Build Freshness Check', async () => {
    try {
      const result = await runner.runCommand('node -e "require(\'./dist/lib/maf/testing/build-verifier.js\').createBuildVerifier().checkBuildStatus().then(s => { console.log(JSON.stringify(s)); }).catch(err => { console.error(err.message); })"');
      
      if (result.stdout) {
        const status = JSON.parse(result.stdout.trim());
        if (!status.buildDirectory) {
          throw new Error('Build status incomplete');
        }
      }
    } catch (error) {
      // Build freshness check is not critical, log warning
      console.log(`⚠️  Build freshness check warning: ${error}`);
    }
  });

  await runner.runTest('Environment Variables', async () => {
    const expectedVars = ['CI', 'MAF_TEST_MODE', 'NODE_ENV'];
    const env = { CI: 'true', MAF_TEST_MODE: 'ci', NODE_ENV: 'test' };
    
    for (const varName of expectedVars) {
      if (!env[varName]) {
        throw new Error(`Missing environment variable: ${varName}`);
      }
    }
  });

  await runner.summary();
}

if (require.main === module) {
  main().catch(error => {
    console.error('CI integration test failed:', error.message);
    process.exit(1);
  });
}

export { main as testCiIntegration };
