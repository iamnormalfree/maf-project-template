
// ABOUTME: CLI entry that prints a compact view of tasks by state from SQLite.
// ABOUTME: Enhanced version with support for agents, quotas, recent events, and filtering.
// ABOUTME: Guards for missing better-sqlite3 and prints a helpful message.
// ABOUTME: Supports --json flag for structured output and new filtering flags.

import { mafTop, MafTopOptions, validateErrorFunctionality } from '../../lib/maf/cli/top';

function parseArguments(): MafTopOptions {
  const args = process.argv.slice(2);
  const options: MafTopOptions = {
    json: false,
    agents: false,
    quotas: false,
    errors: false
  };

  // Prefer runtime DB path if present
  options.dbPath = process.env.MAF_DB_PATH || 'runtime/maf.db';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--json':
        options.json = true;
        break;
        
      case '--agents':
        options.agents = true;
        break;
        
      case '--quotas':
        options.quotas = true;
        break;
        
      case '--recent':
        i++;
        const recentValue = args[i];
        if (recentValue && /^\d+$/.test(recentValue)) {
          options.recent = parseInt(recentValue, 10);
        } else {
          throw new Error('Invalid value for --recent: must be a positive integer');
        }
        break;
        
      case '--kind':
        i++;
        const kindValue = args[i];
        if (!kindValue) {
          throw new Error('Missing value for --kind flag');
        }
        options.kind = kindValue;
        break;
        
      case '--category':
        i++;
        const categoryValue = args[i];
        if (!categoryValue) {
          throw new Error('Missing value for --category flag');
        }
        options.category = categoryValue;
        break;

      case '--errors':
        options.errors = true;
        break;
        
      case '--help':
      case '-h':
        displayUsage();
        process.exit(0);
        break;

      case '--validate-errors':
        // Development flag to test error functionality validation
        const isValid = validateErrorFunctionality();
        console.log('Error functionality validation:', isValid ? '✅ PASSED' : '❌ FAILED');
        process.exit(isValid ? 0 : 1);
        break;
        
      default:
        if (arg.startsWith('--')) {
          throw new Error('Unknown flag: ' + arg + '. Use --help for available options.');
        }
        // Legacy behavior: treat non-flag arguments as dbPath
        if (!arg.startsWith('-') && i === 0) {
          options.dbPath = arg;
        }
        break;
    }
  }

  return options;
}

function displayUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`
MAF Top - System Status Dashboard

USAGE:
  maf top [options] [db-path]
  maf top --help

OPTIONS:
  --json              Output JSON instead of formatted tables
  --recent <N>        Show last N events (max 1000)
  --kind <types>      Filter events by kind (comma-separated)
                      Valid: claimed,running,verifying,committed,error,heartbeat_renew_failure,heartbeat_missed,lease_expired
  --agents            Show agent status and information
  --quotas            Show quota status and usage
  --category <cats>   Filter events by category (comma-separated)
                      Valid: task,agent,quota,system,reservation
  --errors            Show error summary with time-based aggregation and failure analysis
  --help, -h          Show this help message

EXAMPLES:
  maf top                           # Basic task summary (legacy behavior)
  maf top --json                    # JSON output with task summary
  maf top --agents                  # Task summary + agent information
  maf top --quotas                  # Task summary + quota information
  maf top --recent 50               # Task summary + last 50 events
  maf top --recent 20 --kind claimed,error  # Filtered recent events
  maf top --agents --quotas --json  # Full system status as JSON
  maf top --recent 100 --category task,agent  # Events by category
  maf top --errors                  # Task summary + error statistics
  maf top --errors --json           # Error summary as JSON
  maf top --errors --recent 50      # Error summary + recent events with errors

DATABASE:
  Default path: runtime/maf.db
  Override with: MAF_DB_PATH environment variable or positional argument

FILTERING:
  --kind and --category accept comma-separated values
  Filters apply only to recent events, not to task/agent/quota/error summaries
  Use with --recent flag to see filtered event streams

ERROR ANALYSIS:
  --errors flag provides time-based aggregation (last hour, last 24h)
  Shows failure reason analysis for ERROR events with pattern matching
  Includes error type analysis and most recent occurrence timestamps
`);
}

async function main() {
  try {
    const options = parseArguments();

    const result = mafTop(options);

    // If in JSON mode, output the result
    if (options.json && result) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("Cannot find module 'better-sqlite3'")) {
      console.error('better-sqlite3 is not installed.');
      console.error('Install toolchain then: npm install better-sqlite3 --save-dev');
      process.exit(2);
    }
    if (msg.includes('Invalid value') || msg.includes('Missing value') || msg.includes('Unknown flag')) {
      console.error('Error:', msg);
      console.error('Use --help for usage information.');
      process.exit(3);
    }
    console.error('maf:top failed:', msg);
    process.exit(1);
  }
}

main();
