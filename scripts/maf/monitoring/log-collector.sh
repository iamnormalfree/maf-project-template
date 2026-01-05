#!/bin/bash
# ABOUTME: Log collection and centralization system for MAF tmux orchestration.
# ABOUTME: Collects, processes, and centralizes logs from all agents and sessions.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="$SCRIPT_DIR"

# Configuration
CONFIG_FILE="$MONITORING_DIR/monitoring-config.json"
COLLECTION_INTERVAL_SECONDS=60
MAX_LOG_FILE_SIZE_MB=50
COMPRESSION_ENABLED=true
CENTRALIZED_LOGS_DIR="$PROJECT_ROOT/.maf/centralized-logs"
AGENT_LOGS_DIR="$PROJECT_ROOT/.maf/logs/agents"
SESSION_LOGS_DIR="$PROJECT_ROOT/.maf/logs/sessions"
SYSTEM_LOGS_DIR="$PROJECT_ROOT/.maf/logs/system"
ARCHIVE_LOGS_DIR="$PROJECT_ROOT/.maf/logs/archived"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_collector_info() {
    echo -e "${BLUE}[COLLECTOR]${NC} $1"
}

log_collector_success() {
    echo -e "${GREEN}[COLLECTOR]${NC} $1"
}

log_collector_warning() {
    echo -e "${YELLOW}[COLLECTOR]${NC} $1"
}

log_collector_error() {
    echo -e "${RED}[COLLECTOR]${NC} $1"
}

# Load configuration
load_collector_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        COLLECTION_INTERVAL_SECONDS=$(jq -r '.monitoring.log_collection_interval_seconds // 60' "$CONFIG_FILE")
        MAX_LOG_FILE_SIZE_MB=$(jq -r '.monitoring.max_log_file_size_mb // 50' "$CONFIG_FILE")
        COMPRESSION_ENABLED=$(jq -r '.logging.compression_enabled // true' "$CONFIG_FILE")
        
        local centralized_enabled=$(jq -r '.logging.centralized_logs // true' "$CONFIG_FILE")
        if [[ "$centralized_enabled" != "true" ]]; then
            log_collector_warning "Centralized logging is disabled in configuration"
            return 1
        fi
    fi
    return 0
}

# Initialize log collection system
initialize_log_collector() {
    log_collector_info "Initializing MAF log collection system"
    
    # Load configuration
    load_collector_config
    
    # Create log directories
    mkdir -p "$CENTRALIZED_LOGS_DIR" "$AGENT_LOGS_DIR" "$SESSION_LOGS_DIR" "$SYSTEM_LOGS_DIR" "$ARCHIVE_LOGS_DIR"
    
    log_collector_success "Log collection system initialized"
    return 0
}

