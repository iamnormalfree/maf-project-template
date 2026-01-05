#!/usr/bin/env node
// ABOUTME: Status output formatter for MAF tmux monitoring displays.
// ABOUTME: Provides tmux-compatible formatting with color support and layout optimization.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../../..');

// ANSI color codes for tmux compatibility
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bg_black: '\x1b[40m',
  bg_red: '\x1b[41m',
  bg_green: '\x1b[42m',
  bg_yellow: '\x1b[43m',
  bg_blue: '\x1b[44m',
  bg_magenta: '\x1b[45m',
  bg_cyan: '\x1b[46m',
  bg_white: '\x1b[47m'
};

// tmux formatting escapes
const TMUX_FORMATS = {
  start: '#[',
  end: ']',
  fg: (color) => `fg=${color}`,
  bg: (color) => `bg=${color}`,
  bright: 'bold',
  dim: 'dim',
  reverse: 'reverse'
};

class StatusFormatter {
  constructor(options = {}) {
    this.options = {
      useColors: true,
      useTmuxFormat: false,
      maxWidth: 120,
      compact: false,
      ...options
    };
    
    this.colorMap = {
      green: this.options.useTmuxFormat ? 'green' : COLORS.green,
      yellow: this.options.useTmuxFormat ? 'yellow' : COLORS.yellow,
      red: this.options.useTmuxFormat ? 'red' : COLORS.red,
      cyan: this.options.useTmuxFormat ? 'cyan' : COLORS.cyan,
      white: this.options.useTmuxFormat ? 'white' : COLORS.white,
      black: this.options.useTmuxFormat ? 'black' : COLORS.black
    };
  }

  // Format helpers
  colorize(text, color, bright = false) {
    if (!this.options.useColors) return text;
    
    if (this.options.useTmuxFormat) {
      const attrs = [];
      if (bright) attrs.push(TMUX_FORMATS.bright);
      attrs.push(TMUX_FORMATS.fg(color));
      return `${TMUX_FORMATS.start}${attrs.join(',')}${TMUX_FORMATS.end}${text}${TMUX_FORMATS.start}${TMUX_FORMATS.fg('default')}${TMUX_FORMATS.end}`;
    } else {
      const colorCode = this.colorMap[color] || COLORS.white;
      const brightCode = bright ? COLORS.bright : '';
      return `${brightCode}${colorCode}${text}${COLORS.reset}`;
    }
  }

  highlight(text) {
    return this.colorize(text, 'cyan', true);
  }

  success(text) {
    return this.colorize(text, 'green', true);
  }

  warning(text) {
    return this.colorize(text, 'yellow', true);
  }

  error(text) {
    return this.colorize(text, 'red', true);
  }

  // Quota status formatting
  formatQuotaStatus(statusData) {
    const { profiles, activeProfiles, totalProfiles, alerts, currentProfile, rotationEnabled } = statusData;
    const lines = [];

    // Main quota line
    if (profiles.length > 0) {
      const current = profiles.find(p => p.id === currentProfile) || profiles[0];
      const usageColor = this.getUsageColor(current.usagePercent);
      
      const quotaLine = [
        this.highlight('[CODEX QUOTA]'),
        `Profile: ${current.name}`,
        `Usage: ${this.colorize(`${current.usagePercent}%`, usageColor, true)} (${current.usage}/${current.limit})`,
        `Window: ${current.windowTime}`,
        `Reset: ${current.resetTime}`,
        `Status: ${current.indicator} ${this.colorize(current.status, usageColor)}`
      ].join(' | ');
      
      lines.push(quotaLine);
    } else {
      lines.push(`${this.highlight('[CODEX QUOTA]')} No active profiles | Status: ${this.colorize('UNKNOWN', 'white')}`);
    }

    // Profile summary line
    const rotationStatus = rotationEnabled ? this.success('Auto') : this.warning('Manual');
    const nextProfile = profiles.length > 1 ? profiles[1]?.name || 'None' : 'None';
    
    const profileLine = [
      this.highlight('[PROFILES]'),
      `Active: ${activeProfiles}/${totalProfiles}`,
      `Rotation: ${rotationStatus}`,
      `Next: ${nextProfile}`,
      `Current: ${currentProfile || 'None'}`
    ].join(' | ');
    
    lines.push(profileLine);

    // Alerts line (compact version)
    if (alerts.length > 0) {
      const maxAlerts = this.options.compact ? 2 : 3;
      const displayAlerts = alerts.slice(0, maxAlerts);
      const moreCount = alerts.length - displayAlerts.length;
      
      const alertTexts = displayAlerts.map(alert => {
        // Extract emoji and message
        const match = alert.match(/([🟡🔴🟠🚨⚠️❌])\s*(.+)/);
        if (match) {
          const [_, emoji, message] = match;
          const alertType = message.includes('Error') ? 'error' : 'warning';
          return `${emoji} ${this.colorize(message, alertType)}`;
        }
        return alert;
      });
      
      if (moreCount > 0) {
        alertTexts.push(`+${moreCount} more`);
      }
      
      const alertsLine = `${this.highlight('[ALERTS]')} ${alertTexts.join(' | ')}`;
      lines.push(alertsLine);
    }

    return lines.join('\n');
  }

