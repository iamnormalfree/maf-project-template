#!/usr/bin/env node
// ABOUTME: Entry point for MAF dashboard generation CLI.
// ABOUTME: Provides command-line interface for generating markdown dashboards.

import { runCli } from '../../lib/maf/dashboard/cli';

// Run the CLI
runCli().catch(error => {
  console.error('❌ Dashboard CLI failed:', error);
  process.exit(1);
});