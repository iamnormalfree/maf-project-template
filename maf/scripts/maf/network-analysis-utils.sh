#!/bin/bash
# ABOUTME: Network analysis utility collection for advanced security monitoring
# Provides common utilities for network analysis, performance measurement, and security assessment

set -euo pipefail

# Source MAF utilities and colors
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source colors if available
if [ -f "${SCRIPT_DIR}/lib/colors.sh" ]; then
    source "${SCRIPT_DIR}/lib/colors.sh"
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    BOLD='\033[1m'
    DIM='\033[2m'
    NC='\033[0m'
fi

# Configuration
DEFAULT_INTERFACE="${DEFAULT_INTERFACE:-any}"
CAPTURE_DURATION="${CAPTURE_DURATION:-30}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-human}"
VERBOSE="${VERBOSE:-false}"

# Performance measurement thresholds
CPU_WARNING_THRESHOLD=80
MEMORY_WARNING_THRESHOLD=80
NETWORK_LATENCY_WARNING_MS=200
PACKET_LOSS_WARNING_THRESHOLD=5

# Security thresholds
CONNECTION_COUNT_WARNING=1000
BANDWIDTH_USAGE_WARNING_MB=100
FAILED_CONNECTION_WARNING_THRESHOLD=10

# Output functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${DIM}[VERBOSE]${NC} $*"
    fi
}

# System performance monitoring
measure_system_performance() {
    local duration="${1:-10}"

    log_info "Measuring system performance for ${duration} seconds..."

    local cpu_usage_start=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local memory_usage_start=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local network_rx_start=0
    local network_tx_start=0

    if [ -f "/proc/net/dev" ]; then
        network_rx_start=$(cat /proc/net/dev | grep -E "(eth|wlan|enp)" | awk '{sum+=$2} END {print sum}')
        network_tx_start=$(cat /proc/net/dev | grep -E "(eth|wlan|enp)" | awk '{sum+=$10} END {print sum}')
    fi

    log_verbose "Initial metrics - CPU: ${cpu_usage_start}%, Memory: ${memory_usage_start}%"

    # Wait for measurement period
    sleep "$duration"

    local cpu_usage_end=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local memory_usage_end=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local network_rx_end=0
    local network_tx_end=0

    if [ -f "/proc/net/dev" ]; then
        network_rx_end=$(cat /proc/net/dev | grep -E "(eth|wlan|enp)" | awk '{sum+=$2} END {print sum}')
        network_tx_end=$(cat /proc/net/dev | grep -E "(eth|wlan|enp)" | awk '{sum+=$10} END {print sum}')
    fi

    log_verbose "Final metrics - CPU: ${cpu_usage_end}%, Memory: ${memory_usage_end}%"

    # Calculate averages and differences
    local cpu_usage_avg=$(echo "scale=1; ($cpu_usage_start + $cpu_usage_end) / 2" | bc -l 2>/dev/null || echo "$cpu_usage_end")
    local memory_usage_avg=$(echo "scale=1; ($memory_usage_start + $memory_usage_end) / 2" | bc -l 2>/dev/null || echo "$memory_usage_end")
    local network_rx_diff=$((network_rx_end - network_rx_start))
    local network_tx_diff=$((network_tx_end - network_tx_start))

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        cat << EOF
{
  "measurement_duration": $duration,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "cpu_usage_percent": $cpu_usage_avg,
  "memory_usage_percent": $memory_usage_avg,
  "network_bytes_rx": $network_rx_diff,
  "network_bytes_tx": $network_tx_diff,
  "warnings": {
    "cpu_high": $([ "$(echo "$cpu_usage_avg >= $CPU_WARNING_THRESHOLD" | bc -l 2>/dev/null || echo 0)" -eq 1 ] && echo true || echo false),
    "memory_high": $([ "$(echo "$memory_usage_avg >= $MEMORY_WARNING_THRESHOLD" | bc -l 2>/dev/null || echo 0)" -eq 1 ] && echo true || echo false)
  }
}
EOF
    else
        echo
        echo -e "${BOLD}${CYAN}System Performance Metrics${NC}"
        echo -e "${CYAN}==========================${NC}"
        echo
        echo -e "CPU Usage: ${cpu_usage_avg}%"
        echo -e "Memory Usage: ${memory_usage_avg}%"
        echo -e "Network RX: $((network_rx_diff / 1024)) KB"
        echo -e "Network TX: $((network_tx_diff / 1024)) KB"
        echo

        # Show warnings if thresholds exceeded
        local warning_shown=false

        if [ "$(echo "$cpu_usage_avg >= $CPU_WARNING_THRESHOLD" | bc -l 2>/dev/null || echo 0)" -eq 1 ]; then
            echo -e "${YELLOW}⚠️  High CPU usage detected${NC}"
            warning_shown=true
        fi

        if [ "$(echo "$memory_usage_avg >= $MEMORY_WARNING_THRESHOLD" | bc -l 2>/dev/null || echo 0)" -eq 1 ]; then
            echo -e "${YELLOW}⚠️  High memory usage detected${NC}"
            warning_shown=true
        fi

        if [ "$warning_shown" = false ]; then
            echo -e "${GREEN}✅ System performance within normal limits${NC}"
        fi
    fi
}

