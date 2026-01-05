#!/usr/bin/env node
// ABOUTME: Core Telegram notification system for MAF monitoring with rate limiting, retry logic, and audit logging.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fixed project root detection - scripts/maf/monitoring -> project root
const PROJECT_ROOT = join(__dirname, '../../..');

// Configuration paths
const TELEGRAM_CREDENTIALS = join(PROJECT_ROOT, '.maf/credentials/telegram.env');
const MONITORING_CONFIG = join(PROJECT_ROOT, 'scripts/maf/monitoring/monitoring-config.json');
const AUDIT_LOG_FILE = join(PROJECT_ROOT, '.maf/logs/telegram-audit.log');
const RATE_LIMIT_CACHE = join(PROJECT_ROOT, '.maf/cache/telegram-rate-limit.json');

// Severity levels with numeric values for filtering
const SEVERITY_LEVELS = {
  info: 0,
  warning: 1,
  critical: 2,
  emergency: 3
};

// Telegram API endpoints
const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_SEND_MESSAGE = '/bot{token}/sendMessage';

class TelegramNotifier {
  constructor() {
    this.config = this.loadConfiguration();
    this.credentials = this.loadCredentials();
    this.rateLimitData = this.loadRateLimitCache();
    this.auditLog = [];
  }

  loadConfiguration() {
    try {
      if (existsSync(MONITORING_CONFIG)) {
        const config = JSON.parse(readFileSync(MONITORING_CONFIG, 'utf8'));
        return {
          enabled: config.monitoring?.telegram?.enabled || false,
          defaultLevel: config.monitoring?.telegram?.default_level || 'critical',
          rateLimit: {
            maxMessagesPerHour: config.monitoring?.telegram?.rate_limit?.max_messages_per_hour || 10,
            cooldownSeconds: config.monitoring?.telegram?.rate_limit?.cooldown_seconds || 300,
            bypassForCritical: config.monitoring?.telegram?.rate_limit?.bypass_for_critical !== false
          },
          retry: {
            maxAttempts: config.monitoring?.telegram?.retry?.max_attempts || 3,
            baseDelayMs: config.monitoring?.telegram?.retry?.base_delay_ms || 1000,
            maxDelayMs: config.monitoring?.telegram?.retry?.max_delay_ms || 30000
          },
          formatting: {
            enableMarkdown: config.monitoring?.telegram?.formatting?.enable_markdown !== false,
            maxMessageLength: config.monitoring?.telegram?.formatting?.max_message_length || 4000,
            truncateLongMessages: config.monitoring?.telegram?.formatting?.truncate_long_messages !== false
          },
          fallback: {
            console: config.monitoring?.telegram?.fallback?.console !== false,
            logFile: config.monitoring?.telegram?.fallback?.log_file !== false,
            logFileLocation: config.monitoring?.telegram?.fallback?.log_file_location || '.maf/logs/telegram-fallback.log'
          }
        };
      }
    } catch (error) {
      console.warn('Warning: Failed to load monitoring config, using defaults', error.message);
    }

    // Default configuration
    return {
      enabled: false,
      defaultLevel: 'critical',
      rateLimit: {
        maxMessagesPerHour: 10,
        cooldownSeconds: 300,
        bypassForCritical: true
      },
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000
      },
      formatting: {
        enableMarkdown: true,
        maxMessageLength: 4000,
        truncateLongMessages: true
      },
      fallback: {
        console: true,
        logFile: true,
        logFileLocation: '.maf/logs/telegram-fallback.log'
      }
    };
  }

  loadCredentials() {
    try {
      if (!existsSync(TELEGRAM_CREDENTIALS)) {
        throw new Error(`Telegram credentials file not found: ${TELEGRAM_CREDENTIALS}`);
      }

      const content = readFileSync(TELEGRAM_CREDENTIALS, 'utf8');
      const credentials = {};
      
      // Parse shell-style environment file
      content.split('\n').forEach(line => {
        const match = line.match(/^export\s+(\w+)="(.*)"$/);
        if (match) {
          credentials[match[1]] = match[2];
        }
      });

      // Validate required credentials
      const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
      const missing = required.filter(key => !credentials[key]);
      
      if (missing.length > 0) {
        throw new Error(`Missing required credentials: ${missing.join(', ')}`);
      }

      // Validate bot token format
      if (credentials.TELEGRAM_ENABLE_TOKEN_VALIDATION === 'true') {
        const tokenPattern = /^\d+:[a-zA-Z0-9_-]+$/;
        if (!tokenPattern.test(credentials.TELEGRAM_BOT_TOKEN)) {
          throw new Error('Invalid Telegram bot token format');
        }
      }

      // Validate chat ID format
      if (credentials.TELEGRAM_ENABLE_CHAT_VALIDATION === 'true') {
        const chatIdPattern = /^-?\d+$/;
        if (!chatIdPattern.test(credentials.TELEGRAM_CHAT_ID) && credentials.TELEGRAM_CHAT_ID !== '') {
          throw new Error('Invalid Telegram chat ID format');
        }
      }

      return {
        botToken: credentials.TELEGRAM_BOT_TOKEN,
        chatId: credentials.TELEGRAM_CHAT_ID,
        botUsername: credentials.TELEGRAM_BOT_USERNAME || '',
        enabled: credentials.TELEGRAM_ENABLED === 'true',
        notificationLevel: credentials.TELEGRAM_NOTIFICATION_LEVEL || 'critical',
        maxMessagesPerHour: parseInt(credentials.TELEGRAM_MAX_MESSAGES_PER_HOUR) || 10,
        cooldownSeconds: parseInt(credentials.TELEGRAM_COOLDOWN_SECONDS) || 300,
        retryAttempts: parseInt(credentials.TELEGRAM_RETRY_ATTEMPTS) || 3,
        retryBaseDelay: parseInt(credentials.TELEGRAM_RETRY_BASE_DELAY) || 1000,
        requestTimeout: parseInt(credentials.TELEGRAM_REQUEST_TIMEOUT) || 10000,
        fallbackToConsole: credentials.TELEGRAM_FALLBACK_TO_CONSOLE === 'true',
        fallbackToLog: credentials.TELEGRAM_FALLBACK_TO_LOG === 'true'
      };

    } catch (error) {
      console.warn('Warning: Failed to load Telegram credentials:', error.message);
      return {
        enabled: false,
        botToken: '',
        chatId: '',
        botUsername: '',
        notificationLevel: 'critical',
        maxMessagesPerHour: 10,
        cooldownSeconds: 300,
        retryAttempts: 3,
        retryBaseDelay: 1000,
        requestTimeout: 10000,
        fallbackToConsole: true,
        fallbackToLog: true
      };
    }
  }

  loadRateLimitCache() {
    try {
      if (existsSync(RATE_LIMIT_CACHE)) {
        return JSON.parse(readFileSync(RATE_LIMIT_CACHE, 'utf8'));
      }
    } catch (error) {
      // Cache invalid or unreadable, will create new
    }

    return {
      lastReset: new Date().toISOString(),
      messagesSent: 0,
      lastMessageTime: null,
      hourlyMessages: []
    };
  }

  saveRateLimitCache() {
    try {
      const cacheDir = dirname(RATE_LIMIT_CACHE);
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      writeFileSync(RATE_LIMIT_CACHE, JSON.stringify(this.rateLimitData, null, 2));
    } catch (error) {
      console.warn('Warning: Failed to save rate limit cache:', error.message);
    }
  }

  async sendNotification(message, options = {}) {
    const {
      severity = this.config.defaultLevel,
      title = '',
      context = {},
      bypassRateLimit = false
    } = options;

    const notificationId = this.generateNotificationId();
    const startTime = Date.now();

    try {
      // Check if notifications are enabled
      if (!this.config.enabled || !this.credentials.enabled) {
        await this.writeAuditLog(notificationId, 'skipped', 'Notifications disabled', { severity, message });
        return { success: false, reason: 'Notifications disabled', notificationId };
      }

      // Check severity level filtering
      if (!this.shouldSendNotification(severity)) {
        await this.writeAuditLog(notificationId, 'filtered', `Severity ${severity} below threshold ${this.credentials.notificationLevel}`, { severity, message });
        return { success: false, reason: 'Severity filtered', notificationId };
      }

      // Check rate limiting (with bypass for critical/emergency)
      if (!bypassRateLimit && !this.checkRateLimit(severity)) {
        await this.writeAuditLog(notificationId, 'rate_limited', 'Rate limit exceeded', { severity, message });
        await this.fallbackNotification(message, severity, title, 'Rate limited');
        return { success: false, reason: 'Rate limited', notificationId };
      }

      // Format and send message
      const formattedMessage = this.formatMessage(message, title, context, severity);
      const result = await this.sendToTelegram(formattedMessage);

      if (result.success) {
        this.updateRateLimitCache();
        const duration = Date.now() - startTime;
        await this.writeAuditLog(notificationId, 'sent', 'Message sent successfully', { 
          severity, 
          duration,
          messageId: result.messageId 
        });
        return { success: true, notificationId, messageId: result.messageId };
      } else {
        await this.writeAuditLog(notificationId, 'failed', result.error, { severity, message });
        await this.fallbackNotification(message, severity, title, result.error);
        return { success: false, reason: result.error, notificationId };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.writeAuditLog(notificationId, 'error', error.message, { severity, duration });
      await this.fallbackNotification(message, severity, title, error.message);
      return { success: false, reason: error.message, notificationId };
    }
  }

  shouldSendNotification(severity) {
    const messageLevel = SEVERITY_LEVELS[severity] || 0;
    const thresholdLevel = SEVERITY_LEVELS[this.credentials.notificationLevel] || 2;
    return messageLevel >= thresholdLevel;
  }

  checkRateLimit(severity) {
    const now = new Date();
    const currentHour = now.getHours();

    // Reset hourly counter if needed
    if (this.rateLimitData.lastReset && new Date(this.rateLimitData.lastReset).getHours() !== currentHour) {
      this.rateLimitData.lastReset = now.toISOString();
      this.rateLimitData.messagesSent = 0;
      this.rateLimitData.hourlyMessages = [];
    }

    // Check if we can bypass rate limiting for critical messages
    if (this.config.rateLimit.bypassForCritical && (severity === 'critical' || severity === 'emergency')) {
      return true;
    }

    // Check cooldown period
    if (this.rateLimitData.lastMessageTime) {
      const timeSinceLastMessage = (now - new Date(this.rateLimitData.lastMessageTime)) / 1000;
      if (timeSinceLastMessage < this.config.rateLimit.cooldownSeconds) {
        return false;
      }
    }

    // Check hourly limit
    if (this.rateLimitData.messagesSent >= this.credentials.maxMessagesPerHour) {
      return false;
    }

    return true;
  }

  updateRateLimitCache() {
    const now = new Date();
    
    this.rateLimitData.lastMessageTime = now.toISOString();
    this.rateLimitData.messagesSent++;
    this.rateLimitData.hourlyMessages.push(now.toISOString());

    // Keep only the last hour of messages
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    this.rateLimitData.hourlyMessages = this.rateLimitData.hourlyMessages.filter(
      timestamp => new Date(timestamp) > oneHourAgo
    );

    this.saveRateLimitCache();
  }

  formatMessage(message, title, context, severity) {
    let formatted = '';

    // Add severity indicator
    const severityEmojis = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
      emergency: '🔴'
    };

    if (severity) {
      formatted += `${severityEmojis[severity] || ''} `;
    }

    // Add title if provided
    if (title) {
      formatted += `*${title}*\n\n`;
    }

    // Add main message
    formatted += message;

    // Add context if provided
    if (context && Object.keys(context).length > 0) {
      formatted += '\n\n*Context:*\n';
      Object.entries(context).forEach(([key, value]) => {
        formatted += `• ${key}: ${value}\n`;
      });
    }

    // Add timestamp
    formatted += `\n\n_${new Date().toISOString()}_`;

    // Truncate if needed
    if (this.config.formatting.truncateLongMessages && formatted.length > this.config.formatting.maxMessageLength) {
      formatted = formatted.substring(0, this.config.formatting.maxMessageLength - 20) + '...\n\n*[Message truncated]*';
    }

    return formatted;
  }

  async sendToTelegram(formattedMessage) {
    const url = `${TELEGRAM_API_BASE}/bot${this.credentials.botToken}/sendMessage`;
    
    const payload = {
      chat_id: this.credentials.chatId,
      text: formattedMessage,
      parse_mode: this.config.formatting.enableMarkdown ? 'Markdown' : 'HTML',
      disable_web_page_preview: true
    };

    let lastError;

    for (let attempt = 1; attempt <= this.credentials.retryAttempts; attempt++) {
      try {
        const response = await this.makeHttpRequest(url, payload);
        
        if (response.ok) {
          return { 
            success: true, 
            messageId: response.result.message_id,
            attempt 
          };
        } else {
          lastError = `Telegram API error: ${response.description}`;
          if (attempt < this.credentials.retryAttempts) {
            const delay = Math.min(
              this.credentials.retryBaseDelay * Math.pow(2, attempt - 1),
              this.config.retry.maxDelayMs
            );
            await this.sleep(delay);
          }
        }
      } catch (error) {
        lastError = error.message;
        if (attempt < this.credentials.retryAttempts) {
          const delay = Math.min(
            this.credentials.retryBaseDelay * Math.pow(2, attempt - 1),
            this.config.retry.maxDelayMs
          );
          await this.sleep(delay);
        }
      }
    }

    return { success: false, error: lastError };
  }

  async makeHttpRequest(url, payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.credentials.requestTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.description || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async fallbackNotification(message, severity, title, reason) {
    const timestamp = new Date().toISOString();
    const prefix = `[TELEGRAM-FALLBACK ${severity.toUpperCase()}]`;
    const fullMessage = `${prefix} ${title ? `${title}: ` : ''}${message}`;

    // Console fallback
    if (this.config.fallback.console) {
      console.error(fullMessage);
      console.error(`Reason: ${reason}`);
    }

    // Log file fallback
    if (this.config.fallback.logFile) {
      try {
        const logFile = join(PROJECT_ROOT, this.config.fallback.logFileLocation);
        const logDir = dirname(logFile);
        
        if (!existsSync(logDir)) {
          mkdirSync(logDir, { recursive: true });
        }

        const logEntry = `${timestamp} ${fullMessage}\nReason: ${reason}\n\n`;
        
        // Append to log file (synchronous for simplicity, could be async in production)
        const fs = await import('fs');
        fs.appendFileSync(logFile, logEntry);
      } catch (error) {
        console.warn('Failed to write to fallback log file:', error.message);
      }
    }
  }

  generateNotificationId() {
    return `tg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async writeAuditLog(notificationId, status, message, metadata = {}) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      notificationId,
      status,
      message,
      metadata
    };

    this.auditLog.push(auditEntry);

    try {
      const logDir = dirname(AUDIT_LOG_FILE);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logLine = `${auditEntry.timestamp} [${status.toUpperCase()}] ${notificationId}: ${message}\n`;
      
      // Append to audit log file
      const fs = await import('fs');
      fs.appendFileSync(AUDIT_LOG_FILE, logLine);

      // Keep audit log in memory at reasonable size
      if (this.auditLog.length > 1000) {
        this.auditLog = this.auditLog.slice(-500);
      }
    } catch (error) {
      console.warn('Failed to write audit log:', error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API methods for specific notification types
  async notifyQuotaAlert(profile, usage, threshold) {
    const message = `Codex quota alert for profile "${profile}": ${usage}% usage (${threshold}% threshold)`;
    const context = {
      profile,
      usage_percent: usage,
      threshold_percent: threshold,
      alert_type: 'quota'
    };

    return this.sendNotification(message, {
      severity: usage >= 95 ? 'emergency' : 'critical',
      title: '🚨 Codex Quota Alert',
      context
    });
  }

  async notifySystemHealth(component, status, details = {}) {
    const message = `System health alert: ${component} is ${status}`;
    const context = {
      component,
      status,
      ...details,
      alert_type: 'health'
    };

    return this.sendNotification(message, {
      severity: status === 'down' ? 'emergency' : 'critical',
      title: '🏥 System Health Alert',
      context
    });
  }

  async notifyAgentError(agentId, error, context = {}) {
    const message = `Agent error: ${agentId} encountered ${error}`;
    const errorContext = {
      agent_id: agentId,
      error,
      ...context,
      alert_type: 'agent_error'
    };

    return this.sendNotification(message, {
      severity: 'critical',
      title: '🤖 Agent Error',
      context: errorContext
    });
  }

  async notifyResourceAlert(resource, usage, threshold) {
    const message = `Resource usage alert: ${resource} at ${usage}% (threshold: ${threshold}%)`;
    const resourceContext = {
      resource,
      usage_percent: usage,
      threshold_percent: threshold,
      alert_type: 'resource'
    };

    return this.sendNotification(message, {
      severity: usage >= 95 ? 'emergency' : 'critical',
      title: '📊 Resource Alert',
      context: resourceContext
    });
  }

  // Health check method
  async healthCheck() {
    const result = {
      telegram: {
        enabled: this.config.enabled && this.credentials.enabled,
        configured: !!(this.credentials.botToken && this.credentials.chatId),
        credentials_valid: this.credentials.enabled
      },
      rate_limit: {
        messages_sent_hour: this.rateLimitData.messagesSent,
        max_messages_hour: this.credentials.maxMessagesPerHour,
        last_message: this.rateLimitData.lastMessageTime
      },
      audit_log: {
        entries: this.auditLog.length,
        last_entry: this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1].timestamp : null
      }
    };

    return result;
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
      case '--test':
        options.test = true;
        break;
      case '--message':
        options.message = args[++i];
        break;
      case '--severity':
        options.severity = args[++i];
        break;
      case '--title':
        options.title = args[++i];
        break;
      case '--health':
        options.health = true;
        break;
      case '--bypass-rate-limit':
        options.bypassRateLimit = true;
        break;
      case '--help':
      case '-h':
        console.log(`
MAF Telegram Notifier

Usage: node telegram-notifier.mjs [options]

Options:
  --test                    Send a test notification
  --message MESSAGE         Custom message to send
  --severity LEVEL          Severity: info, warning, critical, emergency
  --title TITLE             Message title
  --health                  Show notifier health status
  --bypass-rate-limit      Bypass rate limiting for this message
  --help, -h               Show this help message

Examples:
  node telegram-notifier.mjs --test
  node telegram-notifier.mjs --message "Custom alert" --severity critical --title "Test Alert"
  node telegram-notifier.mjs --health
        `);
        process.exit(0);
        break;
    }
  }
  
  const notifier = new TelegramNotifier();

  if (options.health) {
    const health = await notifier.healthCheck();
    console.log('Telegram Notifier Health Status:');
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  if (options.test || options.message) {
    const message = options.message || 'Test notification from MAF Telegram notifier';
    const severity = options.severity || 'info';
    const title = options.title || '🧪 Test Notification';

    const result = await notifier.sendNotification(message, {
      severity,
      title,
      bypassRateLimit: options.bypassRateLimit
    });

    if (result.success) {
      console.log(`✅ Notification sent successfully (ID: ${result.notificationId})`);
    } else {
      console.log(`❌ Notification failed: ${result.reason} (ID: ${result.notificationId})`);
      process.exit(1);
    }
  } else {
    console.log('No action specified. Use --help for usage information.');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { TelegramNotifier };