  // Compact single-line format for tmux status bar
  formatCompactStatus(statusData) {
    const { profiles, activeProfiles, alerts } = statusData;
    
    if (profiles.length === 0) {
      return this.colorize('QUOTA: ⚪ No active profiles', 'white');
    }
    
    const highestUsage = profiles.reduce((max, profile) => 
      profile.usagePercent > max.usagePercent ? profile : max, profiles[0]);
    
    const usageColor = this.getUsageColor(highestUsage.usagePercent);
    const alertCount = alerts.length;
    
    let status = `${this.colorize('QUOTA:', 'cyan', true)} ${highestUsage.indicator} ${this.colorize(highestUsage.name, usageColor)} ${this.colorize(`${highestUsage.usagePercent}%`, usageColor, true)} | ${this.colorize(`${activeProfiles} active`, 'green')}`;
    
    if (alertCount > 0) {
      status += ` | ${this.colorize(`${alertCount} alerts`, 'yellow', true)}`;
    }
    
    return status;
  }

  // System health status formatting
  formatSystemHealth(healthData) {
    const { overallStatus, agents, system, checks, lastUpdated } = healthData;
    const lines = [];

    // Overall status
    const statusColor = overallStatus === 'healthy' ? 'green' : 
                       overallStatus === 'degraded' ? 'yellow' : 'red';
    
    lines.push(`${this.highlight('[SYSTEM]')} Status: ${this.colorize(overallStatus.toUpperCase(), statusColor, true)} | Updated: ${new Date(lastUpdated).toLocaleTimeString()}`);

    // Agent status if available
    if (agents && agents.total_count > 0) {
      const healthPercent = agents.health_percentage || 0;
      const agentColor = healthPercent >= 90 ? 'green' : healthPercent >= 70 ? 'yellow' : 'red';
      
      lines.push(`${this.highlight('[AGENTS]')} ${this.colorize(`${agents.healthy_count}/${agents.total_count}`, agentColor, true)} healthy (${healthPercent}%)`);
    }

    // Resource usage
    if (system && system.system_metrics) {
      const { cpu_usage, memory_usage, disk_usage } = system.system_metrics;
      const resources = [];
      
      if (cpu_usage !== undefined) {
        const cpuColor = cpu_usage >= 80 ? 'red' : cpu_usage >= 60 ? 'yellow' : 'green';
        resources.push(`CPU: ${this.colorize(`${cpu_usage}%`, cpuColor)}`);
      }
      
      if (memory_usage !== undefined) {
        const memColor = memory_usage >= 85 ? 'red' : memory_usage >= 70 ? 'yellow' : 'green';
        resources.push(`MEM: ${this.colorize(`${memory_usage}%`, memColor)}`);
      }
      
      if (disk_usage !== undefined) {
        const diskColor = disk_usage >= 90 ? 'red' : disk_usage >= 75 ? 'yellow' : 'green';
        resources.push(`DISK: ${this.colorize(`${disk_usage}%`, diskColor)}`);
      }
      
      if (resources.length > 0) {
        lines.push(`${this.highlight('[RESOURCES]')} ${resources.join(' | ')}`);
      }
    }

    return lines.join('\n');
  }

