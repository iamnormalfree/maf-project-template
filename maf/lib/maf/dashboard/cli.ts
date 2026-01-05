// ABOUTME: CLI interface for MAF dashboard generation
// ABOUTME: Provides command-line interface for generating dashboards

import { generateDashboard, generateDashboardWithConfig, type DashboardConfig } from './dashboard';

interface CliOptions {
  mafPath?: string;
  outputPath?: string;
  sections?: string;
  tasksLimit?: number;
  eventsLimit?: number;
  evidenceLimit?: number;
  logsLimit?: number;
  includeSecurity?: boolean;
  help?: boolean;
  verbose?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      case '--maf-path':
      case '-p':
        if (nextArg && !nextArg.startsWith('--')) {
          options.mafPath = nextArg;
          i++;
        }
        break;
      case '--output':
      case '-o':
        if (nextArg && !nextArg.startsWith('--')) {
          options.outputPath = nextArg;
          i++;
        }
        break;
      case '--sections':
      case '-s':
        if (nextArg && !nextArg.startsWith('--')) {
          options.sections = nextArg;
          i++;
        }
        break;
      case '--tasks-limit':
        if (nextArg && !nextArg.startsWith('--')) {
          options.tasksLimit = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--events-limit':
        if (nextArg && !nextArg.startsWith('--')) {
          options.eventsLimit = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--evidence-limit':
        if (nextArg && !nextArg.startsWith('--')) {
          options.evidenceLimit = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--logs-limit':
        if (nextArg && !nextArg.startsWith('--')) {
          options.logsLimit = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--include-security':
        options.includeSecurity = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }
  
  return options;
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log(`
MAF Dashboard Generator

USAGE:
  maf-dashboard [OPTIONS]

OPTIONS:
  -p, --maf-path <path>       Path to .maf directory (default: .maf)
  -o, --output <path>         Output file path (default: .maf/reports/overview.md)
  -s, --sections <sections>   Comma-separated list of sections to include
                             (agents,tasks,events,evidence,system,security)
  --tasks-limit <number>      Maximum number of tasks to include (default: 100)
  --events-limit <number>     Maximum number of events to include (default: 50)
  --evidence-limit <number>   Maximum number of evidence records (default: 50)
  --logs-limit <number>       Maximum number of log entries to include (default: 100)
  --include-security          Include security monitoring section
  -v, --verbose               Enable verbose output
  -h, --help                  Show this help message

EXAMPLES:
  maf-dashboard                                    # Generate with default settings
  maf-dashboard -p /path/to/maf -o dashboard.md   # Custom paths
  maf-dashboard -s agents,tasks                   # Only specific sections
  maf-dashboard --include-security                # Include security monitoring
  maf-dashboard --tasks-limit 200 --verbose       # Custom limits with verbose output

SECTIONS:
  agents      Agent status and activity overview
  tasks       Task status, progress, and performance metrics
  events      Recent system events and activity timeline
  evidence    Evidence collection and compliance status
  system      System health, resources, and configuration
  security    Security isolation, policy compliance, and violation monitoring
`);
}

/**
 * Parse sections string
 */
function parseSections(sectionsStr?: string): Array<'agents' | 'tasks' | 'events' | 'evidence' | 'system' | 'security'> {
  if (!sectionsStr) {
    return ['agents', 'tasks', 'events', 'evidence', 'system', 'security'];
  }

  const validSections = ['agents', 'tasks', 'events', 'evidence', 'system', 'security'];
  const requestedSections = sectionsStr.split(',').map(s => s.trim().toLowerCase());

  return requestedSections.filter(s => validSections.includes(s)) as Array<'agents' | 'tasks' | 'events' | 'evidence' | 'system' | 'security'>;
}

/**
 * Main CLI function
 */
export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);
  
  if (options.help) {
    showHelp();
    return;
  }
  
  try {
    if (options.verbose) {
      console.log('MAF Dashboard Generator');
      console.log('Configuration:', options);
      console.log('');
    }
    
    // Build configuration
    const config: DashboardConfig = {
      mafPath: options.mafPath || '.maf',
      outputPath: options.outputPath,
      includeSections: parseSections(options.sections),
      limits: {
        tasks: options.tasksLimit,
        events: options.eventsLimit,
        evidence: options.evidenceLimit,
        logEntries: options.logsLimit
      }
    };

    // Handle includeSecurity flag
    if (options.includeSecurity && (!config.includeSections || !config.includeSections.includes('security'))) {
      if (config.includeSections) {
        config.includeSections.push('security');
      } else {
        config.includeSections = ['security'];
      }
    }
    
    if (options.verbose) {
      console.log('Generating dashboard with configuration:');
      console.log(JSON.stringify(config, null, 2));
      console.log('');
    }
    
    // Generate dashboard
    console.log('Generating dashboard...');
    const startTime = Date.now();
    
    const result = await generateDashboardWithConfig(config);
    
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log('✅ Dashboard generated successfully!');
      console.log('');
      console.log('Output file:', result.outputPath);
      console.log('Generation time:', duration + 'ms');
      console.log('Sections generated:', result.metadata.sectionsGenerated.length);
      console.log('Total items processed:', result.metadata.totalItems);
      console.log('');
      
      if (options.verbose) {
        console.log('Generated sections:');
        result.metadata.sectionsGenerated.forEach((section, index) => {
          console.log('  ' + (index + 1) + '. ' + section);
        });
        console.log('');
        console.log('Metadata:', JSON.stringify(result.metadata, null, 2));
      }
    } else {
      console.error('❌ Dashboard generation failed!');
      console.error('Error:', result.error);
      console.error('');
      console.error('Metadata:', JSON.stringify(result.metadata, null, 2));
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error occurred:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  runCli();
}
