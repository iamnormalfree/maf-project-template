#!/usr/bin/env -S node --import tsx

// ABOUTME: CI-specific build verification script for MAF CLI
// ABOUTME: Ensures all required scripts are built and ready for CI execution

import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

interface BuildVerificationResult {
  success: boolean;
  requiredFiles: Array<{
    path: string;
    exists: boolean;
    executable: boolean;
  }>;
  buildOutput: string;
  error?: string;
}

const REQUIRED_SCRIPTS = [
  'scripts/maf/preflight-check.ts',
  'scripts/maf/audit-guard.ts',
  'scripts/maf/smoke-test.ts',
  'scripts/maf/escalate.ts',
  'scripts/maf/pre-commit-hook.ts',
  'scripts/maf/ci/review-gates.ts',
  'scripts/maf/enhanced-build-integration.ts'
];

const COMPILED_TARGETS = [
  'dist/scripts/maf/preflight-check.js',
  'dist/scripts/maf/audit-guard.js',
  'dist/scripts/maf/smoke-test.js',
  'dist/scripts/maf/escalate.js',
  'dist/scripts/maf/pre-commit-hook.js',
  'dist/scripts/maf/ci/review-gates.js',
  'dist/scripts/maf/enhanced-build-integration.js',
  // Testing framework files
  'dist/lib/maf/testing/cli-test-harness.js',
  'dist/lib/maf/testing/build-verifier.js',
  'dist/lib/maf/testing/build-verifier-enhanced.js',
  'dist/lib/maf/testing/types.js'
];

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function checkFileExists(path: string): Promise<boolean> {
  return access(path, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

function checkFileExecutable(path: string): Promise<boolean> {
  return access(path, constants.X_OK)
    .then(() => true)
    .catch(() => false);
}

async function verifySourceFiles(): Promise<Array<{ path: string; exists: boolean }>> {
  log('Verifying source files exist...');
  
  const results = [];
  for (const script of REQUIRED_SCRIPTS) {
    const exists = await checkFileExists(script);
    results.push({ path: script, exists });
    
    if (!exists) {
      log(`Missing source file: ${script}`, 'error');
    } else {
      log(`Found source: ${script}`);
    }
  }
  
  return results;
}

async function verifyCompiledFiles(): Promise<Array<{ path: string; exists: boolean; executable: boolean }>> {
  log('Verifying compiled files exist and are executable...');
  
  const results = [];
  for (const target of COMPILED_TARGETS) {
    const exists = await checkFileExists(target);
    const executable = exists ? await checkFileExecutable(target) : false;
    
    results.push({ path: target, exists, executable });
    
    if (!exists) {
      log(`Missing compiled file: ${target}`, 'error');
    } else if (!executable) {
      log(`Compiled file not executable: ${target}`, 'warn');
    } else {
      log(`Found compiled target: ${target}`);
    }
  }
  
  return results;
}

function buildScripts(): { success: boolean; output: string; error?: string } {
  log('Building MAF scripts...');
  
  try {
    const output = execSync('npm run maf:build-scripts', { 
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    log('Build completed successfully');
    return { success: true, output };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    log(`Build failed: ${errorMsg}`, 'error');
    return { 
      success: false, 
      output: error?.stdout || '',
      error: errorMsg 
    };
  }
}

function verifyBuildFreshness(): { isFresh: boolean; output: string } {
  log('Verifying build freshness...');
  
  try {
    const output = execSync('node -e "require(\'./dist/lib/maf/testing/build-verifier.js\').createBuildVerifier().checkBuildStatus().then(s => console.log(JSON.stringify(s))).catch(e => { console.error(e.message); process.exit(1); })"', {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    try {
      const status = JSON.parse(output.trim());
      if (status.isFresh) {
        log('Build is fresh');
        return { isFresh: true, output };
      } else {
        log('Build is stale', 'warn');
        return { isFresh: false, output };
      }
    } catch {
      log('Could not parse build status output', 'warn');
      return { isFresh: false, output };
    }
  } catch (error: any) {
    log(`Build freshness check failed: ${error.message}`, 'warn');
    return { isFresh: false, output: '' };
  }
}

async function main(): Promise<void> {
  log('Starting CI build verification for MAF CLI');
  log(`Working directory: ${process.cwd()}`);
  log(`Node version: ${process.version}`);
  
  // Verify source files exist
  const sourceResults = await verifySourceFiles();
  const missingSources = sourceResults.filter(r => !r.exists);
  
  if (missingSources.length > 0) {
    log(`Missing ${missingSources.length} source files`, 'error');
    process.exit(1);
    return;
  }
  
  // Build scripts
  const buildResult = buildScripts();
  if (!buildResult.success) {
    log('Build failed, cannot continue', 'error');
    if (buildResult.error) {
      console.error('Build error details:', buildResult.error);
    }
    process.exit(1);
    return;
  }
  
  // Verify compiled files
  const compiledResults = await verifyCompiledFiles();
  const missingCompiled = compiledResults.filter(r => !r.exists);
  const nonExecutable = compiledResults.filter(r => r.exists && !r.executable);
  
  if (missingCompiled.length > 0) {
    log(`Missing ${missingCompiled.length} compiled files`, 'error');
    process.exit(1);
    return;
  }
  
  if (nonExecutable.length > 0) {
    log(`${nonExecutable.length} compiled files are not executable`, 'warn');
  }
  
  // Verify build freshness
  const freshnessResult = verifyBuildFreshness();
  if (!freshnessResult.isFresh) {
    log('Build may be stale, but files exist', 'warn');
  }
  
  // Final verification result
  const result: BuildVerificationResult = {
    success: true,
    requiredFiles: compiledResults,
    buildOutput: buildResult.output
  };
  
  log('CI build verification completed successfully');
  log(`Verified ${result.requiredFiles.length} compiled targets`);
  
  // Optional: output JSON for CI consumption
  if (process.env.CI && process.env.OUTPUT_BUILD_STATUS === 'json') {
    console.log('\n=== BUILD VERIFICATION JSON ===');
    console.log(JSON.stringify(result, null, 2));
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    log(`CI build verification failed: ${error.message}`, 'error');
    process.exit(1);
  });
}

export { main as verifyBuildForCi };
export type { BuildVerificationResult };