# Collect agent logs
collect_agent_logs() {
    log_collector_info "Collecting agent logs"
    
    local agent_logs_collected=0
    local agent_bytes_collected=0
    
    if [[ ! -d "$AGENT_LOGS_DIR" ]]; then
        log_collector_warning "Agent logs directory not found: $AGENT_LOGS_DIR"
        return 0
    fi
    
    # Process each agent's log directory
    for agent_dir in "$AGENT_LOGS_DIR"/*; do
        if [[ -d "$agent_dir" ]]; then
            local agent_id=$(basename "$agent_dir")
            local agent_central_dir="$CENTRALIZED_LOGS_DIR/agents/$agent_id"
            mkdir -p "$agent_central_dir"
            
            # Process all log files for this agent
            for log_file in "$agent_dir"/*.log; do
                if [[ -f "$log_file" ]]; then
                    local filename=$(basename "$log_file")
                    local central_file="$agent_central_dir/$filename"
                    
                    # Get file info
                    local file_size=$(stat -c%s "$log_file" 2>/dev/null || echo "0")
                    local file_mtime=$(stat -c%Y "$log_file" 2>/dev/null || echo "0")
                    
                    # Check if we need to update the central copy
                    local needs_update=false
                    
                    if [[ ! -f "$central_file" ]]; then
                        needs_update=true
                    else
                        local central_mtime=$(stat -c%Y "$central_file" 2>/dev/null || echo "0")
                        if [[ $file_mtime -gt $central_mtime ]]; then
                            needs_update=true
                        fi
                    fi
                    
                    if [[ "$needs_update" == "true" ]]; then
                        # Copy the log file
                        cp "$log_file" "$central_file"
                        ((agent_logs_collected++))
                        ((agent_bytes_collected += file_size))
                        
                        log_collector_info "Collected: $filename (agent: $agent_id, size: $file_size bytes)"
                    fi
                fi
            done
        fi
    done
    
    log_collector_success "Agent logs collected: $agent_logs_collected files, $agent_bytes_collected bytes"
    return $agent_logs_collected
}

# Collect system logs
collect_system_logs() {
    log_collector_info "Collecting system logs"
    
    local system_logs_collected=0
    local system_bytes_collected=0
    
    # Collect MAF system logs
    local maf_log_sources=(
        "$PROJECT_ROOT/.maf/logs/error.log"
        "$PROJECT_ROOT/.maf/monitoring/monitoring.log"
        "$PROJECT_ROOT/.maf/monitoring/health-status.json"
        "$PROJECT_ROOT/.maf/monitoring/metrics.json"
        "$PROJECT_ROOT/.maf/monitoring/alerts.json"
    )
    
    for log_source in "${maf_log_sources[@]}"; do
        if [[ -f "$log_source" ]]; then
            local filename=$(basename "$log_source")
            local central_file="$CENTRALIZED_LOGS_DIR/system/$filename"
            
            # Get file info
            local file_size=$(stat -c%s "$log_source" 2>/dev/null || echo "0")
            local file_mtime=$(stat -c%Y "$log_source" 2>/dev/null || echo "0")
            
            # Check if we need to update the central copy
            local needs_update=false
            
            if [[ ! -f "$central_file" ]]; then
                needs_update=true
            else
                local central_mtime=$(stat -c%Y "$central_file" 2>/dev/null || echo "0")
                if [[ $file_mtime -gt $central_mtime ]]; then
                    needs_update=true
                fi
            fi
            
            if [[ "$needs_update" == "true" ]]; then
                # Copy the log file
                cp "$log_source" "$central_file"
                ((system_logs_collected++))
                ((system_bytes_collected += file_size))
                
                log_collector_info "Collected system log: $filename ($file_size bytes)"
            fi
        fi
    done
    
    log_collector_success "System logs collected: $system_logs_collected files, $system_bytes_collected bytes"
    return $system_logs_collected
}

# Main log collection orchestration
collect_all_logs() {
    log_collector_info "Starting comprehensive log collection"
    
    local agent_logs=0
    local system_logs=0
    
    # Collect logs from all sources
    collect_agent_logs
    agent_logs=$?
    
    collect_system_logs
    system_logs=$?
    
    local total_files=$((agent_logs + system_logs))
    log_collector_success "Log collection completed: $total_files files processed"
    
    return 0
}

# Show collector status
show_collector_status() {
    echo "Log Collector Status"
    echo "===================="
    
    # Show storage usage
    echo "Storage usage by category:"
    for source_dir in "$CENTRALIZED_LOGS_DIR"/*; do
        if [[ -d "$source_dir" ]]; then
            local category=$(basename "$source_dir")
            local file_count=$(find "$source_dir" -type f | wc -l)
            local dir_size=$(du -sh "$source_dir" 2>/dev/null | cut -f1)
            echo "  $category: $file_count files, $dir_size"
        fi
    done
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Initialize log collector
    initialize_log_collector
    
    case "${1:-collect}" in
        "collect")
            collect_all_logs
            ;;
        "status")
            show_collector_status
            ;;
        "help"|*)
            echo "Usage: $0 {collect|status|help}"
            echo "  collect  - Collect logs from all sources once"
            echo "  status   - Show collector status and statistics"
            echo "  help     - Show this help"
            exit 1
            ;;
    esac
fi
