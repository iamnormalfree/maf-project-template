#!/usr/bin/env node
// ABOUTME: Entry point for MAF (Multi-Agent Framework) orchestration scripts.
// ABOUTME: Provides routing to specific MAF management and testing utilities.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAF_SCRIPTS = {
  'bootstrap-agent-mail': 'bootstrap-agent-mail.sh',
  'test-beads-flow': 'test-beads-flow.sh',
  'health-check': 'health-check.mjs',
  'setup': 'setup.mjs'
};

function showUsage() {
  console.log('🚀 MAF (Multi-Agent Framework) Scripts');
  console.log('=====================================');
  console.log('');
  console.log('Available commands:');
  Object.entries(MAF_SCRIPTS).forEach(([name, script]) => {
    console.log(`  maf:${name.padEnd(20)} -> ${script}`);
  });
  console.log('');
  console.log('Usage:');
  console.log('  npm run maf:<command>');
  console.log('  node scripts/maf/index.mjs <command>');
  console.log('');
  process.exit(1);
}

function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, scriptName);
  
  try {
    const child = spawn(scriptPath, args, {
      stdio: 'inherit',
      env: { ...process.env },
      shell: scriptName.endsWith('.sh')
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });

    child.on('error', (error) => {
      console.error(`❌ Failed to run script: ${scriptName}`);
      console.error(error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error(`❌ Script error: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  showUsage();
}

if (MAF_SCRIPTS[command]) {
  runScript(MAF_SCRIPTS[command], args);
} else {
  console.error(`❌ Unknown command: ${command}`);
  showUsage();
}
