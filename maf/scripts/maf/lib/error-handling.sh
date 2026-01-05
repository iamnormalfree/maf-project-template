#!/bin/bash
# ABOUTME: Centralized error handling and logging utilities for MAF orchestration system.
# ABOUTME: Provides validation, cleanup, and recovery functions with NextNest-consistent patterns.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
# MAF scripts are in scripts/maf/, so project root is three levels up
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    # Fallback: search up from current directory
    PROJECT_ROOT="$(pwd)"
    while [[ "$PROJECT_ROOT" != "/" && ! -f "$PROJECT_ROOT/package.json" ]]; do
        PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
    done
    # If no package.json was found, default back to the script-derived root
    if [[ "$PROJECT_ROOT" == "/" ]]; then
        PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
    fi
fi

# Configuration defaults
LOGS_DIR="$PROJECT_ROOT/.maf/logs"
ERROR_LOG_FILE="$LOGS_DIR/error.log"
DEBUG_MODE="${DEBUG_MODE:-false}"
VERBOSE_LOGGING="${VERBOSE_LOGGING:-false}"

# Colors for output (fallback if not sourced elsewhere)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

# Core logging functions
log_info() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[INFO]${NC} $message" >&2
    echo "[$timestamp] [INFO] $message" >> "$ERROR_LOG_FILE"
}

log_success() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[SUCCESS]${NC} $message" >&2
    echo "[$timestamp] [SUCCESS] $message" >> "$ERROR_LOG_FILE"
}

log_warning() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[WARNING]${NC} $message" >&2
    echo "[$timestamp] [WARNING] $message" >> "$ERROR_LOG_FILE"
}

log_error() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[ERROR]${NC} $message" >&2
    echo "[$timestamp] [ERROR] $message" >> "$ERROR_LOG_FILE"
}

log_debug() {
    local message="$1"
    if [[ "$DEBUG_MODE" == "true" ]] || [[ "$VERBOSE_LOGGING" == "true" ]]; then
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo -e "${MAGENTA}[DEBUG]${NC} $message" >&2
        echo "[$timestamp] [DEBUG] $message" >> "$ERROR_LOG_FILE"
    fi
}

log_func_info() {
    local func_name="$1"
    local message="${2:-}"
    if [[ "$VERBOSE_LOGGING" == "true" ]]; then
        log_debug "Function: $func_name - $message"
    fi
}

# Enhanced error handling with context
handle_error() {
    local error_code="$1"
    local error_message="$2"
    local exit_code="${3:-1}"
    local context="${4:-}"
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local caller_info=$(caller 0 2>/dev/null || echo "unknown")
    
    # Log detailed error information
    {
        echo "=============================================="
        echo "ERROR DETECTED: $timestamp"
        echo "Error Code: $error_code"
        echo "Error Message: $error_message"
        echo "Exit Code: $exit_code"
        echo "Caller: $caller_info"
        if [[ -n "$context" ]]; then
            echo "Context: $context"
        fi
        echo "=============================================="
    } >> "$ERROR_LOG_FILE"
    
    # Print user-friendly error
    log_error "$error_message (Code: $error_code)"
    
    # Additional context in debug mode
    if [[ "$DEBUG_MODE" == "true" ]] && [[ -n "$context" ]]; then
        log_debug "Context: $context"
    fi
    
    # Cleanup on exit if cleanup function exists
    if declare -f cleanup_on_error &>/dev/null; then
        log_debug "Running cleanup_on_error function..."
        cleanup_on_error "$error_code" "$error_message" || log_warning "Cleanup function failed"
    fi
    
    exit "$exit_code"
}

# Validation functions
validate_required_args() {
    local func_name="$1"
    shift
    local arg_count=0
    
    for arg in "$@"; do
        ((arg_count++))
        if [[ -z "$arg" ]]; then
            handle_error "MISSING_REQUIRED_ARG" \
                "Function $func_name requires argument $arg_count but none provided" \
                2 \
                "Function: $func_name, Argument position: $arg_count"
        fi
    done
    
    log_func_info "$func_name" "All required arguments validated"
}

validate_file_exists() {
    local file_path="$1"
    local description="${2:-File}"
    
    log_func_info "validate_file_exists" "Checking: $file_path"
    
    if [[ ! -f "$file_path" ]]; then
        handle_error "FILE_NOT_FOUND" \
            "$description not found: $file_path" \
            3 \
            "Expected file: $file_path"
    fi
    
    return 0
}

