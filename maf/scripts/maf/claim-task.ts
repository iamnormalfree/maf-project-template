#!/usr/bin/env -S node --import tsx

// ABOUTME: Main CLI entry point for MAF coordinator helper with comprehensive task claiming and lease management.
// ABOUTME: Integrates CLI service, parser, and MAF infrastructure for production-ready task coordination.

import { parseClaimTaskArgs, handleError, formatOutput, showUsage, validateArgs, verboseLog, requireAgentId } from '../../lib/maf/cli/cli-parser';
import { createMafCliService, type ClaimTaskResult, type ReadyTasksResult } from '../../lib/maf/cli/cli-service';
import { createFileBasedRuntimeState } from '../../lib/maf/core/runtime-state';
import { createMafCoordinator } from '../../lib/maf/core/coordinator';
import type { ClaimTaskCliArgs } from '../../lib/maf/cli/cli-parser';
import { createQuotaEnforcer, type QuotaEnforcementResult, type QuotaAwareCliArgs } from "../../lib/maf/profiles/quota-enforcer";
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Release task from a file
 */
async function handleReleaseOperation(releaseFile: string, args: ClaimTaskCliArgs): Promise<void> {
  if (!existsSync(releaseFile)) {
    throw new Error(`Release file not found: ${releaseFile}`);
  }

  try {
    const releaseData = JSON.parse(readFileSync(releaseFile, 'utf8'));

    // Create CLI service for release operation
    const service = createMafCliService({
      runtime: createFileBasedRuntimeState('.agent-mail'),
      beadsExecutable: 'node_modules/.bin/bd',
      agentMailRoot: '.agent-mail'
    });

    const agentId = releaseData.agentId || args.agentId;
    if (!agentId) {
      throw new Error('Agent ID is required for release operation');
    }

    // Release the specific lease
    const released = await service.releaseLease(releaseData.filePath, agentId);

    if (args.json) {
      console.log(JSON.stringify({
        success: released,
        filePath: releaseData.filePath,
        released: released ? 'Successfully released' : 'Failed to release'
      }, null, 2));
    } else {
      console.log(`🔓 ${released ? 'Successfully released' : 'Failed to release'} lease for ${releaseData.filePath}`);
    }

    process.exit(released ? 0 : 1);
  } catch (error) {
    throw new Error(`Failed to process release file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Format dry run output for ready tasks listing
 */
function formatDryRunOutput(result: ReadyTasksResult, args: ClaimTaskCliArgs): void {
  if (args.json) {
    const jsonOutput = {
      success: true,
      dry_run: true,
      message: result.message,
      ready_tasks: result.tasks.map(task => ({
        id: task.beadId,
        title: task.title,
        constraint: task.constraint,
        files: task.files || [],
        assigned_to: task.assignedAgent
      })),
      total_count: result.totalCount
    };

    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Human-readable dry run format
  console.log(`🔍 Dry Run: Available Tasks`);
  console.log('==========================');
  console.log('');

  if (result.tasks.length === 0) {
    console.log('ℹ️ No ready tasks available');
    console.log('');
    console.log('Suggestions:');
    console.log('  • Check if tasks need to be unblocked');
    console.log('  • Verify constraint filters match existing tasks');
    console.log('  • Ensure beads repository has ready issues');
    process.exit(2); // NO_TASKS_AVAILABLE exit code
    return;
  }

  console.log(`📊 Found ${result.totalCount} ready task${result.totalCount === 1 ? '' : 's'}:`);
  console.log('');

  result.tasks.forEach((task, index) => {
    console.log(`${index + 1}. ${task.beadId} - "${task.title}"`);
    console.log(`   🎯 Constraint: ${task.constraint || 'none'}`);
    if (task.assignedAgent) {
      console.log(`   👤 Assigned to: ${task.assignedAgent}`);
    }
    if (task.files && task.files.length > 0) {
      console.log(`   📁 Files: ${task.files.join(', ')}`);
    }
    console.log('');
  });

  // Verbose information
  if (args.verbose) {
    console.log('🔧 Debug Information:');
    console.log(`  • Total ready tasks: ${result.totalCount}`);
    console.log(`  • Constraint filters: ${args.labelFilters?.join(', ') || 'none'}`);
    console.log(`  • Agent mail root: .agent-mail`);
    console.log('');
  }
}

/**
 * Main execution function with comprehensive error handling
 */
async function main(): Promise<void> {
  try {
    // Parse CLI arguments
    const args = parseClaimTaskArgs(process.argv.slice(2));

    verboseLog('Starting MAF claim-task operation', args);

    // Handle help flag first
    if (args.help) {
      showUsage('claim-task');
      return;
    }

    // Handle release operation
    if (args.releaseFile) {
      await handleReleaseOperation(args.releaseFile, args);
      return;
    }

    // Validate arguments for normal operations
    validateArgs(args);

    // Extract and validate agent ID
    const agentId = requireAgentId(args.agentId);
    verboseLog(`Using agent ID: ${agentId}`, args);

    // Create CLI service with proper configuration
    const service = createMafCliService({
      runtime: createFileBasedRuntimeState('.agent-mail'),
      beadsExecutable: 'node_modules/.bin/bd',
      agentMailRoot: '.agent-mail'
    });

    verboseLog('CLI service created successfully', args);

    // Initialize quota enforcer for profile management
    const quotaEnforcer = createQuotaEnforcer({
      enabled: process.env.MAF_QUOTA_ENFORCEMENT !== 'false',
      enableFallback: process.env.MAF_QUOTA_FALLBACK !== 'false',
      mafStateRoot: '.maf/state'
    });

    await quotaEnforcer.initialize();
    verboseLog('Quota enforcer initialized successfully', args);

    // Check quota and select appropriate profile
    const quotaArgs: QuotaAwareCliArgs = {
      verbose: args.verbose,
      json: args.json,
      preferredProfile: process.env.CODEX_PROFILE
    };

    const quotaResult = await quotaEnforcer.checkQuotaAndSelectProfile(quotaArgs);
    verboseLog('Quota check completed for profile: ' + quotaResult.selectedProfile, args);

    // Display quota warnings if any
    if (quotaResult.warnings.length > 0 && !args.json) {
      console.log('');
      console.log('⚠️  Quota Warnings:');
      for (const warning of quotaResult.warnings) {
        console.log('   • ' + warning);
      }
      console.log('');
    }

    // Block operation if quota exceeded and no fallback available
    if (!quotaResult.allowed) {
      if (args.json) {
        const jsonOutput = {
          success: false,
          quota_check: {
            allowed: false,
            selected_profile: quotaResult.selectedProfile,
            health_indicator: quotaResult.healthIndicator,
            warnings: quotaResult.warnings,
            errors: quotaResult.errors,
            fallback_attempts: quotaResult.fallbackAttempts,
            profiles_checked: quotaResult.profilesChecked
          },
          message: 'Task claim blocked: All profiles have exceeded quota limits'
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else {
        console.log(quotaResult.healthIndicator + ' Task Claim Blocked: Quota Limits Exceeded');
        console.log('');
        console.log('Details:');
        console.log('   • Profiles checked: ' + quotaResult.profilesChecked.join(', '));
        console.log('   • Fallback attempts: ' + quotaResult.fallbackAttempts);
        if (quotaResult.errors.length > 0) {
          console.log('   • Errors:');
          for (const error of quotaResult.errors) {
            console.log('     - ' + error);
          }
        }
        console.log('');
        console.log('Suggestions:');
        console.log('   • Wait for quota reset (daily/weekly/monthly)');
        console.log('   • Use --dry-run to check task availability');
        console.log('   • Set CODEX_PROFILE to prefer a specific profile');
        console.log('   • Disable quota enforcement with MAF_QUOTA_ENFORCEMENT=false');
      }
      process.exit(6); // QUOTA_EXCEEDED
    }


    // Execute operation based on dry-run flag
    if (args.dryRun) {
      verboseLog('Executing dry run operation', args);
      const result = await service.listReadyTasks({
        labelFilters: args.labelFilters
      });
      formatDryRunOutput(result, args);

      // Display quota information for dry run (non-JSON mode)
      if (!args.json) {
        console.log("📊 Quota Status:");
        console.log("   • Profile: " + quotaResult.selectedProfile + " " + quotaResult.healthIndicator);
        if (quotaResult.quotaStatus) {
          const dailyUsage = quotaResult.quotaStatus.daily.percentage.toFixed(1);
          const weeklyUsage = quotaResult.quotaStatus.weekly.percentage.toFixed(1);
          console.log("   • Daily usage: " + dailyUsage + "% (" + quotaResult.quotaStatus.daily.used + "/" + quotaResult.quotaStatus.daily.limit + ")");
          console.log("   • Weekly usage: " + weeklyUsage + "% (" + quotaResult.quotaStatus.weekly.used + "/" + quotaResult.quotaStatus.weekly.limit + ")");
        }
        if (quotaResult.warnings.length > 0) {
          console.log("   • Warnings: " + quotaResult.warnings.length + " warning(s)");
        }
        console.log("");
      }
    } else {
      verboseLog('Executing claim task operation', args);
      const result = await service.claimTask({
        agentId,
        labelFilters: args.labelFilters,
        leaseDurationMs: 4 * 60 * 60 * 1000 // 4 hours
      });

      // Format and display output
      formatOutput(result, args);

      // Record quota usage for successful claims
      if (result.success && result.task) {
        try {
          await quotaEnforcer.recordUsage(quotaResult.selectedProfile, {
            task: result.task.beadId,
            agent: agentId
          });
          verboseLog('Quota usage recorded for profile: ' + quotaResult.selectedProfile, args);

      // Display quota status for successful claims (non-JSON mode)
      if (result.success && result.task && !args.json) {
        console.log("📊 Quota Status:");
        console.log("   • Profile: " + quotaResult.selectedProfile + " " + quotaResult.healthIndicator);
        if (quotaResult.quotaStatus) {
          const dailyUsage = quotaResult.quotaStatus.daily.percentage.toFixed(1);
          const weeklyUsage = quotaResult.quotaStatus.weekly.percentage.toFixed(1);
          console.log("   • Daily usage: " + dailyUsage + "% (" + quotaResult.quotaStatus.daily.used + "/" + quotaResult.quotaStatus.daily.limit + ")");
          console.log("   • Weekly usage: " + weeklyUsage + "% (" + quotaResult.quotaStatus.weekly.used + "/" + quotaResult.quotaStatus.weekly.limit + ")");
        }
        if (quotaResult.fallbackAttempts > 0) {
          console.log("   • Profile fallbacks: " + quotaResult.fallbackAttempts);
        }
        console.log("");
      }
        } catch (error) {
          // Don't fail the operation if quota recording fails
          console.warn('Warning: Failed to record quota usage:', error);
        }
      }


      // Set appropriate exit codes
      if (!result.success) {
        if (result.message.includes('No task could be claimed') ||
            result.message.includes('No tasks are currently ready')) {
          process.exit(2); // NO_TASKS_AVAILABLE
        } else if (result.leaseConflicts && result.leaseConflicts.length > 0) {
          process.exit(4); // LEASE_CONFLICTS
        } else {
          process.exit(1); // GENERAL_ERROR
        }
      }
    }

    verboseLog('Operation completed successfully', args);

  } catch (error) {
    // Handle all errors through the centralized error handler
    const args = parseClaimTaskArgs(process.argv.slice(2));
    handleError(error instanceof Error ? error : new Error(String(error)), args);
  }
}

/**
 * Handle uncaught exceptions and unhandled rejections gracefully
 */
process.on('uncaughtException', (error: Error) => {
  console.error('💥 Uncaught Exception:', error.message);
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('💥 Unhandled Rejection:', reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

/**
 * Handle termination signals gracefully
 */
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, terminating gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, terminating gracefully...');
  process.exit(0);
});

// Execute main function if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error in main():', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { main };
