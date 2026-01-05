#!/usr/bin/env node
// ABOUTME: Main quota status aggregation script for MAF tmux monitoring system.
// ABOUTME: Collects quota information from all profiles and formats for tmux display.

import { readFileSync, existsSync, writeFileSync, mkdirSync, lstatSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import Telegram integration
import { TelegramIntegration } from './telegram-integration.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fixed project root detection - scripts/maf/monitoring -> project root
const PROJECT_ROOT = join(__dirname, '../../..');

// Configuration
const MONITORING_CONFIG = join(PROJECT_ROOT, 'scripts/maf/monitoring/monitoring-config.json');
const DEFAULT_AGENT_CONFIG = join(PROJECT_ROOT, '.maf/config/default-agent-config.json');
const QUOTA_CACHE_FILE = join(PROJECT_ROOT, '.maf/monitoring/quota-cache.json');
const RA_REMINDER_CACHE_FILE = join(PROJECT_ROOT, '.maf/monitoring/ra-reminder-cache.json');
const AGENT_MAIL_DIR = join(PROJECT_ROOT, '.agent-mail');
const RA_SUMMARY_DIR = join(PROJECT_ROOT, '.maf/state/ra-summary');
const CACHE_TTL_SECONDS = 30;

// Color-coded health indicators
const HEALTH_INDICATORS = {
  healthy: '🟢',     // < 50% usage
  warning: '🟡',     // 50-75% usage  
  alert: '🟠',       // 75-90% usage
  critical: '🔴',     // > 90% usage
  emergency: '🚨',    // > 95% usage
  unknown: '⚪'       // Status unknown
};

class QuotaStatusAggregator {
  constructor() {
    this.config = this.loadConfiguration();
    this.cache = this.loadCache();
    this.raReminderCache = this.loadRAReminderCache();
    // Initialize Telegram integration
    this.telegramIntegration = new TelegramIntegration();
  }

  loadConfiguration() {
    try {
      if (existsSync(MONITORING_CONFIG)) {
        const config = JSON.parse(readFileSync(MONITORING_CONFIG, 'utf8'));
        return {
          cacheTTL: config.monitoring?.codex_quota?.status_update_interval_seconds || CACHE_TTL_SECONDS,
          thresholds: config.monitoring?.codex_quota?.quota_thresholds || {
            warning_percent: 50,
            critical_percent: 90,
            emergency_percent: 95
          },
          enabled: config.monitoring?.codex_quota?.enabled !== false,
          raReminders: {
            enabled: config.monitoring?.codex_quota?.ra_reminders?.enabled !== false,
            check_interval_minutes: config.monitoring?.codex_quota?.ra_reminders?.check_interval_minutes || 15,
            reminder_delay_minutes: config.monitoring?.codex_quota?.ra_reminders?.reminder_delay_minutes || 30,
            max_reminders_per_hour: config.monitoring?.codex_quota?.ra_reminders?.max_reminders_per_hour || 3
          },
          // Load Telegram integration settings
          telegram: {
            enabled: config.monitoring?.telegram?.enabled && config.monitoring?.telegram?.integration?.quota_alerts,
            quotaNotifications: config.monitoring?.telegram?.integration?.quota_alerts !== false
          }
        };
      }
    } catch (error) {
      console.warn('Warning: Failed to load monitoring config, using defaults', error.message);
    }

    return {
      cacheTTL: CACHE_TTL_SECONDS,
      thresholds: {
        warning_percent: 50,
        critical_percent: 90,
        emergency_percent: 95
      },
      enabled: true,
      raReminders: {
        enabled: true,
        check_interval_minutes: 15,
        reminder_delay_minutes: 30,
        max_reminders_per_hour: 3
      },
      telegram: {
        enabled: false,
        quotaNotifications: true
      }
    };
  }

  loadCache() {
    try {
      if (existsSync(QUOTA_CACHE_FILE)) {
        const cache = JSON.parse(readFileSync(QUOTA_CACHE_FILE, 'utf8'));
        const age = (Date.now() - new Date(cache.timestamp).getTime()) / 1000;
        
        if (age < this.config.cacheTTL) {
          return cache;
        }
      }
    } catch (error) {
      // Cache invalid or unreadable, will refresh
    }

    return null;
  }

  loadRAReminderCache() {
    try {
      if (existsSync(RA_REMINDER_CACHE_FILE)) {
        const cache = JSON.parse(readFileSync(RA_REMINDER_CACHE_FILE, 'utf8'));
        // Reset reminder counters if cache is older than 1 hour
        const cacheAge = (Date.now() - new Date(cache.last_reset).getTime()) / 1000;
        if (cacheAge > 3600) {
          return {
            last_reset: new Date().toISOString(),
            reminders_sent: 0,
            recent_reminders: []
          };
        }
        return cache;
      }
    } catch (error) {
      // Cache invalid or unreadable, will create new
    }

    return {
      last_reset: new Date().toISOString(),
      reminders_sent: 0,
      recent_reminders: []
    };
  }

  saveRAReminderCache() {
    try {
      const cacheDir = dirname(RA_REMINDER_CACHE_FILE);
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      writeFileSync(RA_REMINDER_CACHE_FILE, JSON.stringify(this.raReminderCache, null, 2));
    } catch (error) {
      console.warn('Warning: Failed to save RA reminder cache', error.message);
    }
  }

  saveCache(data) {
    try {
      const cacheData = {
        timestamp: new Date().toISOString(),
        ...data
      };
      
      // Ensure directory exists
      const cacheDir = dirname(QUOTA_CACHE_FILE);
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      
      // Write cache file
      writeFileSync(QUOTA_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('Warning: Failed to save quota cache', error.message);
    }
  }

  getHealthIndicator(usagePercentage) {
    if (usagePercentage >= this.config.thresholds.emergency_percent) return HEALTH_INDICATORS.emergency;
    if (usagePercentage >= this.config.thresholds.critical_percent) return HEALTH_INDICATORS.critical;
    if (usagePercentage >= this.config.thresholds.warning_percent) return HEALTH_INDICATORS.warning;
    return HEALTH_INDICATORS.healthy;
  }

  getHealthStatus(usagePercentage) {
    if (usagePercentage >= this.config.thresholds.emergency_percent) return 'EMERGENCY';
    if (usagePercentage >= this.config.thresholds.critical_percent) return 'CRITICAL';
    if (usagePercentage >= this.config.thresholds.warning_percent) return 'WARNING';
    return 'OK';
  }

  // Send Telegram notification for quota alerts
  async sendQuotaAlert(profile, usagePercent, thresholdType) {
    if (!this.config.telegram.enabled || !this.config.telegram.quotaNotifications) {
      return;
    }

    try {
      const profileData = {
        name: profile.name,
        usage: profile.usage,
        limit: profile.limit,
        usagePercent
      };

      const result = await this.telegramIntegration.handleQuotaAlert(
        profileData, 
        thresholdType, 
        usagePercent
      );

      if (result.success) {
        console.log(`[TELEGRAM] Quota alert sent for ${profile.name}: ${usagePercent}% usage`);
      } else if (!result.skipped) {
        console.warn(`[TELEGRAM] Failed to send quota alert for ${profile.name}:`, result.error || result.reason);
      }
    } catch (error) {
      console.warn(`[TELEGRAM] Error sending quota alert for ${profile.name}:`, error.message);
    }
  }

  async collectProfileStatus() {
    const profiles = [];
    
    try {
      // Load agent configuration
      if (!existsSync(DEFAULT_AGENT_CONFIG)) {
        return {
          profiles: [],
          activeProfiles: 0,
          totalProfiles: 0,
          alerts: [`⚠️ No profile configuration found at ${DEFAULT_AGENT_CONFIG}`]
        };
      }

      const agentConfig = JSON.parse(readFileSync(DEFAULT_AGENT_CONFIG, 'utf8'));
      const codexConfig = agentConfig.codex_profiles || {};
      
      if (!codexConfig.enable) {
        return {
          profiles: [],
          activeProfiles: 0,
          totalProfiles: 0,
          alerts: ['⚠️ Codex profiles disabled']
        };
      }

      // Get profile information
      const profileConfigs = agentConfig.profiles || {};
      let activeProfiles = 0;
      const alerts = [];
      const telegramAlerts = [];

      for (const [profileId, profileConfig] of Object.entries(profileConfigs)) {
        if (!profileConfig.active) continue;

        activeProfiles++;
        
        // Simulate quota data (in real implementation, this would call API)
        const quotaData = await this.getQuotaData(profileId, profileConfig);
        
        const usagePercent = quotaData.usage / quotaData.limit * 100;
        const indicator = this.getHealthIndicator(usagePercent);
        const status = this.getHealthStatus(usagePercent);

        const profile = {
          id: profileId,
          name: profileConfig.name || profileId,
          usage: quotaData.usage,
          limit: quotaData.limit,
          usagePercent: Math.round(usagePercent),
          indicator,
          status,
          windowTime: quotaData.windowTime,
          resetTime: quotaData.resetTime,
          priority: profileConfig.priority || 999
        };

        profiles.push(profile);

        // Generate alerts and Telegram notifications
        if (usagePercent >= this.config.thresholds.critical_percent) {
          alerts.push(`${indicator} ${profile.name} at ${usagePercent.toFixed(0)}% usage`);
          
          // Determine threshold type for Telegram notification
          let thresholdType = 'critical';
          if (usagePercent >= this.config.thresholds.emergency_percent) {
            thresholdType = 'emergency';
          }
          
          // Queue Telegram notification (async, non-blocking)
          telegramAlerts.push(this.sendQuotaAlert(profile, usagePercent, thresholdType));
        }
      }

      // Send Telegram notifications in parallel (non-blocking)
      if (telegramAlerts.length > 0) {
        Promise.allSettled(telegramAlerts).catch(error => {
          console.warn('[TELEGRAM] Error in quota alert notifications:', error.message);
        });
      }

      // Sort by priority (lower number = higher priority)
      profiles.sort((a, b) => a.priority - b.priority);

      return {
        profiles,
        activeProfiles,
        totalProfiles: Object.keys(profileConfigs).length,
        alerts,
        currentProfile: codexConfig.default_profile,
        rotationEnabled: codexConfig.selection?.enforce_rate_limit || false
      };

    } catch (error) {
      console.error('Error collecting profile status:', error);
      return {
        profiles: [],
        activeProfiles: 0,
        totalProfiles: 0,
        alerts: [`❌ Error: ${error.message}`]
      };
    }
  }

  async getQuotaData(profileId, profileConfig) {
    // In a real implementation, this would make API calls to get actual quota data
    // For now, we'll simulate quota data based on profile configuration
    
    const now = new Date();
    const rateLimit = profileConfig.rate_limit || { requests: 1000, window: 3600 };
    
    // Simulate usage with some randomness for demo purposes
    const baseUsage = Math.random() * rateLimit.requests * 0.8; // 0-80% usage
    const usage = Math.floor(baseUsage);
    
    // Calculate reset time (next window boundary)
    const windowStart = Math.floor(now.getTime() / 1000 / rateLimit.window) * rateLimit.window;
    const resetTime = new Date((windowStart + rateLimit.window) * 1000);
    
    return {
      usage,
      limit: rateLimit.requests,
      windowTime: `${rateLimit.window / 3600}h`,
      resetTime: this.formatTimeRemaining(resetTime, now)
    };
  }

  formatTimeRemaining(targetTime, currentTime = new Date()) {
    const diffMs = targetTime.getTime() - currentTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    
    if (diffHours > 0) {
      return `${diffHours}h${diffMinutes % 60}m`;
    } else {
      return `${diffMinutes}m`;
    }
  }

  formatTmuxStatus(statusData) {
    const { profiles, activeProfiles, totalProfiles, alerts, currentProfile, rotationEnabled } = statusData;
    
    const lines = [];
    
    // Main quota status line (show current/highest priority profile)
    if (profiles.length > 0) {
      const current = profiles.find(p => p.id === currentProfile) || profiles[0];
      lines.push(`[CODEX QUOTA] Profile: ${current.name} | Usage: ${current.usagePercent}% (${current.usage}/${current.limit}) | Window: ${current.windowTime} | Reset: ${current.resetTime} | Status: ${current.indicator} ${current.status}`);
    } else {
      lines.push(`[CODEX QUOTA] No active profiles | Status: ${HEALTH_INDICATORS.unknown} UNKNOWN`);
    }
    
    // Profile status line
    const rotationStatus = rotationEnabled ? 'Auto' : 'Manual';
    const nextProfile = profiles.length > 1 ? profiles[1]?.name || 'None' : 'None';
    lines.push(`[PROFILES] Active: ${activeProfiles}/${totalProfiles} | Rotation: ${rotationStatus} | Next: ${nextProfile} | Current: ${currentProfile || 'None'}`);
    
    // Alerts line (if any)
    if (alerts.length > 0) {
      const maxAlerts = 3;
      const displayAlerts = alerts.slice(0, maxAlerts);
      lines.push(`[ALERTS] ${displayAlerts.join(' | ')}`);
    }
    
    return lines.join('\n');
  }

  formatCompactStatus(statusData) {
    const { profiles, activeProfiles, alerts } = statusData;
    
    if (profiles.length === 0) {
      return 'QUOTA: ⚪ No active profiles';
    }
    
    // Find highest usage profile for summary
    const highestUsage = profiles.reduce((max, profile) => 
      profile.usagePercent > max.usagePercent ? profile : max, profiles[0]);
    
    const alertCount = alerts.length;
    const alertSuffix = alertCount > 0 ? ` | ${alertCount} alerts` : '';
    
    return `QUOTA: ${highestUsage.indicator} ${highestUsage.name} ${highestUsage.usagePercent}% | ${activeProfiles} active${alertSuffix}`;
  }

  // RA Reminder functionality
  async checkRAReminders() {
    if (!this.config.raReminders.enabled) {
      return [];
    }

    const reminders = [];

    try {
      // Check if we've exceeded the maximum reminders per hour
      if (this.raReminderCache.reminders_sent >= this.config.raReminders.max_reminders_per_hour) {
        console.log('RA reminder limit reached for this hour, skipping checks');
        return reminders;
      }

      // Get recent agent-mail messages that might need RA summaries
      const recentMessages = this.getRecentAgentMailMessages();

      for (const message of recentMessages) {
        const reminder = await this.checkMessageForRAReminder(message);
        if (reminder) {
          reminders.push(reminder);
        }
      }

      // Update cache if we sent reminders
      if (reminders.length > 0) {
        this.raReminderCache.reminders_sent += reminders.length;
        this.raReminderCache.recent_reminders.push(...reminders.map(r => ({
          timestamp: new Date().toISOString(),
          message_id: r.messageId,
          bead_id: r.beadId
        })));
        this.saveRAReminderCache();
      }

    } catch (error) {
      console.warn('Error checking RA reminders:', error.message);
    }

    return reminders;
  }

  getRecentAgentMailMessages() {
    const messages = [];

    if (!existsSync(AGENT_MAIL_DIR)) {
      return messages;
    }

    try {
      // Look for recent message files in agent-mail directory
      const messageFiles = [];
      const scanDir = (dir, depth = 0) => {
        if (depth > 3) return; // Limit depth to avoid performance issues

        const items = readdirSync(dir);
        for (const item of items) {
          const itemPath = join(dir, item);
          const stat = lstatSync(itemPath);

          if (stat.isDirectory() && (item === 'inbox' || item === 'sent' || depth === 0)) {
            scanDir(itemPath, depth + 1);
          } else if (stat.isFile() && item.endsWith('.json')) {
            messageFiles.push(itemPath);
          }
        }
      };

      scanDir(AGENT_MAIL_DIR);

      // Filter for recent messages (within the reminder delay period)
      const cutoffTime = Date.now() - (this.config.raReminders.reminder_delay_minutes * 60 * 1000);

      for (const messageFile of messageFiles) {
        try {
          const messageData = JSON.parse(readFileSync(messageFile, 'utf8'));
          const messageTime = new Date(messageData.timestamp || messageData.created_at).getTime();

          if (messageTime > cutoffTime) {
            messages.push({
              id: messageData.id || messageFile.split('/').pop().replace('.json', ''),
              file: messageFile,
              data: messageData,
              timestamp: messageTime
            });
          }
        } catch (parseError) {
          // Skip files that can't be parsed
        }
      }

      // Sort by timestamp (newest first)
      messages.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      console.warn('Error scanning agent-mail directory:', error.message);
    }

    return messages;
  }

  async checkMessageForRAReminder(message) {
    const { data, id, file } = message;

    // Look for bead IDs in the message
    const beadIds = this.extractBeadIds(data);

    for (const beadId of beadIds) {
      // Check if we've already reminded about this bead recently
      const recentReminder = this.raReminderCache.recent_reminders.find(
        r => r.bead_id === beadId &&
        (Date.now() - new Date(r.timestamp).getTime()) < (this.config.raReminders.reminder_delay_minutes * 60 * 1000)
      );

      if (recentReminder) {
        continue; // Skip if we recently reminded about this bead
      }

      // Check if RA summary exists for this bead
      const raSummaryPath = join(RA_SUMMARY_DIR, `${beadId}.md`);

      if (!existsSync(raSummaryPath)) {
        // RA summary missing - send reminder
        const reminder = await this.sendRAReminder(beadId, message);
        if (reminder) {
          return {
            messageId: id,
            beadId,
            messageFile: file,
            reminderSent: true,
            ...reminder
          };
        }
      }
    }

    return null;
  }

  extractBeadIds(messageData) {
    const beadIds = new Set();
    const beadIdPattern = /\b([a-zA-Z0-9_-]{3,20}-\d{3}|bead-[a-zA-Z0-9_-]+|task-[a-zA-Z0-9_-]+)\b/gi;

    const textToSearch = [
      messageData.subject || '',
      messageData.content || '',
      messageData.body || '',
      ...(messageData.text || '').split('\n'),
      ...(messageData.html || '').replace(/<[^>]*>/g, '').split('\n')
    ].join(' ');

    const matches = textToSearch.match(beadIdPattern);
    if (matches) {
      matches.forEach(match => {
        // Clean up and normalize the bead ID
        const cleanId = match.toLowerCase().trim();
        if (cleanId.length >= 3 && cleanId.length <= 50) {
          beadIds.add(cleanId);
        }
      });
    }

    return Array.from(beadIds);
  }

  async sendRAReminder(beadId, message) {
    try {
      // Create reminder message content
      const reminderContent = this.createReminderContent(beadId, message);

      // Send reminder via agent-mail if available
      const agentMailPath = join(PROJECT_ROOT, 'mcp_agent_mail');
      if (existsSync(agentMailPath)) {
        // Create a reminder file in the agent-mail outbox
        const outboxDir = join(AGENT_MAIL_DIR, 'outbox');
        if (!existsSync(outboxDir)) {
          mkdirSync(outboxDir, { recursive: true });
        }

        const reminderFile = join(outboxDir, `ra-reminder-${Date.now()}.json`);
        const reminderData = {
          id: `ra-reminder-${beadId}-${Date.now()}`,
          type: 'ra_reminder',
          to: 'codex',
          from: 'maf-monitor',
          subject: `RA Summary Missing for ${beadId}`,
          content: reminderContent,
          timestamp: new Date().toISOString(),
          metadata: {
            bead_id: beadId,
            original_message_id: message.id,
            reminder_type: 'ra_summary_missing'
          }
        };

        writeFileSync(reminderFile, JSON.stringify(reminderData, null, 2));
        console.log(`RA reminder created for bead ${beadId}: ${reminderFile}`);

        return {
          type: 'file_created',
          file: reminderFile,
          content: reminderContent
        };
      } else {
        // Fallback: log reminder to console
        console.log(`[RA REMINDER] ${reminderContent}`);

        return {
          type: 'console_log',
          content: reminderContent
        };
      }
    } catch (error) {
      console.warn(`Failed to send RA reminder for bead ${beadId}:`, error.message);
      return null;
    }
  }

  createReminderContent(beadId, message) {
    const timeSinceMessage = this.formatTimeRemaining(new Date(message.timestamp));

    return `RA Summary Reminder

Bead ID: ${beadId}
Time since message: ${timeSinceMessage} ago
Original message: ${message.id}

The Response Awareness summary for bead "${beadId}" appears to be missing.
RA summaries help ensure proper task analysis and routing.

To create an RA summary:
1. Run response awareness analysis on the bead
2. Save the summary to: .maf/state/ra-summary/${beadId}.md
3. Use the RA helper script: scripts/maf/helpers/attach-ra-summary.sh ${beadId}

This is an automated reminder from the MAF quota monitoring system.`;
  }

  async run(options = {}) {
    const { format = 'tmux', continuous = false, checkRA = true } = options;

    if (!this.config.enabled) {
      console.log('Quota monitoring is disabled');
      return;
    }

    // Check RA reminders if enabled
    if (checkRA && this.config.raReminders.enabled) {
      try {
        const reminders = await this.checkRAReminders();
        if (reminders.length > 0) {
          console.log(`[RA REMINDERS] Sent ${reminders.length} RA summary reminder(s)`);
        }
      } catch (error) {
        console.warn('RA reminder check failed:', error.message);
      }
    }

    // Use cache if available and fresh
    if (this.cache && !options.forceRefresh) {
      const statusData = this.cache;

      if (format === 'compact') {
        console.log(this.formatCompactStatus(statusData));
      } else {
        console.log(this.formatTmuxStatus(statusData));
      }

      if (!continuous) {
        return;
      }
    }

    // Collect fresh data
    const statusData = await this.collectProfileStatus();

    // Save to cache
    this.saveCache(statusData);

    // Output based on format
    if (format === 'none') {
      // RA-only mode - no quota output
    } else if (format === 'compact') {
      console.log(this.formatCompactStatus(statusData));
    } else if (format === 'json') {
      console.log(JSON.stringify(statusData, null, 2));
    } else {
      console.log(this.formatTmuxStatus(statusData));
    }

    // Continuous mode
    if (continuous) {
      const interval = this.config.cacheTTL * 1000;
      const raCheckInterval = this.config.raReminders.check_interval_minutes * 60 * 1000;

      console.log(`\nStarting continuous monitoring (update interval: ${this.config.cacheTTL}s)`);
      if (this.config.raReminders.enabled) {
        console.log(`RA reminder checks every ${this.config.raReminders.check_interval_minutes} minutes`);
      }
      if (this.config.telegram.enabled) {
        console.log(`Telegram quota alerts enabled`);
      }
      console.log('Press Ctrl+C to stop\n');

      // Main quota monitoring interval
      const quotaInterval = setInterval(async () => {
        const freshData = await this.collectProfileStatus();
        this.saveCache(freshData);

        // Clear screen and show fresh status
        console.clear();
        console.log('='.repeat(80));
        console.log(`MAF Codex Quota Monitor - ${new Date().toLocaleString()}`);
        console.log('='.repeat(80));
        console.log();

        if (format === 'none') {
          // RA-only mode - no quota output
        } else if (format === 'compact') {
          console.log(this.formatCompactStatus(freshData));
        } else {
          console.log(this.formatTmuxStatus(freshData));
        }
      }, interval);

      // RA reminder checking interval (separate from quota monitoring)
      if (this.config.raReminders.enabled && checkRA) {
        const raInterval = setInterval(async () => {
          try {
            const reminders = await this.checkRAReminders();
            if (reminders.length > 0) {
              console.log(`\n[RA REMINDERS] ${new Date().toLocaleTimeString()} - Sent ${reminders.length} reminder(s)`);
            }
          } catch (error) {
            console.warn(`[${new Date().toLocaleTimeString()}] RA reminder check failed:`, error.message);
          }
        }, raCheckInterval);

        // Clean up RA interval on process exit
        process.on('SIGINT', () => {
          clearInterval(raInterval);
          clearInterval(quotaInterval);
          process.exit(0);
        });
      }
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--format':
        options.format = args[++i];
        break;
      case '--continuous':
        options.continuous = true;
        break;
      case '--force-refresh':
        options.forceRefresh = true;
        break;
      case '--no-ra':
        options.checkRA = false;
        break;
      case '--ra-only':
        options.format = 'none';
        options.checkRA = true;
        break;
      case '--help':
      case '-h':
        console.log(`
MAF Quota Status Monitor with RA Reminder & Telegram Integration

Usage: node quota-status.mjs [options]

Options:
  --format FORMAT       Output format: tmux (default), compact, json, none
  --continuous          Run in continuous monitoring mode
  --force-refresh       Skip cache and fetch fresh data
  --no-ra              Disable RA reminder checking
  --ra-only            Only check RA reminders (no quota status)
  --help, -h           Show this help message

Examples:
  node quota-status.mjs                    # Show tmux-formatted status with RA checks
  node quota-status.mjs --format compact   # Show compact status with RA checks
  node quota-status.mjs --continuous       # Continuous monitoring with RA reminders & Telegram alerts
  node quota-status.mjs --format json     # JSON output with RA checks
  node quota-status.mjs --no-ra           # Quota status only (no RA checks)
  node quota-status.mjs --ra-only         # RA reminder checks only

Features:
  RA Reminders:
    Automatically checks for missing Response Awareness summaries in recent messages
    Sends reminders via agent-mail or console output
    Configurable check intervals and reminder limits

  Telegram Integration:
    Sends quota breach alerts to Telegram when usage exceeds critical thresholds
    Configurable notification levels and rate limiting
    Integrates with existing MAF Telegram notification system
        `);
        process.exit(0);
        break;
    }
  }
  
  const aggregator = new QuotaStatusAggregator();
  await aggregator.run(options);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { QuotaStatusAggregator };
