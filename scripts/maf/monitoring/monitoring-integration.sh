#!/bin/bash
# ABOUTME: Integration script for MAF monitoring and logging system.
# ABOUTME: Provides unified interface to all monitoring and logging components.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_integration_info() {
    echo -e "${CYAN}[INTEGRATION]${NC} $1"
}

log_integration_success() {
    echo -e "${GREEN}[INTEGRATION]${NC} $1"
}

log_integration_warning() {
    echo -e "${YELLOW}[INTEGRATION]${NC} $1"
}

log_integration_error() {
    echo -e "${RED}[INTEGRATION]${NC} $1"
}

# Show help information
show_help() {
    cat << 'HELP_EOF'
MAF Monitoring & Logging System
================================

This script provides a unified interface to the MAF monitoring and logging components.

AVAILABLE COMPONENTS:

Health Monitoring:
  health-monitor         - Main health monitoring daemon
  agent-health          - Individual agent health checks
  session-health        - Session integrity monitoring  
  system-health         - System resource monitoring

Log Management:
  log-collector         - Centralized log collection
  log-rotate           - Log rotation and cleanup

USAGE:

./monitoring-integration.sh <component> <action> [options]

COMPONENTS & ACTIONS:

1. Health Monitoring:
   ./monitoring-integration.sh health <action>
     start     - Start health monitoring daemon
     stop      - Stop health monitoring daemon
     status    - Show health status
     check     - Run one-time health check
   
2. Agent Health:
   ./monitoring-integration.sh agent <action> [agent_id]
     check     - Check all agents health
     detailed  - Detailed health check for specific agent
     monitor   - Monitor agent performance
   
3. Session Health:
   ./monitoring-integration.sh session <action> [options]
     analyze   - Analyze all sessions
     windows   - Check session windows
     resources - Monitor session resources
     cleanup   - Cleanup problematic sessions
   
4. System Health:
   ./monitoring-integration.sh system <action>
     resources - Check system resources
     deps      - Check system dependencies
     full      - Full system health check
   
5. Log Collection:
   ./monitoring-integration.sh logs <action>
     collect   - Collect logs from all sources
     status    - Show collection status
     search    - Search logs for term
   
6. Log Rotation:
   ./monitoring-integration.sh rotate <action> [options]
     rotate    - Rotate log files
     stats     - Show log statistics
     dry-run   - Show what would be rotated

EXAMPLES:

# Start health monitoring daemon
./monitoring-integration.sh health start

# Check all agents health
./monitoring-integration.sh agent check

# Analyze all sessions
./monitoring-integration.sh session analyze

# Check system resources
./monitoring-integration.sh system resources

# Collect all logs
./monitoring-integration.sh logs collect

# Show monitoring system status
./monitoring-integration.sh status

HELP_EOF
}

# Check if monitoring scripts exist
check_monitoring_scripts() {
    local required_scripts=(
        "health-monitor.sh"
        "agent-health.sh"
        "session-health.sh"
        "system-health.sh"
        "log-collector.sh"
        "log-rotate.sh"
    )
    
    local missing_scripts=()
    
    for script in "${required_scripts[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/$script" ]]; then
            missing_scripts+=("$script")
        fi
    done
    
    if [[ ${#missing_scripts[@]} -gt 0 ]]; then
        log_integration_error "Missing monitoring scripts: ${missing_scripts[*]}"
        return 1
    fi
    
    return 0
}

# Health monitoring interface
interface_health() {
    local action="$1"
    
    case "$action" in
        "start")
            log_integration_info "Starting health monitoring daemon..."
            "$SCRIPT_DIR/health-monitor.sh" start
            ;;
        "stop")
            log_integration_info "Stopping health monitoring daemon..."
            "$SCRIPT_DIR/health-monitor.sh" stop
            ;;
        "status")
            "$SCRIPT_DIR/health-monitor.sh" status
            ;;
        "check")
            log_integration_info "Running health check..."
            "$SCRIPT_DIR/health-monitor.sh" check
            ;;
        *)
            log_integration_error "Unknown health action: $action"
            echo "Available actions: start, stop, status, check"
            return 1
            ;;
    esac
}

# Agent health interface
interface_agent() {
    local action="$1"
    local agent_id="$2"
    
    case "$action" in
        "check")
            log_integration_info "Checking all agents health..."
            "$SCRIPT_DIR/agent-health.sh" all
            ;;
        "detailed")
            if [[ -z "$agent_id" ]]; then
                log_integration_error "Agent ID required for detailed check"
                return 1
            fi
            log_integration_info "Detailed health check for agent: $agent_id"
            "$SCRIPT_DIR/agent-health.sh" check "$agent_id" detailed
            ;;
        "monitor")
            if [[ -z "$agent_id" ]]; then
                log_integration_error "Agent ID required for monitoring"
                return 1
            fi
            log_integration_info "Monitoring agent: $agent_id"
            "$SCRIPT_DIR/agent-health.sh" monitor "$agent_id" 5
            ;;
        *)
            log_integration_error "Unknown agent action: $action"
            echo "Available actions: check, detailed <agent_id>, monitor <agent_id>"
            return 1
            ;;
    esac
}

