# MAF Telegram Notification Infrastructure

This document describes the Telegram notification infrastructure implemented for the Multi-Agent Framework (MAF) monitoring system.

## Overview

The Telegram notification system provides real-time alerts for critical system events, quota issues, agent errors, and resource utilization problems. It includes rate limiting, retry logic with exponential backoff, comprehensive audit logging, and graceful fallback mechanisms.

## Architecture

### Core Components

1. **TelegramNotifier** (`telegram-notifier.mjs`)
   - Core notification engine with Telegram Bot API integration
   - Rate limiting with severity-based bypass for critical messages
   - Exponential backoff retry logic
   - Message formatting and validation
   - Comprehensive audit logging

2. **TelegramIntegration** (`telegram-integration.mjs`)
   - Integration hooks for existing MAF monitoring systems
   - Specialized notification methods for different alert types
   - Health monitoring for the integration system

3. **Configuration System**
   - `telegram.env` - Secure credential storage
   - `monitoring-config.json` - Integration settings and thresholds
   - Environment-based configuration management

## Features

### 🔐 Security & Validation
- **Token Validation**: Validates Telegram bot token format
- **Chat ID Validation**: Ensures proper chat ID format
- **Secure Storage**: Credentials stored with 600 permissions
- **Configurable Validation**: Can enable/disable validation as needed

### 🚦 Rate Limiting
- **Hourly Limits**: Configurable maximum messages per hour (default: 10)
- **Cooldown Period**: Minimum time between messages (default: 5 minutes)
- **Severity Bypass**: Critical and emergency messages bypass rate limiting
- **Smart Bypass**: Configurable bypass for different severity levels

### 🔄 Retry Logic
- **Exponential Backoff**: Intelligent retry with increasing delays
- **Configurable Attempts**: Set maximum retry attempts (default: 3)
- **Timeout Management**: Configurable request timeouts (default: 10s)
- **Max Delay Capping**: Prevents excessive wait times

### 📊 Message Formatting
- **Markdown Support**: Rich text formatting with Markdown
- **Severity Indicators**: Visual indicators for different alert levels
- **Context Information**: Automatic inclusion of relevant metadata
- **Message Truncation**: Handles long messages gracefully

### 📝 Audit Logging
- **Comprehensive Tracking**: All notification attempts logged
- **Delivery Status**: Success, failure, rate-limit, and error tracking
- **Performance Metrics**: Duration and attempt tracking
- **Structured Logging**: JSON-formatted audit entries

### 🛡️ Fallback Mechanisms
- **Console Fallback**: Immediate console output on failures
- **Log File Fallback**: Persistent logging for failed notifications
- **Graceful Degradation**: System continues operating during Telegram issues
- **Configurable Fallbacks**: Enable/disable fallback mechanisms

## Configuration

### 1. Telegram Credentials

Edit `.maf/credentials/telegram.env`:

```bash
# Bot Configuration
export TELEGRAM_BOT_TOKEN="8082021768:AAHKxsqnXwy_oZISuv-kannVBd8DCZYZKLs"
export TELEGRAM_CHAT_ID="YOUR_CHAT_ID_HERE"  # Replace with actual chat ID
export TELEGRAM_BOT_USERNAME=""

# Notification Settings
export TELEGRAM_ENABLED="true"
export TELEGRAM_NOTIFICATION_LEVEL="critical"  # info, warning, critical, emergency
export TELEGRAM_MAX_MESSAGES_PER_HOUR="10"
export TELEGRAM_COOLDOWN_SECONDS="300"

# Retry Configuration
export TELEGRAM_RETRY_ATTEMPTS="3"
export TELEGRAM_RETRY_BASE_DELAY="1000"  # milliseconds
export TELEGRAM_REQUEST_TIMEOUT="10000"  # milliseconds

# Security & Validation
export TELEGRAM_ENABLE_TOKEN_VALIDATION="true"
export TELEGRAM_ENABLE_CHAT_VALIDATION="true"

# Fallback Settings
export TELEGRAM_FALLBACK_TO_CONSOLE="true"
export TELEGRAM_FALLBACK_TO_LOG="true"
```

