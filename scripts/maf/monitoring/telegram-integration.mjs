#!/usr/bin/env node
// ABOUTME: Integration hooks for Telegram notifications in MAF monitoring systems.
// ABOUTME: Provides hooks for quota-status.mjs, health-monitor.sh, and other monitoring components.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fixed project root detection - scripts/maf/monitoring -> project root
const PROJECT_ROOT = join(__dirname, '../../..');

// Import TelegramNotifier
import { TelegramNotifier } from './telegram-notifier.mjs';

class TelegramIntegration {
  constructor() {
    this.notifier = new TelegramNotifier();
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configPath = join(PROJECT_ROOT, 'scripts/maf/monitoring/monitoring-config.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        return {
          enabled: config.monitoring?.telegram?.enabled || false,
          integration: {
            quota_alerts: config.monitoring?.telegram?.integration?.quota_alerts || true,
            health_alerts: config.monitoring?.telegram?.integration?.health_alerts || true,
            agent_error_alerts: config.monitoring?.telegram?.integration?.agent_error_alerts || true,
            resource_alerts: config.monitoring?.telegram?.integration?.resource_alerts || true,
            system_alerts: config.monitoring?.telegram?.integration?.system_alerts || true
          }
        };
      }
    } catch (error) {
      console.warn('Warning: Failed to load Telegram integration config:', error.message);
    }

    return {
      enabled: false,
      integration: {
        quota_alerts: true,
        health_alerts: true,
        agent_error_alerts: true,
        resource_alerts: true,
        system_alerts: true
      }
    };
  }

  // Hook for quota-status.mjs quota alerts
  async handleQuotaAlert(profileData, thresholdType, currentUsage) {
    if (!this.config.enabled || !this.config.integration.quota_alerts) {
      return { skipped: 'Telegram integration disabled' };
    }

    try {
      const { name, usage, limit } = profileData;
      const usagePercent = Math.round((usage / limit) * 100);
      
      let severity = 'warning';
      if (thresholdType === 'critical' || usagePercent >= 90) {
        severity = 'critical';
      } else if (thresholdType === 'emergency' || usagePercent >= 95) {
        severity = 'emergency';
      }

      const message = `Codex quota alert for profile "${name}": ${usagePercent}% usage (${usage.toLocaleString()}/${limit.toLocaleString()} requests)`;
      
      return await this.notifier.notifyQuotaAlert(name, usagePercent, this.getThresholdPercent(thresholdType));
      
    } catch (error) {
      console.warn('Telegram quota alert failed:', error.message);
      return { error: error.message };
    }
  }

  // Hook for health-monitor.sh system health alerts
  async handleHealthAlert(component, status, details = {}) {
    if (!this.config.enabled || !this.config.integration.health_alerts) {
      return { skipped: 'Telegram integration disabled' };
    }

    try {
      const message = `System health alert: ${component} is ${status}`;
      
      return await this.notifier.notifySystemHealth(component, status, details);
      
    } catch (error) {
      console.warn('Telegram health alert failed:', error.message);
      return { error: error.message };
    }
  }

  // Hook for agent error notifications
  async handleAgentError(agentId, error, context = {}) {
    if (!this.config.enabled || !this.config.integration.agent_error_alerts) {
      return { skipped: 'Telegram integration disabled' };
    }

    try {
      return await this.notifier.notifyAgentError(agentId, error, context);
      
    } catch (error) {
      console.warn('Telegram agent error alert failed:', error.message);
      return { error: error.message };
    }
  }

  // Hook for resource usage alerts
  async handleResourceAlert(resource, usage, threshold) {
    if (!this.config.enabled || !this.config.integration.resource_alerts) {
      return { skipped: 'Telegram integration disabled' };
    }

    try {
      return await this.notifier.notifyResourceAlert(resource, usage, threshold);
      
    } catch (error) {
      console.warn('Telegram resource alert failed:', error.message);
      return { error: error.message };
    }
  }

  // Hook for general system alerts
  async handleSystemAlert(title, message, severity = 'warning', context = {}) {
    if (!this.config.enabled || !this.config.integration.system_alerts) {
      return { skipped: 'Telegram integration disabled' };
    }

    try {
      return await this.notifier.sendNotification(message, {
        severity,
        title,
        context: { ...context, alert_type: 'system' }
      });
      
    } catch (error) {
      console.warn('Telegram system alert failed:', error.message);
      return { error: error.message };
    }
  }

  // Utility method to get threshold percentage
  getThresholdPercent(thresholdType) {
    const thresholds = {
      warning: 50,
      critical: 90,
      emergency: 95
    };
    return thresholds[thresholdType] || 90;
  }

  // Health check for the integration system
  async healthCheck() {
    const telegramHealth = await this.notifier.healthCheck();
    
    return {
      integration: {
        enabled: this.config.enabled,
        integration_settings: this.config.integration
      },
      telegram: telegramHealth,
      status: this.config.enabled && telegramHealth.telegram.configured ? 'healthy' : 'disabled'
    };
  }
}

// CLI interface for testing integration
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--test-quota':
        options.testQuota = true;
        break;
      case '--test-health':
        options.testHealth = true;
        break;
      case '--test-agent-error':
        options.testAgentError = true;
        break;
      case '--test-resource':
        options.testResource = true;
        break;
      case '--test-system':
        options.testSystem = true;
        break;
      case '--health':
        options.health = true;
        break;
      case '--help':
      case '-h':
        console.log(`
MAF Telegram Integration Test

Usage: node telegram-integration.mjs [test-options]

Test Options:
  --test-quota           Test quota alert integration
  --test-health          Test health alert integration
  --test-agent-error     Test agent error integration
  --test-resource        Test resource alert integration
  --test-system          Test system alert integration
  --health               Show integration health status
  --help, -h           Show this help message

Examples:
  node telegram-integration.mjs --test-quota
  node telegram-integration.mjs --health
        `);
        process.exit(0);
        break;
    }
  }
  
  const integration = new TelegramIntegration();

  if (options.health) {
    const health = await integration.healthCheck();
    console.log('Telegram Integration Health Status:');
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  if (options.testQuota) {
    const testProfile = {
      name: 'test-profile',
      usage: 950,
      limit: 1000
    };
    
    console.log('Testing quota alert integration...');
    const result = await integration.handleQuotaAlert(testProfile, 'critical', 95);
    console.log('Result:', result);
    return;
  }

  if (options.testHealth) {
    console.log('Testing health alert integration...');
    const result = await integration.handleHealthAlert('agent_connectivity', 'down', { agent_id: 'test-agent-123' });
    console.log('Result:', result);
    return;
  }

  if (options.testAgentError) {
    console.log('Testing agent error integration...');
    const result = await integration.handleAgentError('test-agent-456', 'Connection timeout', { retry_count: 3 });
    console.log('Result:', result);
    return;
  }

  if (options.testResource) {
    console.log('Testing resource alert integration...');
    const result = await integration.handleResourceAlert('CPU', 92, 80);
    console.log('Result:', result);
    return;
  }

  if (options.testSystem) {
    console.log('Testing system alert integration...');
    const result = await integration.handleSystemAlert('Custom Alert', 'This is a test system alert', 'warning', { component: 'test-component' });
    console.log('Result:', result);
    return;
  }

  console.log('No test specified. Use --help for usage information.');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { TelegramIntegration };