# Network latency measurement
measure_network_latency() {
    local target="${1:-8.8.8.8}"
    local count="${2:-5}"

    log_info "Measuring network latency to $target ($count packets)..."

    if ! command -v ping >/dev/null 2>&1; then
        log_error "ping command not available"
        return 1
    fi

    local ping_result
    ping_result=$(ping -c "$count" "$target" 2>/dev/null || echo "FAILED")

    if [ "$ping_result" = "FAILED" ]; then
        echo -e "${RED}❌ Failed to ping $target${NC}"
        return 1
    fi

    # Extract statistics
    local avg_latency=$(echo "$ping_result" | tail -1 | awk -F'/' '{print $5}')
    local packet_loss=$(echo "$ping_result" | grep "packet loss" | awk '{print $6}' | cut -d'%' -f1)

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        cat << EOF
{
  "target": "$target",
  "packet_count": $count,
  "average_latency_ms": ${avg_latency:-0},
  "packet_loss_percent": ${packet_loss:-0},
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "warnings": {
    "latency_high": $([ "${avg_latency:-0}" -ge $NETWORK_LATENCY_WARNING_MS ] && echo true || echo false),
    "packet_loss_high": $([ "${packet_loss:-0}" -ge $PACKET_LOSS_WARNING_THRESHOLD ] && echo true || echo false)
  }
}
EOF
    else
        echo
        echo -e "${BOLD}${CYAN}Network Latency to $target${NC}"
        echo -e "${CYAN}==========================${NC}"
        echo
        echo -e "Average Latency: ${avg_latency}ms"
        echo -e "Packet Loss: ${packet_loss}%"
        echo

        # Show warnings if thresholds exceeded
        local warning_shown=false

        if [ "${avg_latency:-0}" -ge "$NETWORK_LATENCY_WARNING_MS" ]; then
            echo -e "${YELLOW}⚠️  High latency detected${NC}"
            warning_shown=true
        fi

        if [ "${packet_loss:-0}" -ge "$PACKET_LOSS_WARNING_THRESHOLD" ]; then
            echo -e "${YELLOW}⚠️  High packet loss detected${NC}"
            warning_shown=true
        fi

        if [ "$warning_shown" = false ]; then
            echo -e "${GREEN}✅ Network latency within normal limits${NC}"
        fi
    fi
}