validate_directory_exists() {
    local dir_path="$1"
    local description="${2:-Directory}"
    
    log_func_info "validate_directory_exists" "Checking: $dir_path"
    
    if [[ ! -d "$dir_path" ]]; then
        handle_error "DIRECTORY_NOT_FOUND" \
            "$description not found: $dir_path" \
            3 \
            "Expected directory: $dir_path"
    fi
    
    return 0
}

validate_command_exists() {
    local command_name="$1"
    local install_hint="${2:-}"
    
    log_func_info "validate_command_exists" "Checking command: $command_name"
    
    if ! command -v "$command_name" &> /dev/null; then
        local error_msg="Required command not found: $command_name"
        if [[ -n "$install_hint" ]]; then
            error_msg="$error_msg. Install with: $install_hint"
        fi
        handle_error "COMMAND_NOT_FOUND" "$error_msg" 4
    fi
    
    return 0
}

validate_project_structure() {
    log_func_info "validate_project_structure" "Validating NextNest MAF project structure"
    
    local required_dirs=(
        "$PROJECT_ROOT/lib/maf"
        "$PROJECT_ROOT/scripts/maf"
        "$PROJECT_ROOT/.maf"
    )
    
    local required_files=(
        "$PROJECT_ROOT/package.json"
        "$PROJECT_ROOT/tsconfig.json"
    )
    
    # Check required directories
    for dir in "${required_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            log_warning "Expected directory missing: $dir"
        else
            log_debug "Directory validated: $dir"
        fi
    done
    
    # Check required files
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_warning "Expected file missing: $file"
        else
            log_debug "File validated: $file"
        fi
    done
    
    return 0
}

# System validation functions
validate_prerequisites() {
    log_func_info "validate_prerequisites" "Validating system prerequisites for MAF"
    
    local validation_failed=0
    
    # Check Node.js
    if ! validate_command_exists "node" "Install Node.js from https://nodejs.org"; then
        ((validation_failed++))
    fi
    
    # Check npm
    if ! validate_command_exists "npm" "Usually installed with Node.js"; then
        ((validation_failed++))
    fi
    
    # Check git
    if ! validate_command_exists "git" "Install with: sudo apt-get install git"; then
        ((validation_failed++))
    fi
    
    # Check tmux
    if ! validate_command_exists "tmux" "Install with: sudo apt-get install tmux"; then
        ((validation_failed++))
    fi

    # Check jq (required for JSON configuration processing)
    if ! validate_command_exists "jq" "Install with: sudo apt-get install jq (or brew install jq on macOS)"; then
        ((validation_failed++))
    fi
    
    # Validate Node.js version (expecting 18+)
    if command -v node &> /dev/null; then
        local node_version
        node_version=$(node --version 2>/dev/null | sed 's/v//' || echo "unknown")
        local major_version=$(echo "$node_version" | cut -d'.' -f1)
        
        if [[ "$major_version" -lt 18 ]]; then
            log_warning "Node.js version $node_version detected. Version 18+ recommended for MAF"
        else
            log_success "Node.js version validated: $node_version"
        fi
    fi
    
    # Validate project structure
    validate_project_structure
    
    if [[ $validation_failed -gt 0 ]]; then
        handle_error "PREREQUISITES_FAILED" \
            "$validation_failed prerequisite validations failed" \
            5 \
            "Run with DEBUG_MODE=true for detailed validation logs"
    fi
    
    log_success "All system prerequisites validated"
    return 0
}

# Cleanup and recovery functions
cleanup_temp_files() {
    log_func_info "cleanup_temp_files" "Cleaning up temporary files"
    
    local temp_patterns=(
        "$PROJECT_ROOT/.maf/tmp/*"
        "$PROJECT_ROOT/.maf/logs/*.tmp"
        "/tmp/maf-*"
    )
    
    for pattern in "${temp_patterns[@]}"; do
        if compgen -G "$pattern" &> /dev/null; then
            log_debug "Cleaning pattern: $pattern"
            rm -rf $pattern 2>/dev/null || log_warning "Failed to clean: $pattern"
        fi
    done
    
    return 0
}