### 2. Monitoring Configuration

Update `scripts/maf/monitoring/monitoring-config.json`:

```json
{
  "monitoring": {
    "telegram": {
      "enabled": true,
      "default_level": "critical",
      "rate_limit": {
        "max_messages_per_hour": 10,
        "cooldown_seconds": 300,
        "bypass_for_critical": true
      },
      "retry": {
        "max_attempts": 3,
        "base_delay_ms": 1000,
        "max_delay_ms": 30000
      },
      "formatting": {
        "enable_markdown": true,
        "max_message_length": 4000,
        "truncate_long_messages": true
      },
      "fallback": {
        "console": true,
        "log_file": true,
        "log_file_location": ".maf/logs/telegram-fallback.log"
      },
      "integration": {
        "quota_alerts": true,
        "health_alerts": true,
        "agent_error_alerts": true,
        "resource_alerts": true,
        "system_alerts": true
      }
    }
  }
}
```

## Setup Instructions

### 1. Create Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/start` to begin
3. Send `/newbot` to create a new bot
4. Follow prompts to set bot name and username
5. Copy the bot token provided by BotFather

### 2. Get Your Chat ID

1. Start a chat with your new bot
2. Send `/start` to initialize the conversation
3. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Look for `"chat":{"id":123456789}` in the response
5. Copy the numeric ID for use in `TELEGRAM_CHAT_ID`

### 3. Configure Credentials

1. Edit `.maf/credentials/telegram.env`
2. Replace `TELEGRAM_BOT_TOKEN` with your actual bot token
3. Replace `TELEGRAM_CHAT_ID` with your actual chat ID
4. Set file permissions: `chmod 600 .maf/credentials/telegram.env`

### 4. Test Configuration

```bash
# Test health check
npm run maf:notify -- --health

# Send test message
npm run maf:notify -- --test

# Test with custom message
npm run maf:notify -- --message "Test notification" --severity info --title "Test"
```

## Usage

### Command Line Interface

```bash
# Basic usage
npm run maf:notify [options]

# Options
--test                    Send a test notification
--message MESSAGE         Custom message to send
--severity LEVEL          Severity: info, warning, critical, emergency
--title TITLE             Message title
--health                  Show notifier health status
--bypass-rate-limit      Bypass rate limiting for this message
--help                    Show help message
```

### Programmatic Usage

```javascript
import { TelegramNotifier } from './telegram-notifier.mjs';
import { TelegramIntegration } from './telegram-integration.mjs';

// Direct notifier usage
const notifier = new TelegramNotifier();
await notifier.sendNotification('Alert message', {
  severity: 'critical',
  title: '🚨 Critical Alert',
  context: { component: 'auth-service', error_code: 500 }
});

// Integration hook usage
const integration = new TelegramIntegration();
await integration.handleQuotaAlert(profileData, 'critical', 95);
await integration.handleHealthAlert('database', 'down', { replica: 'primary' });
```

## Integration Points

### 1. Quota Status Integration

The system integrates with `quota-status.mjs` to send alerts when:
- Codex quota exceeds warning threshold (default: 50%)
- Quota reaches critical levels (default: 90%)
- Emergency quota situations (default: 95%)

### 2. Health Monitor Integration

Integrates with `health-monitor.sh` for:
- Agent connectivity issues
- System resource problems
- Session integrity warnings
- Network connectivity problems

### 3. Agent Error Integration

Hooks into MAF agent systems for:
- Agent unresponsiveness
- Agent process failures
- Agent timeout situations
- Agent configuration errors

### 4. Resource Alert Integration

