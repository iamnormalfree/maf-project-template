#!/bin/bash
# ABOUTME: Log rotation and cleanup system for MAF tmux orchestration.
# ABOUTME: Manages log file sizes, retention, and archiving for all MAF logs.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
CONFIG_FILE="$SCRIPT_DIR/monitoring-config.json"
MAX_LOG_SIZE_MB=${1:-50}
MAX_LOG_FILES=${2:-5}
RETENTION_DAYS=${3:-7}
DRY_RUN=${4:-false}

# Log directories
AGENT_LOGS_DIR="$PROJECT_ROOT/.maf/logs/agents"
CENTRALIZED_LOGS_DIR="$PROJECT_ROOT/.maf/centralized-logs"
MONITORING_LOGS_DIR="$PROJECT_ROOT/.maf/monitoring"
SYSTEM_LOGS_DIR="$PROJECT_ROOT/.maf/logs"
AGENT_MAIL_LOGS_DIR="$PROJECT_ROOT/.agent-mail/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_rotate_info() {
    echo -e "${BLUE}[LOG-ROTATE]${NC} $1"
}

log_rotate_success() {
    echo -e "${GREEN}[LOG-ROTATE]${NC} $1"
}

log_rotate_warning() {
    echo -e "${YELLOW}[LOG-ROTATE]${NC} $1"
}

log_rotate_error() {
    echo -e "${RED}[LOG-ROTATE]${NC} $1"
}

# Load configuration from file if available
load_rotation_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        MAX_LOG_SIZE_MB=$(jq -r '.monitoring.max_log_file_size_mb // 50' "$CONFIG_FILE")
        MAX_LOG_FILES=$(jq -r '.logging.max_files // 5' "$CONFIG_FILE")
        RETENTION_DAYS=$(jq -r '.monitoring.log_retention_days // 7' "$CONFIG_FILE")
    fi
}

# Convert MB to bytes
mb_to_bytes() {
    local mb=$1
    echo $((mb * 1024 * 1024))
}

# Rotate a single log file
rotate_log_file() {
    local log_file="$1"
    local max_files="$2"
    
    if [[ ! -f "$log_file" ]]; then
        return 0
    fi
    
    local file_size_bytes
    file_size_bytes=$(stat -c%s "$log_file" 2>/dev/null || echo "0")
    local max_size_bytes
    max_size_bytes=$(mb_to_bytes "$MAX_LOG_SIZE_MB")
    
    # Check if file needs rotation
    if [[ $file_size_bytes -lt $max_size_bytes ]]; then
        return 0
    fi
    
    local filename=$(basename "$log_file")
    local dirname=$(dirname "$log_file")
    
    log_rotate_info "Rotating log file: $filename (size: $((file_size_bytes / 1024 / 1024))MB)"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_rotate_info "DRY RUN: Would rotate $filename"
        return 0
    fi
    
    # Remove oldest log if it exists
    if [[ -f "${log_file}.${max_files}" ]]; then
        rm "${log_file}.${max_files}"
        log_rotate_info "Removed oldest rotation: ${filename}.${max_files}"
    fi
    
    # Shift existing logs
    local i=$((max_files - 1))
    while [[ $i -ge 1 ]]; do
        if [[ -f "${log_file}.${i}" ]]; then
            mv "${log_file}.${i}" "${log_file}.$((i + 1))"
            log_rotate_info "Shifted: ${filename}.${i} -> ${filename}.$((i + 1))"
        fi
        ((i--))
    done
    
    # Move current log to .1
    mv "$log_file" "${log_file}.1"
    log_rotate_info "Moved: ${filename} -> ${filename}.1"
    
    # Create new empty log file
    touch "$log_file"
    log_rotate_info "Created new log file: $filename"
    
    return 1  # Indicate that rotation occurred
}

# Rotate logs in a directory
rotate_directory_logs() {
    local dir_path="$1"
    local pattern="$2"
    local description="$3"
    
    log_rotate_info "Processing $description in: $dir_path"
    
    if [[ ! -d "$dir_path" ]]; then
        log_rotate_warning "Directory not found: $dir_path"
        return 0
    fi
    
    local rotated_count=0
    
    # Find matching log files
    while IFS= read -r -d '' log_file; do
        if rotate_log_file "$log_file" "$MAX_LOG_FILES"; then
            ((rotated_count++))
        fi
    done < <(find "$dir_path" -name "$pattern" -type f -print0 2>/dev/null)
    
    log_rotate_info "Rotated $rotated_count $description logs"
    return $rotated_count
}

# Compress old rotated logs
compress_rotated_logs() {
    local dir_path="$1"
    local description="$2"
    
    log_rotate_info "Compressing old $description logs"
    
    if [[ ! -d "$dir_path" ]]; then
        return 0
    fi
    
    local compressed_count=0
    
    # Find .log files older than 1 day
    while IFS= read -r -d '' log_file; do
        local filename=$(basename "$log_file")
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log_rotate_info "DRY RUN: Would compress $filename"
            ((compressed_count++))
            continue
        fi
        
        # Compress the file
        if gzip -f "$log_file" 2>/dev/null; then
            log_rotate_info "Compressed: $filename"
            ((compressed_count++))
        fi
    done < <(find "$dir_path" -name "*.log.[1-9]" -type f -mtime +1 -print0 2>/dev/null)
    
    log_rotate_info "Compressed $compressed_count $description logs"
    return $compressed_count
}