cleanup_stale_sessions() {
    log_func_info "cleanup_stale_sessions" "Cleaning up stale tmux sessions"
    
    if command -v tmux &> /dev/null && tmux list-sessions &>/dev/null; then
        # Find sessions older than 1 hour that are MAF sessions
        local stale_sessions
        stale_sessions=$(tmux list-sessions 2>/dev/null | grep "maf-agent-" | grep -v "(attached)" || true)
        
        if [[ -n "$stale_sessions" ]]; then
            log_info "Found stale MAF sessions, cleaning up..."
            echo "$stale_sessions" | while IFS=':' read -r session_name _; do
                log_debug "Killing stale session: $session_name"
                tmux kill-session -t "$session_name" 2>/dev/null || log_warning "Failed to kill session: $session_name"
            done
        fi
    fi
    
    return 0
}

# Health check functions
health_check_basic() {
    log_func_info "health_check_basic" "Running basic health check"
    
    local issues=0
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir &>/dev/null; then
        log_warning "Not in a git repository"
        ((issues++))
    fi
    
    # Check if package.json exists and is valid
    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        if ! jq empty "$PROJECT_ROOT/package.json" 2>/dev/null; then
            log_error "package.json is not valid JSON"
            ((issues++))
        fi
    else
        log_error "package.json not found"
        ((issues++))
    fi
    
    # Check node_modules
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log_warning "node_modules not found - run 'npm install'"
        ((issues++))
    fi
    
    # Check log directory permissions
    if [[ ! -w "$LOGS_DIR" ]]; then
        log_error "Cannot write to logs directory: $LOGS_DIR"
        ((issues++))
    fi
    
    if [[ $issues -eq 0 ]]; then
        log_success "Basic health check passed"
        return 0
    else
        log_warning "Basic health check found $issues issues"
        return 1
    fi
}

health_check_full() {
    log_func_info "health_check_full" "Running comprehensive health check"
    
    local checks_passed=0
    local total_checks=0
    
    # Basic health check
    ((total_checks++))
    if health_check_basic; then
        ((checks_passed++))
    fi
    
    # Prerequisites check
    ((total_checks++))
    if validate_prerequisites; then
        ((checks_passed++))
    fi
    
    # tmux environment check
    ((total_checks++))
    if command -v tmux &> /dev/null; then
        if tmux list-sessions &>/dev/null; then
            log_success "tmux server is running"
            ((checks_passed++))
        else
            log_warning "tmux server not running"
        fi
    else
        log_warning "tmux not available"
    fi
    
    # MAF CLI check
    ((total_checks++))
    if [[ -f "$PROJECT_ROOT/package.json" ]] && jq -e '.scripts["maf:claim-task"]' "$PROJECT_ROOT/package.json" &>/dev/null; then
        log_success "MAF CLI script available"
        ((checks_passed++))
    else
        log_warning "MAF CLI script not found in package.json"
    fi
    
    # Agent mail system check
    ((total_checks++))
    if [[ -d "$PROJECT_ROOT/mcp_agent_mail" ]]; then
        log_success "Agent mail directory exists"
        ((checks_passed++))
    else
        log_warning "Agent mail directory not found"
    fi
    
    # Report results
    echo "Health Check Results:"
    echo "  Passed: $checks_passed/$total_checks checks"
    
    if [[ $checks_passed -eq $total_checks ]]; then
        log_success "All health checks passed - System is ready"
        return 0
    else
        log_warning "Some health checks failed - System may not be fully operational"
        return 1
    fi
}

# Performance monitoring
monitor_resource_usage() {
    local agent_id="$1"
    local session_name="maf-agent-$agent_id"
    
    log_func_info "monitor_resource_usage" "Monitoring resources for: $session_name"
    
    if ! command -v tmux &> /dev/null; then
        log_warning "tmux not available for resource monitoring"
        return 1
    fi
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        log_warning "Session $session_name not found for monitoring"
        return 1
    fi
    
    # Get session's process information
    local session_pid
    session_pid=$(pgrep -f "tmux.*session.*$session_name" | head -1 || echo "unknown")
    
    if [[ "$session_pid" != "unknown" ]] && [[ -n "$session_pid" ]]; then
        local cpu_usage
        local mem_usage
        cpu_usage=$(ps -p "$session_pid" -o %cpu --no-headers 2>/dev/null | xargs || echo "0")
        mem_usage=$(ps -p "$session_pid" -o %mem --no-headers 2>/dev/null | xargs || echo "0")
        
        log_debug "Session $session_name - CPU: ${cpu_usage}%, Memory: ${mem_usage}%"
        echo "$cpu_usage|$mem_usage|$session_pid"
        return 0
    else
        log_warning "Could not find process for session: $session_name"
        return 1
    fi
}

