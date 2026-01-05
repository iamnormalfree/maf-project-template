#!/bin/bash
#
# Multi-Project Log Cleanup & Maintenance
# Designed for autonomous agent infrastructure across multiple projects
#
# Run: Daily via cron
# Supports centralized log storage with tiered retention

set -e

# ============================================
# CONFIGURATION
# ============================================

PROJECTS_ROOT="/root/projects"
CENTRAL_LOG_DIR="${PROJECTS_ROOT}/.agent-logs-central"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Tiered retention (in days)
RETENTION_HOT=7         # Keep raw logs for 7 days (session recovery)
RETENTION_WARM=90       # Keep compressed logs for 90 days (audit)
RETENTION_COLD=180      # Keep archives for 180 days (rare access)

# Size thresholds
MAX_LOG_SIZE_MB=100
MAX_DB_SIZE_MB=2000

# Logging
MAINTENANCE_LOG="/tmp/multi-project-cleanup.log"
SUMMARY_FILE="/tmp/multi-project-summary.txt"

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
            -d "parse_mode=Markdown" >/dev/null 2>&1 || log "Failed to send Telegram"
    fi
}

human_size() {
    local bytes=$1
    if [[ $bytes -lt 1048576 ]]; then
        echo "$((bytes / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$((bytes / 1048576))MB"
    else
        echo "$((bytes / 1073741824))GB"
    fi
}

# ============================================
# PHASE 1: HOT TIER - Session Recovery (0-7 days)
# ============================================
phase_hot_tier() {
    local total_size=0
    local file_count=0

    log "=== PHASE 1: HOT TIER (Session Recovery) ==="

    # Ensure raw logs exist for recent sessions
    for project_dir in "$PROJECTS_ROOT"/*/; do
        project_name=$(basename "$project_dir")

        # Skip non-project directories
        [[ -d "$project_dir/.git" ]] || continue

        # Create log directory if missing
        mkdir -p "$project_dir/.agent-mail/logs"

        # Check server.log
        local server_log="$project_dir/.agent-mail/logs/server.log"
        if [[ -f "$server_log" ]]; then
            local size=$(stat -c%s "$server_log" 2>/dev/null || echo 0)
            local size_mb=$((size / 1048576))

            # Rotate if too large
            if [[ $size_mb -gt $MAX_LOG_SIZE_MB ]]; then
                local timestamp=$(date +%Y%m%d_%H%M%S)
                local archive="${server_log}.${timestamp}"

                mv "$server_log" "$archive"
                gzip "$archive"

                local compressed_size=$(stat -c%s "${archive}.gz" 2>/dev/null || echo 0)
                total_size=$((total_size + size - compressed_size))
                file_count=$((file_count + 1))

                log "Rotated $project_name server.log: ${size_mb}MB -> $(human_size $compressed_size)"
            fi
        fi
    done

    echo "$total_size|$file_count"
}

# ============================================
# PHASE 2: WARM TIER - Audit Trail (7-90 days)
# ============================================
phase_warm_tier() {
    local deleted_size=0
    local deleted_count=0

    log "=== PHASE 2: WARM TIER (Audit Trail) ==="

    # Clean logs older than WARM retention but keep compressed
    find "$PROJECTS_ROOT" -name "server.log.*.gz" -mtime +$RETENTION_WARM -type f -print0 2>/dev/null | while IFS= read -r -d '' file; do
        local size=$(stat -c%s "$file" 2>/dev/null || echo 0)
        rm -f "$file"
        deleted_size=$((deleted_size + size))
        deleted_count=$((deleted_count + 1))
        log "Deleted old archive: $(basename "$file")"
    done

    echo "$deleted_size|$deleted_count"
}

# ============================================
# PHASE 3: COLD TIER - Long-term Archive (90-180 days)
# ============================================
phase_cold_tier() {
    local archived_count=0

    log "=== PHASE 3: COLD TIER (Long-term Archive) ==="

    # Move very old logs to central archive (if configured)
    if [[ -d "$CENTRAL_LOG_DIR" ]]; then
        mkdir -p "$CENTRAL_LOG_DIR/archive"

        find "$PROJECTS_ROOT" -name "*.log.*.gz" -mtime +$RETENTION_WARM -type f -print0 2>/dev/null | while IFS= read -r -d '' file; do
            local project=$(echo "$file" | sed "s|${PROJECTS_ROOT}/||" | cut -d/ -f1)
            local filename=$(basename "$file")
            local target_dir="${CENTRAL_LOG_DIR}/${project}"

            mkdir -p "$target_dir"
            mv "$file" "${target_dir}/${filename}"
            archived_count=$((archived_count + 1))
        done
    fi

    echo "$archived_count"
}

# ============================================
# PHASE 4: Database Maintenance
# ============================================
phase_db_maintenance() {
    local total_size=0

    log "=== PHASE 4: Database Maintenance ==="

    for project_dir in "$PROJECTS_ROOT"/*/; do
        project_name=$(basename "$project_dir")
        [[ -d "$project_dir/.git" ]] || continue

        local db="$project_dir/.agent-mail/storage.sqlite3"

        if [[ -f "$db" ]]; then
            local size=$(stat -c%s "$db" 2>/dev/null || echo 0)
            local size_mb=$((size / 1048576))

            total_size=$((total_size + size))

            # Vacuum if database is getting large
            if [[ $size_mb -gt 500 ]]; then
                log "Vacuuming $project_name database (${size_mb}MB)..."
                # sqlite3 "$db" "VACUUM;" 2>/dev/null || true
            fi
        fi
    done

    echo "$total_size"
}

