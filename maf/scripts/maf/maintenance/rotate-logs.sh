#!/bin/bash
#
# Maintenance Script: Rotate and Clean Logs
# Path: /root/projects/roundtable/scripts/maf/maintenance/rotate-logs.sh
#
# Run: daily via cron
# Telegram notifications enabled via TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID

set -e

# Configuration
PROJECT_ROOT="/root/projects/roundtable"
AGENT_MAIL_LOGS="$PROJECT_ROOT/.agent-mail/logs"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Logging for this script itself
MAINTENANCE_LOG="/tmp/rotate-logs-maintenance.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$MAINTENANCE_LOG"
}

send_telegram() {
    local message="$1"
    if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
        curl -s -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=Markdown" >/dev/null 2>&1 || log "Failed to send Telegram notification"
    else
        log "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping notification"
    fi
}

# Format bytes to human readable
human_size() {
    local bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$((bytes / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$((bytes / 1048576))MB"
    else
        echo "$((bytes / 1073741824))GB"
    fi
}

log "=== Starting log rotation and cleanup ==="

# Summary tracking
rotated_count=0
deleted_count=0
freed_bytes=0

# ============================================
# 1. Rotate Agent Mail server.log if >100M
# ============================================
server_log="$AGENT_MAIL_LOGS/server.log"
if [[ -f "$server_log" ]]; then
    size=$(stat -c%s "$server_log" 2>/dev/null || echo 0)
    if [[ $size -gt 104857600 ]]; then  # 100MB
        timestamp=$(date +%Y%m%d_%H%M%S)
        archive_log="${server_log}.${timestamp}"
        mv "$server_log" "$archive_log"
        gzip "$archive_log"
        rotated_count=$((rotated_count + 1))
        compressed_size=$(stat -c%s "${archive_log}.gz" 2>/dev/null || echo 0)
        freed_bytes=$((freed_bytes + size - compressed_size))
        log "Rotated server.log ($(human_size $size) -> $(human_size $compressed_size) gzipped)"
    else
        log "server.log is $(human_size $size) - no rotation needed"
    fi
else
    log "server.log not found"
fi

# ============================================
# 2. Rotate telegram-bot.log if >50M
# ============================================
telegram_log="$PROJECT_ROOT/.agent-mail/telegram-bot.log"
if [[ -f "$telegram_log" ]]; then
    size=$(stat -c%s "$telegram_log" 2>/dev/null || echo 0)
    if [[ $size -gt 52428800 ]]; then  # 50MB
        timestamp=$(date +%Y%m%d_%H%M%S)
        archive_log="${telegram_log}.${timestamp}"
        # Keep last 1000 lines, archive the rest
        tail -1000 "$telegram_log" > "${telegram_log}.tmp"
        mv "${telegram_log}.tmp" "$telegram_log"
        gzip "$archive_log"
        rotated_count=$((rotated_count + 1))
        log "Rotated telegram-bot.log (kept last 1000 lines)"
    fi
fi

# ============================================
# 3. Clean old tmux logs (>7 days)
# ============================================
while IFS= read -r -d '' old_log; do
    size=$(stat -c%s "$old_log" 2>/dev/null || echo 0)
    rm -f "$old_log"
    deleted_count=$((deleted_count + 1))
    freed_bytes=$((freed_bytes + size))
    log "Deleted old tmux log: $(basename "$old_log")"
done < <(find "$PROJECT_ROOT" -maxdepth 1 -name "tmux-*.log" -mtime +7 -print0 2>/dev/null)

# ============================================
# 4. Clean pane activity logs (>7 days)
# ============================================
while IFS= read -r -d '' old_log; do
    size=$(stat -c%s "$old_log" 2>/dev/null || echo 0)
    rm -f "$old_log"
    deleted_count=$((deleted_count + 1))
    freed_bytes=$((freed_bytes + size))
    log "Deleted old activity log: $(basename "$old_log")"
done < <(find "$AGENT_MAIL_LOGS" -name "pane-*-activity.log" -mtime +7 -print0 2>/dev/null)

# ============================================
# 5. Clean old compressed logs (>30 days)
# ============================================
while IFS= read -r -d '' old_archive; do
    size=$(stat -c%s "$old_archive" 2>/dev/null || echo 0)
    rm -f "$old_archive"
    deleted_count=$((deleted_count + 1))
    freed_bytes=$((freed_bytes + size))
    log "Deleted old archive: $(basename "$old_archive")"
done < <(find "$AGENT_MAIL_LOGS" -name "*.log.*.gz" -mtime +30 -print0 2>/dev/null)

# ============================================
# 6. Clean old tmux-monitor logs (>7 days)
# ============================================
while IFS= read -r -d '' old_log; do
    size=$(stat -c%s "$old_log" 2>/dev/null || echo 0)
    rm -f "$old_log"
    deleted_count=$((deleted_count + 1))
    freed_bytes=$((freed_bytes + size))
    log "Deleted old monitor log: $(basename "$old_log")"
done < <(find "$PROJECT_ROOT/.agent-mail" -name "tmux-monitor-*.log" -mtime +7 -print0 2>/dev/null)

# ============================================
# 7. Check current disk usage
# ============================================
current_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
available_gb=$(df / | awk 'NR==2 {print $4}')
available_gb=$((available_gb / 1048576))  # Convert KB to GB

# ============================================
# 8. Generate summary report
# ============================================
log "=== Cleanup complete ==="
log "Rotated: $rotated_count files"
log "Deleted: $deleted_count files"
log "Freed: $(human_size $freed_bytes)"
log "Current disk usage: ${current_usage}%"
log "Available: ${available_gb}GB"

# ============================================
# 9. Send Telegram notification
# ============================================
if [[ $rotated_count -gt 0 || $deleted_count -gt 0 ]]; then
    telegram_message="🧹 *Log Rotation Complete*

📊 *Summary:*
• Rotated: ${rotated_count} files
• Deleted: ${deleted_count} files
• Freed: $(human_size $freed_bytes)

💾 *Disk Status:*
• Usage: ${current_usage}%
• Available: ${available_gb}GB

⏰ Run time: $(date '+%Y-%m-%d %H:%M:%S')"

    send_telegram "$telegram_message"
else
    log "No action needed - all logs within limits"
fi

exit 0
