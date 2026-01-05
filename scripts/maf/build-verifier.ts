#!/usr/bin/env -S node --import tsx
// ABOUTME: Enhanced build verification script for MAF CLI testing
// ABOUTME: Provides build status checking and validation for CI environments

import { argv } from "process";
import { createBuildVerifier, rebuildWithValidationIfNeeded } from "../../lib/maf/testing/build-verifier";

async function main() {
  const command = argv[2];
  
  try {
    switch (command) {
      case "check":
        const verifier = createBuildVerifier();
        const status = await verifier.checkBuildStatus();
        console.log(JSON.stringify(status, null, 2));
        
        // Exit with non-zero code if build needs rebuild
        if (status.needsRebuild) {
          process.exit(1);
        }
        break;
        
      case "rebuild":
        const didRebuild = await rebuildWithValidationIfNeeded();
        console.log(didRebuild ? "Build updated" : "Build fresh");
        break;
        
      case "verify":
        const verifier2 = createBuildVerifier();
        const isStale = await verifier2.isBuildStale();
        console.log(isStale ? "Build is stale" : "Build is fresh");
        
        if (isStale) {
          process.exit(1);
        }
        break;
        
      default:
        console.error("Usage: tsx scripts/maf/build-verifier.ts <check|rebuild|verify>");
        process.exit(1);
    }
  } catch (error) {
    console.error("Build verifier error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
