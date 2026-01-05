#!/usr/bin/env node
// ABOUTME: Validates that the beads CLI version matches the expected value.
// ABOUTME: Helps prevent coordination drift before the full orchestrator is implemented.

import { execSync } from 'node:child_process';

const EXPECTED_VERSION = '0.22.1';

try {
  const versionOutput = execSync('bd --version', { encoding: 'utf8' });
  const match = versionOutput.match(/bd version (\d+\.\d+\.\d+)/);

  if (!match) {
    console.error('❌ Could not parse beads CLI version.');
    process.exit(1);
  }

  const actualVersion = match[1];

  if (actualVersion !== EXPECTED_VERSION) {
    console.error(`❌ beads CLI version mismatch. Expected ${EXPECTED_VERSION}, found ${actualVersion}.`);
    process.exit(1);
  }

  console.log(`✅ beads integrity verified (CLI version ${EXPECTED_VERSION}).`);
} catch (error) {
  console.error('❌ beads CLI is not installed or not accessible. Run `npm install -g @beads/bd`.');
  process.exit(1);
}
