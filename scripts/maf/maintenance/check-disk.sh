#!/bin/bash
#
# Disk Space Monitoring Script with Telegram Alerts
# Path: /root/projects/roundtable/scripts/maf/maintenance/check-disk.sh
#
# Run: every 30 minutes via cron
# Alerts at 75% (warning), 85% (critical), 95% (emergency)

set -e

# Configuration
WARNING_THRESHOLD=75
CRITICAL_THRESHOLD=85
EMERGENCY_THRESHOLD=95
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Logging
DISK_CHECK_LOG="/tmp/disk-check.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$DISK_CHECK_LOG"
}

send_telegram() {
    local message="$1"
    if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
        curl -s -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=Markdown" >/dev/null 2>&1 || log "Failed to send Telegram alert"
    fi
}

# Get disk usage for root partition
disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
available=$(df -h / | awk 'NR==2 {print $4}')
used=$(df -h / | awk 'NR==2 {print $3}')
total=$(df -h / | awk 'NR==2 {print $2}')

log "Disk usage check: ${disk_usage}% used, ${available} available"

# Alert history tracking (prevent spamming)
ALERT_FLAG_FILE="/tmp/disk-alert-sent-${disk_usage}"
LAST_ALERT_FILE="/tmp/last-disk-alert"

# Determine alert level
if [[ $disk_usage -ge $EMERGENCY_THRESHOLD ]]; then
    ALERT_LEVEL="🚨 EMERGENCY"
    EMOJI="🚨"
    ALERT_TYPE="emergency"
elif [[ $disk_usage -ge $CRITICAL_THRESHOLD ]]; then
    ALERT_LEVEL="⚠️ CRITICAL"
    EMOJI="⚠️"
    ALERT_TYPE="critical"
elif [[ $disk_usage -ge $WARNING_THRESHOLD ]]; then
    ALERT_LEVEL="⚡ WARNING"
    EMOJI="⚡"
    ALERT_TYPE="warning"
else
    # No alert needed, clean up old alert flags
    rm -f /tmp/disk-alert-sent-* 2>/dev/null || true
    exit 0
fi

# Check if we already sent this alert
if [[ -f "$ALERT_FLAG_FILE" ]]; then
    # Alert already sent for this threshold, skip
    # But still log it
    log "${ALERT_LEVEL}: Disk at ${disk_usage}% (alert already sent)"
    exit 0
fi

# Check rate limiting (max 1 alert per hour per level)
if [[ -f "$LAST_ALERT_FILE" ]]; then
    last_alert=$(cat "$LAST_ALERT_FILE")
    current_time=$(date +%s)
    alert_age=$((current_time - last_alert))
    if [[ $alert_age -lt 3600 ]]; then  # 1 hour = 3600 seconds
        log "Rate limit: alert sent ${alert_age}s ago, skipping"
        exit 0
    fi
fi

# Send alert
message="${EMOJI} *${ALERT_LEVEL}: Disk Space Alert*

💾 *Disk Status:*
• Usage: \`${disk_usage}%\`
• Used: ${used} / ${total}
• Available: ${available}"

# Add suggestions based on level
if [[ $ALERT_TYPE == "emergency" ]]; then
    message+="

🔥 *IMMEDIATE ACTION REQUIRED*

Run emergency cleanup:
\`/root/projects/roundtable/scripts/maf/maintenance/rotate-logs.sh\`

Check largest directories:
\`du -sh /root/* | sort -hr | head -10\`"
elif [[ $ALERT_TYPE == "critical" ]]; then
    message+="

⚡ *Action Recommended*

Consider running log rotation:
\`/root/projects/roundtable/scripts/maf/maintenance/rotate-logs.sh\`"
elif [[ $ALERT_TYPE == "warning" ]]; then
    message+="

📝 *Monitor Closely*

Log rotation will run automatically tonight."
fi

message+="

⏰ $(date '+%Y-%m-%d %H:%M:%S')"

send_telegram "$message"

# Mark this alert as sent
echo "$ALERT_TYPE" > "$ALERT_FLAG_FILE"
date +%s > "$LAST_ALERT_FILE"

log "${ALERT_LEVEL}: Alert sent for ${disk_usage}% usage"

exit 0