# Archive logs older than retention period
archive_old_logs() {
    local dir_path="$1"
    local description="$2"
    local archive_dir="$PROJECT_ROOT/.maf/logs/archived/$(basename "$dir_path")"
    
    log_rotate_info "Archiving old $description logs (older than $RETENTION_DAYS days)"
    
    if [[ ! -d "$dir_path" ]]; then
        return 0
    fi
    
    mkdir -p "$archive_dir"
    
    local archived_count=0
    
    # Find compressed logs older than retention period
    while IFS= read -r -d '' log_file; do
        local filename=$(basename "$log_file")
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log_rotate_info "DRY RUN: Would archive $filename"
            ((archived_count++))
            continue
        fi
        
        # Move to archive directory
        mv "$log_file" "$archive_dir/"
        log_rotate_info "Archived: $filename"
        ((archived_count++))
    done < <(find "$dir_path" -name "*.log.*.gz" -type f -mtime "+$RETENTION_DAYS" -print0 2>/dev/null)
    
    log_rotate_info "Archived $archived_count $description logs"
    return $archived_count
}

# Show log statistics
show_log_statistics() {
    log_rotate_info "Log file statistics"
    
    local dirs=(
        "$AGENT_LOGS_DIR:Agent Logs"
        "$CENTRALIZED_LOGS_DIR:Centralized Logs"
        "$MONITORING_LOGS_DIR:Monitoring Logs"
        "$SYSTEM_LOGS_DIR:System Logs"
        "$AGENT_MAIL_LOGS_DIR:Agent Mail Logs"
    )
    
    printf "%-20s %10s %15s\n" "Directory" "Files" "Total Size"
    echo "----------------------------------------------------"
    
    for dir_info in "${dirs[@]}"; do
        local dir_path="${dir_info%%:*}"
        local description="${dir_info##*:}"
        
        if [[ -d "$dir_path" ]]; then
            local file_count=$(find "$dir_path" -type f | wc -l)
            local total_size=$(du -sh "$dir_path" 2>/dev/null | cut -f1)
            printf "%-20s %10s %15s\n" "$description" "$file_count" "$total_size"
        else
            printf "%-20s %10s %15s\n" "$description" "0" "0B"
        fi
    done
}

# Main rotation function
perform_log_rotation() {
    log_rotate_info "Starting MAF log rotation"
    log_rotate_info "Max log size: ${MAX_LOG_SIZE_MB}MB"
    log_rotate_info "Max rotated files: $MAX_LOG_FILES"
    log_rotate_info "Retention days: $RETENTION_DAYS"
    log_rotate_info "Dry run: $DRY_RUN"
    echo
    
    local total_rotated=0
    
    # Rotate agent logs
    local agent_rotated=0
    if [[ -d "$AGENT_LOGS_DIR" ]]; then
        rotate_directory_logs "$AGENT_LOGS_DIR" "*.log" "agent"
        agent_rotated=$?
        ((total_rotated += agent_rotated))
        
        # Also rotate logs in subdirectories
        while IFS= read -r -d '' agent_dir; do
            rotate_directory_logs "$agent_dir" "*.log" "agent subdirectory"
            local subdir_rotated=$?
            ((total_rotated += subdir_rotated))
        done < <(find "$AGENT_LOGS_DIR" -mindepth 1 -type d -print0 2>/dev/null)
    fi
    
    # Rotate monitoring logs
    local monitoring_rotated=0
    rotate_directory_logs "$MONITORING_LOGS_DIR" "*.log" "monitoring"
    monitoring_rotated=$?
    ((total_rotated += monitoring_rotated))
    
    # Rotate system logs
    local system_rotated=0
    rotate_directory_logs "$SYSTEM_LOGS_DIR" "*.log" "system"
    system_rotated=$?
    ((total_rotated += system_rotated))
    
    # Rotate agent mail logs
    local mail_rotated=0
    if [[ -d "$AGENT_MAIL_LOGS_DIR" ]]; then
        rotate_directory_logs "$AGENT_MAIL_LOGS_DIR" "*.log" "agent mail"
        mail_rotated=$?
        ((total_rotated += mail_rotated))
    fi
    
    echo
    log_rotate_success "Log rotation completed. Total files rotated: $total_rotated"
    
    # Show statistics
    echo
    show_log_statistics
    
    return 0
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Load configuration
    load_rotation_config
    
    # Parse command line arguments
    case "${1:-rotate}" in
        "rotate")
            perform_log_rotation
            ;;
        "compress")
            local dir_path="${2:-$CENTRALIZED_LOGS_DIR}"
            local description="${3:-logs}"
            compress_rotated_logs "$dir_path" "$description"
            ;;
        "archive")
            local dir_path="${2:-$CENTRALIZED_LOGS_DIR}"
            local description="${3:-logs}"
            archive_old_logs "$dir_path" "$description"
            ;;
        "stats")
            show_log_statistics
            ;;
        "dry-run")
            DRY_RUN=true
            perform_log_rotation
            ;;
        "help"|*)
            echo "Usage: $0 {rotate [size_mb] [max_files] [retention_days] [dry|live]|compress [dir] [description]|archive [dir] [description]|stats|dry-run|help}"
            echo "  rotate                    - Rotate all log files with default settings"
            echo "  compress [dir] [desc]     - Compress old rotated logs in directory"
            echo "  archive [dir] [desc]      - Archive logs older than retention period"
            echo "  stats                     - Show log file statistics"
            echo "  dry-run                   - Show what would be rotated without doing it"
            echo "  help                      - Show this help"
            echo
            echo "Configuration (from monitoring-config.json):"
            echo "  Max log size: ${MAX_LOG_SIZE_MB}MB"
            echo "  Max rotated files: $MAX_LOG_FILES"
            echo "  Retention days: $RETENTION_DAYS"
            echo
            echo "Examples:"
            echo "  $0 rotate 100 10 30 live    # Rotate with custom settings"
            echo "  $0 compress /path/to/logs    # Compress logs in directory"
            echo "  $0 dry-run                   # Show what would be rotated"
            exit 1
            ;;
    esac
fi
