#!/usr/bin/env -S node --import tsx
// ABOUTME: TypeScript CLI entry point for MAF preflight validation
// ABOUTME: Direct executable for the preflight check system

import { runPreflightCli } from '../../lib/maf/preflight-coordinator';

// Run the CLI with all command line arguments
runPreflightCli(process.argv.slice(2)).catch((error) => {
  console.error('Preflight check failed:', error);
  process.exit(2);
});
