#!/bin/bash
# ABOUTME: Simplified health monitoring daemon for MAF tmux orchestration system.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log_health() {
    echo -e "${BLUE}[HEALTH]${NC} $1"
}

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DATA_DIR="$PROJECT_ROOT/.maf/monitoring"
HEALTH_STATUS_FILE="$MONITORING_DATA_DIR/health-status.json"
PID_FILE="$MONITORING_DATA_DIR/health-monitor.pid"

# Initialize
initialize_monitoring() {
    mkdir -p "$MONITORING_DATA_DIR"
    log_health "Health monitoring initialized"
}

# Run health check
run_health_check() {
    log_health "Running health check"
    
    # Check system resources
    if command -v free &>/dev/null; then
        local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2 }')
        log_health "Memory usage: ${mem_usage}%"
    fi
    
    # Check MAF sessions
    local session_count=$(tmux list-sessions 2>/dev/null | grep "^maf-agent-" | wc -l || echo "0")
    session_count=$(echo "$session_count" | tr -d "[:space:]")
    log_health "MAF sessions: $session_count"
    
    log_health "Health check completed"
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    initialize_monitoring
    
    case "${1:-check}" in
        "check")
            run_health_check
            ;;
        "help"|*)
            echo "Usage: $0 {check|help}"
            echo "  check  - Run health check"
            ;;
    esac
fi