# Session health interface
interface_session() {
    local action="$1"
    local option="$2"
    
    case "$action" in
        "analyze")
            log_integration_info "Analyzing all sessions..."
            "$SCRIPT_DIR/session-health.sh" analyze
            ;;
        "windows")
            if [[ -n "$option" ]]; then
                log_integration_info "Checking windows for agent: $option"
                "$SCRIPT_DIR/session-health.sh" windows "$option"
            else
                log_integration_info "Checking all session windows..."
                "$SCRIPT_DIR/session-health.sh" windows
            fi
            ;;
        "resources")
            if [[ -n "$option" ]]; then
                log_integration_info "Monitoring resources for agent: $option"
                "$SCRIPT_DIR/session-health.sh" resources "$option" 1
            else
                log_integration_info "Monitoring resources for all sessions..."
                "$SCRIPT_DIR/session-health.sh" resources
            fi
            ;;
        "cleanup")
            log_integration_info "Cleaning up problematic sessions (dry run)..."
            "$SCRIPT_DIR/session-health.sh" cleanup dry
            ;;
        *)
            log_integration_error "Unknown session action: $action"
            echo "Available actions: analyze, windows [agent_id], resources [agent_id], cleanup"
            return 1
            ;;
    esac
}

# System health interface
interface_system() {
    local action="$1"
    
    case "$action" in
        "resources")
            log_integration_info "Checking system resources..."
            "$SCRIPT_DIR/system-health.sh" resources
            ;;
        "deps")
            log_integration_info "Checking system dependencies..."
            "$SCRIPT_DIR/system-health.sh" deps
            ;;
        "full")
            log_integration_info "Running full system health check..."
            "$SCRIPT_DIR/system-health.sh" full
            ;;
        *)
            log_integration_error "Unknown system action: $action"
            echo "Available actions: resources, deps, full"
            return 1
            ;;
    esac
}

# Log collection interface
interface_logs() {
    local action="$1"
    local search_term="$2"
    
    case "$action" in
        "collect")
            log_integration_info "Collecting logs from all sources..."
            "$SCRIPT_DIR/log-collector.sh" collect
            ;;
        "status")
            log_integration_info "Showing log collection status..."
            "$SCRIPT_DIR/log-collector.sh" status
            ;;
        "search")
            if [[ -z "$search_term" ]]; then
                log_integration_error "Search term required"
                return 1
            fi
            log_integration_info "Searching logs for: $search_term"
            "$SCRIPT_DIR/log-collector.sh" search "$search_term"
            ;;
        *)
            log_integration_error "Unknown logs action: $action"
            echo "Available actions: collect, status, search <term>"
            return 1
            ;;
    esac
}

# Log rotation interface
interface_rotate() {
    local action="$1"
    
    case "$action" in
        "rotate")
            log_integration_info "Rotating log files..."
            "$SCRIPT_DIR/log-rotate.sh" rotate
            ;;
        "stats")
            log_integration_info "Showing log statistics..."
            "$SCRIPT_DIR/log-rotate.sh" stats
            ;;
        "dry-run")
            log_integration_info "Dry run - showing what would be rotated..."
            "$SCRIPT_DIR/log-rotate.sh" dry-run
            ;;
        *)
            log_integration_error "Unknown rotate action: $action"
            echo "Available actions: rotate, stats, dry-run"
            return 1
            ;;
    esac
}

# Show overall monitoring system status
show_overall_status() {
    log_integration_info "MAF Monitoring System Status"
    echo "==================================="
    
    # Check health monitor daemon
    echo "Health Monitor:"
    if "$SCRIPT_DIR/health-monitor.sh" status &>/dev/null; then
        echo "  Status: ✅ Running"
    else
        echo "  Status: ❌ Not running"
    fi
    
    echo
    
    # Show log collection status
    echo "Log Collection:"
    "$SCRIPT_DIR/log-collector.sh" status 2>/dev/null || echo "  Status: ❌ Not available"
    
    echo
    
    # Show recent system health
    echo "Recent System Health:"
    "$SCRIPT_DIR/system-health.sh" resources 2>/dev/null || echo "  Status: ❌ Not available"
    
    echo
    
    # Show active sessions
    echo "Active MAF Sessions:"
    local session_count=$(tmux list-sessions 2>/dev/null | grep "^maf-agent-" | wc -l || echo "0")
    session_count=$(echo "$session_count" | tr -d "[:space:]")
    echo "  Count: $session_count"
    
    if [[ $session_count -gt 0 ]]; then
        echo "  Sessions:"
        tmux list-sessions 2>/dev/null | grep "^maf-agent-" | head -5 | while IFS=':' read -r session_name rest; do
            echo "    - $session_name"
        done
        
        if [[ $session_count -gt 5 ]]; then
            echo "    ... and $((session_count - 5)) more"
        fi
    fi
    
    echo
    log_integration_success "Status check completed"
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Check if all required scripts exist
    if ! check_monitoring_scripts; then
        exit 1
    fi
    
    case "${1:-help}" in
        "health")
            interface_health "${2:-status}"
            ;;
        "agent")
            interface_agent "${2:-check}" "${3:-}"
            ;;
        "session")
            interface_session "${2:-analyze}" "${3:-}"
            ;;
        "system")
            interface_system "${2:-full}"
            ;;
        "logs")
            interface_logs "${2:-collect}" "${3:-}"
            ;;
        "rotate")
            interface_rotate "${2:-rotate}"
            ;;
        "status")
            show_overall_status
            ;;
        "help"|*)
            show_help
            ;;
    esac
fi