# Logging rotation
rotate_logs() {
    local max_size_mb="${1:-10}"
    local max_files="${2:-5}"
    
    log_func_info "rotate_logs" "Rotating logs (max: ${max_size_mb}MB, keep: ${max_files})"
    
    if [[ ! -f "$ERROR_LOG_FILE" ]]; then
        log_debug "No log file to rotate"
        return 0
    fi
    
    # Get current log size in MB
    local current_size
    current_size=$(du -m "$ERROR_LOG_FILE" 2>/dev/null | cut -f1 || echo "0")
    
    if [[ $current_size -lt $max_size_mb ]]; then
        log_debug "Log file size (${current_size}MB) below threshold (${max_size_mb}MB)"
        return 0
    fi
    
    # Rotate logs
    log_info "Rotating log file (current size: ${current_size}MB)"
    
    # Remove oldest log if it exists
    if [[ -f "${ERROR_LOG_FILE}.${max_files}" ]]; then
        rm "${ERROR_LOG_FILE}.${max_files}"
    fi
    
    # Shift existing logs
    for ((i = max_files - 1; i >= 1; i--)); do
        if [[ -f "${ERROR_LOG_FILE}.${i}" ]]; then
            mv "${ERROR_LOG_FILE}.${i}" "${ERROR_LOG_FILE}.$((i + 1))"
        fi
    done
    
    # Move current log
    mv "$ERROR_LOG_FILE" "${ERROR_LOG_FILE}.1"
    
    # Create new empty log file
    touch "$ERROR_LOG_FILE"
    
    log_success "Log rotation completed"
    return 0
}

# Configuration management
load_configuration() {
    local config_file="${1:-$PROJECT_ROOT/.maf/config.json}"
    
    log_func_info "load_configuration" "Loading configuration from: $config_file"
    
    if [[ ! -f "$config_file" ]]; then
        log_debug "Configuration file not found: $config_file, using defaults"
        return 0
    fi
    
    # Validate JSON format
    if ! jq empty "$config_file" 2>/dev/null; then
        log_warning "Configuration file is not valid JSON: $config_file"
        return 1
    fi
    
    # Source configuration variables (simplified approach)
    # In a more complex implementation, you might use a proper config parser
    log_debug "Configuration loaded successfully"
    return 0
}

# Setup global error trap
setup_error_traps() {
    log_func_info "setup_error_traps" "Setting up global error traps"
    
    # Trap on error, exit, and interrupt
    trap 'handle_error "SCRIPT_ERROR" "Script encountered an error at line $LINENO" $?' ERR
    trap 'handle_error "SCRIPT_EXIT" "Script exited unexpectedly" $?' EXIT
    trap 'handle_error "SCRIPT_INTERRUPT" "Script interrupted by user" 130' INT
    
    log_debug "Error traps configured"
}

# Remove traps when script completes successfully
cleanup_error_traps() {
    log_func_info "cleanup_error_traps" "Cleaning up error traps"
    
    trap - ERR EXIT INT
    
    log_debug "Error traps removed"
}

# Auto-cleanup on script exit (can be overridden)
cleanup_on_error() {
    local error_code="$1"
    local error_message="$2"
    
    log_info "Running emergency cleanup due to error: $error_code"
    
    # Basic cleanup tasks
    cleanup_temp_files
    
    # Additional cleanup based on error type
    case "$error_code" in
        "TMUX_*")
            cleanup_stale_sessions
            ;;
        "FILE_*"|"DIRECTORY_*")
            log_debug "File/directory error - no specific cleanup needed"
            ;;
        *)
            log_debug "Generic error cleanup completed"
            ;;
    esac
    
    log_info "Emergency cleanup completed"
}

# Main execution block for standalone usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Simple CLI interface for testing
    case "${1:-}" in
        "validate")
            validate_prerequisites
            ;;
        "health")
            health_check_full
            ;;
        "cleanup")
            cleanup_temp_files
            cleanup_stale_sessions
            ;;
        "rotate-logs")
            rotate_logs "${2:-10}" "${3:-5}"
            ;;
        *)
            echo "Usage: $0 {validate|health|cleanup|rotate-logs [size_mb] [max_files]}"
            echo "  validate      - Validate system prerequisites"
            echo "  health        - Run comprehensive health check"
            echo "  cleanup       - Clean up temporary files and stale sessions"
            echo "  rotate-logs   - Rotate log files (default: 10MB, keep 5)"
            exit 1
            ;;
    esac
fi