  // Get color based on usage percentage
  getUsageColor(percentage) {
    if (percentage >= 95) return 'red';
    if (percentage >= 90) return 'red';
    if (percentage >= 75) return 'yellow';
    if (percentage >= 50) return 'yellow';
    return 'green';
  }

  // Truncate text to fit within max width
  truncate(text, maxLength = 50) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  // Format timestamp for display
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  // Format duration in human-readable format
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Format a table-like layout for multi-item display
  formatTable(items, headers, options = {}) {
    const { maxWidth = 80, showHeaders = true } = options;
    const lines = [];
    
    if (showHeaders && headers) {
      const headerLine = headers.map(h => this.colorize(h, 'cyan', true)).join(' | ');
      lines.push(headerLine);
      lines.push('-'.repeat(Math.min(maxWidth, headerLine.length)));
    }
    
    for (const item of items) {
      const itemLine = Array.isArray(item) ? item.join(' | ') : item;
      lines.push(this.truncate(itemLine, maxWidth));
    }
    
    return lines.join('\n');
  }

  // Create a dashboard-style layout combining multiple status types
  formatDashboard(quotaData, healthData, options = {}) {
    const { compact = false, showTimestamp = true } = options;
    const sections = [];
    
    // Timestamp
    if (showTimestamp) {
      sections.push(`${this.colorize('='.repeat(60), 'black')} ${new Date().toLocaleString()} ${this.colorize('='.repeat(60), 'black')}`);
      sections.push('');
    }
    
    // Quota status
    if (quotaData) {
      sections.push(this.formatQuotaStatus(quotaData));
      sections.push('');
    }
    
    // System health
    if (healthData) {
      sections.push(this.formatSystemHealth(healthData));
      sections.push('');
    }
    
    // Footer
    sections.push(`${this.colorize('─'.repeat(120), 'black')}`);
    
    return sections.join('\n');
  }

  // Export current format options
  getFormatInfo() {
    return {
      useColors: this.options.useColors,
      useTmuxFormat: this.options.useTmuxFormat,
      maxWidth: this.options.maxWidth,
      compact: this.options.compact,
      colorSupport: this.options.useColors ? (this.options.useTmuxFormat ? 'tmux' : 'ansi') : 'none'
    };
  }
}

// Helper function for dirname
function dirname(path) {
  return path.replace(/\/[^\/]*$/, '');
}

// CLI interface for testing
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--tmux':
        options.useTmuxFormat = true;
        break;
      case '--no-color':
        options.useColors = false;
        break;
      case '--compact':
        options.compact = true;
        break;
      case '--max-width':
        options.maxWidth = parseInt(args[++i]) || 120;
        break;
      case '--help':
      case '-h':
        console.log(`
MAF Status Formatter

Usage: node status-formatter.mjs [options]

Options:
  --tmux               Use tmux formatting instead of ANSI colors
  --no-color           Disable color output
  --compact            Use compact formatting
  --max-width WIDTH    Maximum line width (default: 120)
  --help, -h          Show this help message

Examples:
  node status-formatter.mjs --tmux          # tmux-compatible formatting
  node status-formatter.mjs --no-color      # Plain text output
  node status-formatter.mjs --compact       # Compact format
        `);
        process.exit(0);
        break;
    }
  }
  
  const formatter = new StatusFormatter(options);
  
  // Example usage with test data
  const testQuotaData = {
    profiles: [
      {
        id: 'codex-prod-01',
        name: 'codex-prod-01',
        usage: 750,
        limit: 1000,
        usagePercent: 75,
        indicator: '🟡',
        status: 'WARNING',
        windowTime: '1h',
        resetTime: '45m',
        priority: 1
      }
    ],
    activeProfiles: 3,
    totalProfiles: 4,
    alerts: ['🟡 codex-prod-01 at 75% usage'],
    currentProfile: 'codex-prod-01',
    rotationEnabled: true
  };
  
  console.log(formatter.formatQuotaStatus(testQuotaData));
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { StatusFormatter };
