#!/usr/bin/env node

// ABOUTME: Demonstration script for MAF profile management system

import { CodexProfileManager } from '../../lib/maf/profiles/index.js';

async function demonstrateProfileManagement() {
  console.log('🔧 MAF Profile Management Demo');
  console.log('================================\n');

  try {
    // Create profile manager
    const manager = new CodexProfileManager({
      configPath: '.maf/config/default-agent-config.json',
      envPath: '.maf/config/profiles',
      validate: true
    });

    // Load profiles
    console.log('📁 Loading profile configuration...');
    await manager.loadProfiles();
    console.log('✅ Profiles loaded successfully\n');

    // Show configuration
    const config = manager.getConfig();
    console.log('⚙️  Configuration:');
    console.log(`   Enabled: ${config.codex_profiles.enable}`);
    console.log(`   Default Profile: ${config.codex_profiles.default_profile}`);
    console.log(`   Selection Algorithm: ${config.codex_profiles.selection.algorithm}`);
    console.log(`   Rate Limiting: ${config.codex_profiles.selection.enforce_rate_limit}`);
    console.log(`   Total Profiles: ${Object.keys(config.profiles).length}\n`);

    // List all profiles
    console.log('📋 Available Profiles:');
    for (const [name, profile] of Object.entries(config.profiles)) {
      const status = profile.active ? '✅' : '❌';
      const priority = profile.priority;
      const inherits = profile.extends ? ` (extends: ${profile.extends})` : '';
      console.log(`   ${status} ${name} (priority: ${priority})${inherits}`);
    }
    console.log('');

    // Show active profiles
    console.log('🟢 Active Profiles:');
    const activeProfiles = manager.getActiveProfiles();
    for (const profile of activeProfiles) {
      console.log(`   • ${profile.name} - Priority: ${profile.priority}`);
      if (profile.owner) {
        console.log(`     Owner: ${profile.owner}`);
      }
      if (profile.rate_limit) {
        console.log(`     Rate Limit: ${profile.rate_limit.requests} requests / ${profile.rate_limit.window}s`);
      }
    }
    console.log('');

    // Demonstrate profile selection
    console.log('🎯 Profile Selection Demo:');
    for (let i = 0; i < 3; i++) {
      const selected = manager.selectProfile();
      if (selected) {
        console.log(`   Selection ${i + 1}: ${selected.name} (${selected.environment.ANTHROPIC_MODEL})`);
        manager.markProfileUsed(selected.name);
      }
    }
    console.log('');

    // Demonstrate inheritance resolution
    console.log('🧬 Inheritance Resolution Demo:');
    const childProfile = manager.getResolvedProfile('claude-haiku');
    if (childProfile) {
      console.log(`   Profile: ${childProfile.name}`);
      console.log(`   Model: ${childProfile.environment.ANTHROPIC_MODEL}`);
      console.log(`   Agent Type: ${childProfile.environment.MAF_AGENT_TYPE}`);
      console.log(`   Inherited Variables: ${Object.keys(childProfile.environment).length}`);
    }
    console.log('');

    // Demonstrate environment loading
    console.log('🔧 Environment Variables Demo:');
    const env = manager.getProfileEnvironment('claude-sonnet-4');
    if (env) {
      console.log('   Environment for claude-sonnet-4:');
      for (const [key, value] of Object.entries(env)) {
        if (key.includes('KEY')) {
          console.log(`     ${key}: [REDACTED]`);
        } else {
          console.log(`     ${key}: ${value}`);
        }
      }
    }

    console.log('\n✨ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
}

// Run demonstration
demonstrateProfileManagement();