# ============================================
# PHASE 5: Storage Summary
# ============================================
phase_summary() {
    log "=== PHASE 5: Storage Summary ==="

    local total_logs=0
    local total_dbs=0
    local total_chroma=0
    local project_count=0

    for project_dir in "$PROJECTS_ROOT"/*/; do
        project_name=$(basename "$project_dir")
        [[ -d "$project_dir/.git" ]] || continue

        project_count=$((project_count + 1))

        # Logs
        local logs=$(du -sb "$project_dir/.agent-mail/logs" 2>/dev/null | awk '{print $1}') || echo 0
        total_logs=$((total_logs + logs))

        # Databases
        local db=$(du -sb "$project_dir/.agent-mail/storage.sqlite3" 2>/dev/null | awk '{print $1}') || echo 0
        total_dbs=$((total_dbs + db))

        # ChromaDB
        local chroma=$(du -sb "$project_dir/.maf/state/memory/chroma" 2>/dev/null | awk '{print $1}') || echo 0
        total_chroma=$((total_chroma + chroma))
    done

    cat > "$SUMMARY_FILE" << EOF
📊 Multi-Project Storage Summary

Projects scanned: ${project_count}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 Storage Breakdown:
  • Logs (hot + warm): $(human_size $total_logs)
  • Agent Mail DBs: $(human_size $total_dbs)
  • ChromaDB (memory): $(human_size $total_chroma)
  • Total: $(human_size $((total_logs + total_dbs + total_chroma)))

💾 Per Project Average: $(human_size $(( (total_logs + total_dbs + total_chroma) / (project_count + 1) )))

⏰ Run time: $(date '+%Y-%m-%d %H:%M:%S')
EOF

    cat "$SUMMARY_FILE"
}

# ============================================
# MAIN EXECUTION
# ============================================
main() {
    log "=== Multi-Project Cleanup Started ==="

    local hot_result hot_freed hot_rotated
    local warm_result warm_freed warm_deleted
    local cold_archived
    local db_size

    hot_result=$(phase_hot_tier)
    IFS='|' read -r hot_freed hot_rotated <<< "$hot_result"

    warm_result=$(phase_warm_tier)
    IFS='|' read -r warm_freed warm_deleted <<< "$warm_result"

    cold_archived=$(phase_cold_tier)
    db_size=$(phase_db_maintenance)

    phase_summary

    local total_freed=$((hot_freed + warm_freed))

    log "=== Cleanup Complete ==="
    log "Rotated: $hot_rotated files"
    log "Deleted: $warm_deleted files"
    log "Freed: $(human_size $total_freed)"

    # Send Telegram notification
    if [[ $hot_rotated -gt 0 || $warm_deleted -gt 0 ]]; then
        local telegram_msg="🧹 *Multi-Project Cleanup Complete*

$(cat "$SUMMARY_FILE")

📊 *Actions Taken:*
• Rotated: ${hot_rotated} files
• Deleted: ${warm_deleted} files
• Archived: ${cold_archived} files
• Freed: $(human_size $total_freed)"

        send_telegram "$telegram_msg"
    fi
}

main "$@"