Monitors system resources and alerts on:
- High CPU usage (>80% default)
- Memory pressure (>85% default)
- Disk space issues (>90% default)
- Load average spikes

## Monitoring and Maintenance

### Health Checks

```bash
# Check notifier health
npm run maf:notify -- --health

# Check integration health
node scripts/maf/monitoring/telegram-integration.mjs --health

# Run comprehensive tests
node scripts/maf/monitoring/test-telegram.mjs
```

### Log Files

- **Audit Log**: `.maf/logs/telegram-audit.log`
- **Fallback Log**: `.maf/logs/telegram-fallback.log`
- **Monitoring Log**: `.maf/logs/monitoring.log`

### Rate Limit Cache

- **Location**: `.maf/cache/telegram-rate-limit.json`
- **Format**: Hourly message count and timing data
- **Purpose**: Prevents API rate limit violations

## Troubleshooting

### Common Issues

1. **"Invalid Telegram chat ID format"**
   - Ensure `TELEGRAM_CHAT_ID` is numeric only
   - Remove any @ symbols or prefixes
   - Test with BotFather's getUpdates endpoint

2. **"Notifications disabled"**
   - Check `TELEGRAM_ENABLED="true"` in credentials
   - Verify telegram.enabled in monitoring-config.json
   - Ensure configuration files are accessible

3. **Rate Limit Errors**
   - Check `TELEGRAM_MAX_MESSAGES_PER_HOUR` setting
   - Verify cooldown period is reasonable
   - Consider enabling bypass for critical messages

4. **API Timeouts**
   - Increase `TELEGRAM_REQUEST_TIMEOUT` value
   - Check network connectivity
   - Verify bot token is valid

### Debug Mode

Enable verbose logging:

```bash
# Enable debug logging in monitoring-config.json
{
  "logging": {
    "level": "debug",
    "structured_format": true
  }
}

# Check detailed health status
node scripts/maf/monitoring/telegram-notifier.mjs --health
```

### Validation Testing

```bash
# Test all integration points
node scripts/maf/monitoring/telegram-integration.mjs --test-quota
node scripts/maf/monitoring/telegram-integration.mjs --test-health
node scripts/maf/monitoring/telegram-integration.mjs --test-agent-error
node scripts/maf/monitoring/telegram-integration.mjs --test-resource
```

## Security Considerations

1. **Credential Protection**
   - Files have 600 permissions (owner read/write only)
   - Excluded from git via .gitignore
   - Environment variable separation

2. **Token Security**
   - Bot tokens validated for proper format
   - Optional token validation can be disabled
   - Secure storage in restricted directory

3. **Rate Limit Protection**
   - Prevents API abuse and excessive costs
   - Configurable limits for different environments
   - Intelligent bypass for critical alerts

## Performance Considerations

1. **Async Operations**
   - All HTTP requests are non-blocking
   - Retry logic with exponential backoff
   - Configurable timeouts

2. **Memory Management**
   - Audit log limited to 1000 entries
   - Rate limit cache pruned automatically
   - Efficient JSON parsing and formatting

3. **Network Efficiency**
   - Reused HTTP connections where possible
   - Payload size monitoring and truncation
   - Smart retry with increasing delays

## Future Enhancements

1. **Message Queuing**: Persistent queue for failed notifications
2. **Template System**: Customizable message templates
3. **Multi-Chat Support**: Send alerts to multiple chats
4. **Interactive Bots**: Bot commands for system interaction
5. **Advanced Filtering**: Regex-based message filtering
6. **Metrics Dashboard**: Web interface for notification metrics

## Contributing

When modifying the Telegram notification system:

1. Follow existing code patterns and style
2. Add comprehensive error handling
3. Update configuration schemas if needed
4. Add appropriate audit logging
5. Test with both enabled and disabled states
6. Verify fallback mechanisms work correctly
7. Update this documentation for API changes

## License

This notification system is part of the MAF project and follows the same licensing terms.