# Connection monitoring
monitor_network_connections() {
    local duration="${1:-30}"

    log_info "Monitoring network connections for ${duration} seconds..."

    # Get initial connection count
    local initial_connections=0
    if command -v ss >/dev/null 2>&1; then
        initial_connections=$(ss -tuln | wc -l)
    elif command -v netstat >/dev/null 2>&1; then
        initial_connections=$(netstat -tuln | wc -l)
    fi

    log_verbose "Initial connection count: $initial_connections"

    # Monitor connections over time
    local max_connections=$initial_connections
    local min_connections=$initial_connections
    local connection_samples=()

    for ((i=0; i<duration; i+=5)); do
        local current_connections=0
        if command -v ss >/dev/null 2>&1; then
            current_connections=$(ss -tuln | wc -l)
        elif command -v netstat >/dev/null 2>&1; then
            current_connections=$(netstat -tuln | wc -l)
        fi

        connection_samples+=("$current_connections")

        if [ "$current_connections" -gt "$max_connections" ]; then
            max_connections=$current_connections
        fi

        if [ "$current_connections" -lt "$min_connections" ]; then
            min_connections=$current_connections
        fi

        log_verbose "Sample $((i/5 + 1)): $current_connections connections"
        sleep 5
    done

    # Calculate average
    local total_connections=0
    for sample in "${connection_samples[@]}"; do
        total_connections=$((total_connections + sample))
    done
    local avg_connections=$((total_connections / ${#connection_samples[@]}))

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        cat << EOF
{
  "monitoring_duration": $duration,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "connection_statistics": {
    "initial": $initial_connections,
    "average": $avg_connections,
    "maximum": $max_connections,
    "minimum": $min_connections,
    "samples": ${#connection_samples[@]}
  },
  "warnings": {
    "high_connection_count": $([ $max_connections -gt $CONNECTION_COUNT_WARNING ] && echo true || echo false)
  }
}
EOF
    else
        echo
        echo -e "${BOLD}${CYAN}Network Connection Monitoring${NC}"
        echo -e "${CYAN}============================${NC}"
        echo
        echo -e "Initial Connections: $initial_connections"
        echo -e "Average Connections: $avg_connections"
        echo -e "Maximum Connections: $max_connections"
        echo -e "Minimum Connections: $min_connections"
        echo

        # Show warning if threshold exceeded
        if [ "$max_connections" -gt "$CONNECTION_COUNT_WARNING" ]; then
            echo -e "${YELLOW}⚠️  High connection count detected${NC}"
        else
            echo -e "${GREEN}✅ Connection count within normal limits${NC}"
        fi
    fi
}

# Bandwidth usage monitoring
monitor_bandwidth_usage() {
    local interface="${1:-}"
    local duration="${2:-30}"

    log_info "Monitoring bandwidth usage for ${duration} seconds..."

    if [ -z "$interface" ]; then
        # Auto-detect primary interface
        interface=$(ip route | grep default | awk '{print $5}' | head -1)
        if [ -z "$interface" ]; then
            interface="eth0"
        fi
    fi

    log_verbose "Monitoring interface: $interface"

    # Get initial statistics
    local rx_start=0
    local tx_start=0
    if [ -f "/proc/net/dev" ]; then
        rx_start=$(cat /proc/net/dev | grep "$interface" | awk '{print $2}')
        tx_start=$(cat /proc/net/dev | grep "$interface" | awk '{print $10}')
    fi

    if [ -z "$rx_start" ]; then
        log_error "Interface $interface not found"
        return 1
    fi

    log_verbose "Initial RX: $rx_start bytes, TX: $tx_start bytes"

    # Wait for measurement period
    sleep "$duration"

    # Get final statistics
    local rx_end=0
    local tx_end=0
    if [ -f "/proc/net/dev" ]; then
        rx_end=$(cat /proc/net/dev | grep "$interface" | awk '{print $2}')
        tx_end=$(cat /proc/net/dev | grep "$interface" | awk '{print $10}')
    fi

    # Calculate usage
    local rx_diff=$((rx_end - rx_start))
    local tx_diff=$((tx_end - tx_start))
    local total_diff=$((rx_diff + tx_diff))

    local rx_rate=$((rx_diff / duration))
    local tx_rate=$((tx_diff / duration))
    local total_rate=$((total_diff / duration))

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        cat << EOF
{
  "interface": "$interface",
  "monitoring_duration": $duration,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "bandwidth_usage": {
    "bytes_rx": $rx_diff,
    "bytes_tx": $tx_diff,
    "bytes_total": $total_diff,
    "rate_bps_rx": $rx_rate,
    "rate_bps_tx": $tx_rate,
    "rate_bps_total": $total_rate,
    "rate_mbps_rx": $(echo "scale=2; $rx_rate / 1024 / 1024" | bc -l 2>/dev/null || echo "0"),
    "rate_mbps_tx": $(echo "scale=2; $tx_rate / 1024 / 1024" | bc -l 2>/dev/null || echo "0"),
    "rate_mbps_total": $(echo "scale=2; $total_rate / 1024 / 1024" | bc -l 2>/dev/null || echo "0")
  },
  "warnings": {
    "high_bandwidth_usage": $([ $((total_diff / 1024 / 1024)) -gt $BANDWIDTH_USAGE_WARNING_MB ] && echo true || echo false)
  }
}
EOF
    else
        echo
        echo -e "${BOLD}${CYAN}Bandwidth Usage on $interface${NC}"
        echo -e "${CYAN}===========================${NC}"
        echo
        echo -e "Total RX: $((rx_diff / 1024)) KB"
        echo -e "Total TX: $((tx_diff / 1024)) KB"
        echo -e "Total: $((total_diff / 1024)) KB"
        echo
        echo -e "Average RX Rate: ${rx_rate} B/s"
        echo -e "Average TX Rate: ${tx_rate} B/s"
        echo -e "Average Total Rate: ${total_rate} B/s"
        echo

        # Show warning if threshold exceeded
        local total_mb=$((total_diff / 1024 / 1024))
        if [ "$total_mb" -gt "$BANDWIDTH_USAGE_WARNING_MB" ]; then
            echo -e "${YELLOW}⚠️  High bandwidth usage detected${NC}"
        else
            echo -e "${GREEN}✅ Bandwidth usage within normal limits${NC}"
        fi
    fi
}

# Security scan utilities
perform_port_scan() {
    local target="${1:-127.0.0.1}"
    local port_range="${2:-1-1000}"

    log_info "Performing port scan on $target (ports $port_range)..."

    if command -v nmap >/dev/null 2>&1; then
        local scan_result
        scan_result=$(nmap -p "$port_range" "$target" 2>/dev/null | grep -E "(open|closed|filtered)")

        if [ "$OUTPUT_FORMAT" = "json" ]; then
            echo "Port scan results would require complex JSON parsing - showing human readable format"
        fi

        echo
        echo -e "${BOLD}${CYAN}Port Scan Results for $target${NC}"
        echo -e "${CYAN}==============================${NC}"
        echo
        echo "$scan_result"

    else
        # Fallback: basic port check with netcat if available
        log_warning "nmap not available, performing basic port check"

        echo
        echo -e "${BOLD}${CYAN}Basic Port Check for $target${NC}"
        echo -e "${CYAN}============================${NC}"
        echo

        # Check common ports
        local common_ports=(22 23 25 53 80 110 143 443 993 995)
        for port in "${common_ports[@]}"; do
            if command -v nc >/dev/null 2>&1; then
                if nc -z -w3 "$target" "$port" 2>/dev/null; then
                    echo -e "Port ${GREEN}$port${NC}: ${GREEN}OPEN${NC}"
                else
                    echo -e "Port $port: CLOSED"
                fi
            fi
        done
    fi
}

# Network interface discovery
discover_network_interfaces() {
    log_info "Discovering network interfaces..."

    echo
    echo -e "${BOLD}${CYAN}Network Interfaces${NC}"
    echo -e "${CYAN}==================${NC}"
    echo

    if command -v ip >/dev/null 2>&1; then
        ip addr show | while read -r line; do
            if [[ "$line" =~ ^[0-9]+: ]]; then
                local interface=$(echo "$line" | cut -d: -f2 | tr -d ' ')
                echo -e "Interface: ${GREEN}$interface${NC}"
            elif [[ "$line" =~ inet\  ]]; then
                local ip=$(echo "$line" | awk '{print $2}' | cut -d'/' -f1)
                echo -e "  IP Address: $ip"
            fi
        done
    elif [ -f "/proc/net/dev" ]; then
        echo "Available interfaces:"
        cat /proc/net/dev | grep -E "(eth|wlan|enp|lo)" | awk -F: '{print "  " $1}' | sed 's/ //g'
    else
        log_error "Network interface discovery not available"
        return 1
    fi
}

# Generate network health report
generate_network_health_report() {
    local duration="${1:-60}"

    log_info "Generating comprehensive network health report..."

    echo
    echo -e "${BOLD}${MAGENTA}Network Health Report${NC}"
    echo -e "${MAGENTA}=====================${NC}"
    echo

    # System performance
    echo -e "${CYAN}1. System Performance${NC}"
    measure_system_performance 10

    # Network latency
    echo
    echo -e "${CYAN}2. Network Latency${NC}"
    measure_network_latency "8.8.8.8" 3

    # Connection monitoring
    echo
    echo -e "${CYAN}3. Connection Statistics${NC}"
    monitor_network_connections 20

    # Bandwidth usage
    echo
    echo -e "${CYAN}4. Bandwidth Usage${NC}"
    monitor_bandwidth_usage "" 20

    # Interface discovery
    echo
    echo -e "${CYAN}5. Network Interfaces${NC}"
    discover_network_interfaces

    # Summary
    echo
    echo -e "${BOLD}${GREEN}Network Health Summary${NC}"
    echo -e "${GREEN}======================${NC}"
    echo -e "Report generated at: $(date)"
    echo -e "Monitoring duration: ${duration} seconds"
    echo -e "${GREEN}✅ Network health assessment completed${NC}"
}

# Show help
show_help() {
    cat << EOF
${BOLD}Network Analysis Utilities${NC}

${CYAN}USAGE:${NC}
    network-analysis-utils.sh COMMAND [OPTIONS]

${CYAN}COMMANDS:${NC}
    performance [SECONDS]           Measure system performance (default: 10s)
    latency [TARGET] [COUNT]        Test network latency (default: 8.8.8.8, 5 packets)
    connections [SECONDS]           Monitor network connections (default: 30s)
    bandwidth [INTERFACE] [SECONDS] Monitor bandwidth usage (default: auto, 30s)
    port-scan [TARGET] [RANGE]      Perform port scan (default: 127.0.0.1, 1-1000)
    interfaces                      Discover network interfaces
    health-report [SECONDS]         Generate comprehensive health report (default: 60s)

${CYAN}GLOBAL OPTIONS:${NC}
    -f, --format FORMAT         Output format: human, json (default: human)
    -v, --verbose               Enable verbose output
    -h, --help                  Show this help message

${CYAN}EXAMPLES:${NC}
    # Measure system performance for 30 seconds
    network-analysis-utils.sh performance 30

    # Test latency to Google DNS
    network-analysis-utils.sh latency 8.8.8.8 10

    # Monitor bandwidth on eth0 for 2 minutes
    network-analysis-utils.sh bandwidth eth0 120

    # Generate JSON health report
    network-analysis-utils.sh health-report 60 --format json

${CYAN}THRESHOLDS:${NC}
    CPU Warning: ${CPU_WARNING_THRESHOLD}%
    Memory Warning: ${MEMORY_WARNING_THRESHOLD}%
    Network Latency Warning: ${NETWORK_LATENCY_WARNING_MS}ms
    Packet Loss Warning: ${PACKET_LOSS_WARNING_THRESHOLD}%
    Connection Count Warning: ${CONNECTION_COUNT_WARNING}
    Bandwidth Usage Warning: ${BANDWIDTH_USAGE_WARNING_MB}MB

EOF
}

# Main execution
main() {
    local command=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            performance)
                command="performance"
                shift
                ;;
            latency)
                command="latency"
                shift
                ;;
            connections)
                command="connections"
                shift
                ;;
            bandwidth)
                command="bandwidth"
                shift
                ;;
            port-scan)
                command="port-scan"
                shift
                ;;
            interfaces)
                command="interfaces"
                shift
                ;;
            health-report)
                command="health-report"
                shift
                ;;
            -f|--format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$command" ]; then
                    log_error "Unknown command: $1"
                    show_help
                    exit 1
                fi
                break
                ;;
        esac
    done

    # Execute command with remaining arguments
    case $command in
        performance)
            measure_system_performance "${1:-10}"
            ;;
        latency)
            measure_network_latency "${1:-8.8.8.8}" "${2:-5}"
            ;;
        connections)
            monitor_network_connections "${1:-30}"
            ;;
        bandwidth)
            monitor_bandwidth_usage "${1:-}" "${2:-30}"
            ;;
        port-scan)
            perform_port_scan "${1:-127.0.0.1}" "${2:-1-1000}"
            ;;
        interfaces)
            discover_network_interfaces
            ;;
        health-report)
            generate_network_health_report "${1:-60}"
            ;;
        *)
            log_error "No command specified"
            show_help
            exit 1
            ;;
    esac
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi