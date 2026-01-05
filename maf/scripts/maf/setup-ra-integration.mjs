#!/usr/bin/env node
// ABOUTME: MAF Response Awareness Integration Setup Script
// ABOUTME: Creates directory structures and validates RA integration components.

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

// Configuration
const RA_HELPER_SCRIPT = join(PROJECT_ROOT, 'scripts/maf/helpers/attach-ra-summary.sh');
const RA_SUMMARY_DIR = join(PROJECT_ROOT, '.maf/state/ra-summary');
const AGENT_MAIL_OUTBOX = join(PROJECT_ROOT, '.agent-mail/outbox');
const MONITORING_CACHE_DIR = join(PROJECT_ROOT, '.maf/monitoring');

// Colors for output
const GREEN = '\033[0;32m';
const YELLOW = '\033[1;33m';
const RED = '\033[0;31m';
const BLUE = '\033[0;34m';
const NC = '\033[0m';

function log(message, color = NC) {
  console.log(`${color}${message}${NC}`);
}

function createDirectory(dirPath, description) {
  if (!existsSync(dirPath)) {
    try {
      mkdirSync(dirPath, { recursive: true });
      log(`✅ Created ${description}: ${dirPath}`, GREEN);
      return true;
    } catch (error) {
      log(`❌ Failed to create ${description}: ${error.message}`, RED);
      return false;
    }
  } else {
    log(`✅ ${description} already exists: ${dirPath}`, BLUE);
    return true;
  }
}

function validateFile(filePath, description) {
  if (existsSync(filePath)) {
    log(`✅ ${description} found: ${filePath}`, GREEN);
    return true;
  } else {
    log(`❌ ${description} missing: ${filePath}`, RED);
    return false;
  }
}

function makeExecutable(filePath) {
  try {
    chmodSync(filePath, 0o755);
    log(`✅ Made executable: ${filePath}`, GREEN);
    return true;
  } catch (error) {
    log(`⚠️  Could not make executable (may already be executable): ${filePath}`, YELLOW);
    return true; // Don't fail the setup for this
  }
}

function checkDependencies() {
  log('\n🔍 Checking dependencies...', BLUE);
  
  const dependencies = [
    { cmd: 'node', name: 'Node.js', required: true },
    { cmd: 'bd', name: 'Beads CLI', required: false },
  ];

  let allDepsOk = true;
  for (const dep of dependencies) {
    try {
      const result = spawnSync(dep.cmd, ['--version'], { 
        stdio: 'pipe', 
        shell: true 
      });
      
      if (result.status === 0) {
        const version = result.stdout.toString().trim() || result.stderr.toString().trim();
        log(`✅ ${dep.name}: ${version}`, GREEN);
      } else {
        if (dep.required) {
          log(`❌ ${dep.name}: Not found (required)`, RED);
          allDepsOk = false;
        } else {
          log(`⚠️  ${dep.name}: Not found (optional)`, YELLOW);
        }
      }
    } catch (error) {
      if (dep.required) {
        log(`❌ ${dep.name}: Error checking (${error.message})`, RED);
        allDepsOk = false;
      } else {
        log(`⚠️  ${dep.name}: Error checking (${error.message})`, YELLOW);
      }
    }
  }

  return allDepsOk;
}

function validateRAIntegration() {
  log('\n🔍 Validating RA Integration Components...', BLUE);
  
  let validationResults = {
    directories: true,
    scripts: true,
    templates: true,
    config: true
  };

  // Check directory structure
  log('\n📁 Directory Structure:', BLUE);
  const directories = [
    { path: RA_SUMMARY_DIR, desc: 'RA summary directory' },
    { path: MONITORING_CACHE_DIR, desc: 'MAF monitoring cache' },
    { path: AGENT_MAIL_OUTBOX, desc: 'Agent-mail outbox' },
    { path: join(PROJECT_ROOT, 'scripts/maf/helpers'), desc: 'MAF helpers directory' },
  ];

  for (const dir of directories) {
    if (!createDirectory(dir.path, dir.desc)) {
      validationResults.directories = false;
    }
  }

  // Check scripts
  log('\n📜 Scripts:', BLUE);
  if (!validateFile(RA_HELPER_SCRIPT, 'RA helper script')) {
    validationResults.scripts = false;
  } else {
    makeExecutable(RA_HELPER_SCRIPT);
  }

  // Check templates
  log('\n📋 Templates:', BLUE);
  const templates = [
    { path: join(PROJECT_ROOT, 'mcp_agent_mail/src/mcp_agent_mail/templates/ra_handoff.txt'), desc: 'RA handoff template' },
    { path: join(PROJECT_ROOT, 'mcp_agent_mail/src/mcp_agent_mail/templates/ra_request.txt'), desc: 'RA request template' },
    { path: join(PROJECT_ROOT, 'mcp_agent_mail/src/mcp_agent_mail/templates/ra_reminder.txt'), desc: 'RA reminder template' },
  ];

  for (const template of templates) {
    if (!validateFile(template.path, template.desc)) {
      validationResults.templates = false;
    }
  }

  // Check configuration
  log('\n⚙️  Configuration:', BLUE);
  const configFiles = [
    { path: join(PROJECT_ROOT, 'scripts/maf/monitoring/monitoring-config.json'), desc: 'Monitoring configuration' },
  ];

  for (const config of configFiles) {
    if (!validateFile(config.path, config.desc)) {
      validationResults.config = false;
    }
  }

  return validationResults;
}

function createTestFiles() {
  log('\n🧪 Creating test files...', BLUE);
  
  // Create a test RA summary
  const testRASummary = `# RA Summary for test-bead-001

## Response Awareness Analysis
- **Complexity Score**: 3/12 (Medium)
- **Tier**: response-awareness-medium
- **Confidence**: High

## Key Insights
1. Implementation involves 2-5 related files
2. Requirements mostly clear with minor questions
3. Touches existing APIs, introduces new features
4. Uses established patterns in the codebase

## Recommendations
- Proceed with optional planning phase
- Consider integration points with existing agent-mail workflow
- Validate bead ID format and existence before processing

## Next Steps
1. Create implementation plan
2. Validate dependencies
3. Execute with proper error handling

---
Generated by MAF RA Integration Setup
Timestamp: ${new Date().toISOString()}`;

  try {
    writeFileSync(join(RA_SUMMARY_DIR, 'test-bead-001.md'), testRASummary);
    log('✅ Created test RA summary: test-bead-001.md', GREEN);
  } catch (error) {
    log(`❌ Failed to create test RA summary: ${error.message}`, RED);
  }
}

function showUsageInstructions() {
  log('\n📖 Usage Instructions:', BLUE);
  log(`
RA Helper Script Usage:
  # Attach RA summary to bead
  ${RA_HELPER_SCRIPT} <bead-id>
  
  # Show RA summary without updating bead
  ${RA_HELPER_SCRIPT} <bead-id> --no-update
  
  # Different output formats
  ${RA_HELPER_SCRIPT} <bead-id> --format markdown
  ${RA_HELPER_SCRIPT} <bead-id> --format json

RA Reminder Integration:
  # Run quota monitoring with RA checks
  node ${join(PROJECT_ROOT, 'scripts/maf/monitoring/quota-status.mjs')}
  
  # RA-only reminder checks
  node ${join(PROJECT_ROOT, 'scripts/maf/monitoring/quota-status.mjs')} --ra-only
  
  # Continuous monitoring with RA reminders
  node ${join(PROJECT_ROOT, 'scripts/maf/monitoring/quota-status.mjs')} --continuous

Configuration:
  Edit RA reminder settings in:
  ${join(PROJECT_ROOT, 'scripts/maf/monitoring/monitoring-config.json')}
  
  Template files location:
  ${join(PROJECT_ROOT, 'mcp_agent_mail/src/mcp_agent_mail/templates/')}

Test the integration:
  # Test RA helper script
  ${RA_HELPER_SCRIPT} test-bead-001 --no-update
  
  # Test RA reminder functionality  
  node ${join(PROJECT_ROOT, 'scripts/maf/monitoring/quota-status.mjs')} --ra-only
`);
}

function main() {
  log('🚀 MAF Response Awareness Integration Setup', BLUE);
  log('=============================================', BLUE);
  
  // Check dependencies first
  const depsOk = checkDependencies();
  if (!depsOk) {
    log('\n❌ Some required dependencies are missing. Please install them and re-run this setup.', RED);
    process.exit(1);
  }

  // Validate and create directory structure
  const validationResults = validateRAIntegration();
  
  // Create test files
  createTestFiles();

  // Summary
  log('\n📊 Setup Summary:', BLUE);
  const allGood = Object.values(validationResults).every(result => result);
  
  if (allGood) {
    log('✅ All RA integration components are properly set up!', GREEN);
  } else {
    log('⚠️  Some components have issues. Please review the errors above.', YELLOW);
  }

  // Show usage instructions
  showUsageInstructions();

  // Exit with appropriate code
  process.exit(allGood ? 0 : 1);
}

// Import spawnSync for dependency checking
import { spawnSync } from 'child_process';

// Run setup
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log(`\n❌ Setup failed: ${error.message}`, RED);
    process.exit(1);
  });
}