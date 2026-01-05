#!/bin/bash
# ABOUTME: Comprehensive system health monitoring for MAF tmux orchestration.
# ABOUTME: Monitors system resources, dependencies, and MAF-specific health indicators.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
CONFIG_FILE="$SCRIPT_DIR/monitoring-config.json"
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
DISK_THRESHOLD=90

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_system_info() {
    echo -e "${BLUE}[SYSTEM]${NC} $1"
}

log_system_success() {
    echo -e "${GREEN}[SYSTEM]${NC} $1"
}

log_system_warning() {
    echo -e "${YELLOW}[SYSTEM]${NC} $1"
}

log_system_error() {
    echo -e "${RED}[SYSTEM]${NC} $1"
}

# Load configuration
load_system_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        CPU_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.cpu_usage_percent // 80' "$CONFIG_FILE")
        MEMORY_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.memory_usage_percent // 85' "$CONFIG_FILE")
        DISK_THRESHOLD=$(jq -r '.monitoring.alert_thresholds.disk_space_percent // 90' "$CONFIG_FILE")
    fi
}

# Check system dependencies
check_dependencies() {
    log_system_info "Checking system dependencies"
    
    echo "System Dependencies"
    echo "==================="
    
    local missing_deps=()
    
    # Check Node.js
    if command -v node &>/dev/null; then
        echo "Node.js: $(node --version) ✅"
    else
        echo "Node.js: ❌ NOT FOUND"
        missing_deps+=("Node.js")
    fi
    
    # Check npm
    if command -v npm &>/dev/null; then
        echo "npm: $(npm --version) ✅"
    else
        echo "npm: ❌ NOT FOUND"
        missing_deps+=("npm")
    fi
    
    # Check git
    if command -v git &>/dev/null; then
        echo "git: $(git --version | cut -d' ' -f3) ✅"
    else
        echo "git: ❌ NOT FOUND"
        missing_deps+=("git")
    fi
    
    # Check tmux
    if command -v tmux &>/dev/null; then
        echo "tmux: $(tmux -V | cut -d' ' -f2) ✅"
    else
        echo "tmux: ❌ NOT FOUND"
        missing_deps+=("tmux")
    fi
    
    # Check jq (for JSON processing)
    if command -v jq &>/dev/null; then
        echo "jq: $(jq --version) ✅"
    else
        echo "jq: ❌ NOT FOUND (required for monitoring)"
        missing_deps+=("jq")
    fi
    
    echo
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_system_error "Missing dependencies: ${missing_deps[*]}"
        return 1
    else
        log_system_success "All required dependencies available"
        return 0
    fi
}

# System resource monitoring
check_system_resources() {
    log_system_info "Checking system resources"
    
    echo "System Resources"
    echo "================"
    
    # CPU usage
    local cpu_usage=0
    if command -v top &>/dev/null; then
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' | cut -d'.' -f1 2>/dev/null || echo "0")
    fi
    
    printf "CPU Usage: %3d%%" "$cpu_usage"
    if [[ $cpu_usage -gt $CPU_THRESHOLD ]]; then
        echo " ❌ (HIGH)"
    else
        echo " ✅"
    fi
    
    # Memory usage
    local mem_usage=0
    local mem_total=0
    local mem_used=0
    if command -v free &>/dev/null; then
        mem_total=$(free -m | awk 'NR==2{print $2}')
        mem_used=$(free -m | awk 'NR==2{print $3}')
        if [[ $mem_total -gt 0 ]]; then
            mem_usage=$(((mem_used * 100) / mem_total))
        fi
    fi
    
    printf "Memory Usage: %3d%% (%d/%d MB)" "$mem_usage" "$mem_used" "$mem_total"
    if [[ $mem_usage -gt $MEMORY_THRESHOLD ]]; then
        echo " ❌ (HIGH)"
    else
        echo " ✅"
    fi
    
    # Disk usage
    local disk_usage=0
    if command -v df &>/dev/null; then
        disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
    fi
    
    printf "Disk Usage: %3d%%" "$disk_usage"
    if [[ $disk_usage -gt $DISK_THRESHOLD ]]; then
        echo " ❌ (HIGH)"
    else
        echo " ✅"
    fi
    
    echo
    return 0
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Load configuration
    load_system_config
    
    case "${1:-full}" in
        "deps"|"dependencies")
            check_dependencies
            ;;
        "resources")
            check_system_resources
            ;;
        "full")
            echo "MAF System Health Report"
            echo "======================="
            echo "Generated at: $(date)"
            echo
            
            check_system_resources
            echo
            check_dependencies
            
            echo
            log_system_success "System health check completed"
            ;;
        "help"|*)
            echo "Usage: $0 {resources|deps|full|help}"
            echo "  resources    - Check system resource utilization"
            echo "  deps         - Check system dependencies"
            echo "  full         - Run comprehensive health check"
            echo "  help         - Show this help"
            exit 1
            ;;
    esac
fi
