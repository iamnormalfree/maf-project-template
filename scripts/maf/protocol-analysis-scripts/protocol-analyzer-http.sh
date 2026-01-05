#!/bin/bash
# ABOUTME: HTTP/HTTPS protocol analysis tool for network security monitoring
# Analyzes HTTP traffic patterns, detects attacks, and identifies suspicious behavior

set -euo pipefail

# Source MAF utilities and colors
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Source colors if available
if [ -f "${SCRIPT_DIR}/../lib/colors.sh" ]; then
    source "${SCRIPT_DIR}/../lib/colors.sh"
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
CAPTURE_DURATION="${CAPTURE_DURATION:-60}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-human}"
VERBOSE="${VERBOSE:-false}"
INTERFACE="${INTERFACE:-any}"

# Analysis patterns
SQL_INJECTION_PATTERNS=(
    "(union|select|insert|update|delete|drop|create|alter)"
    "(or|and)\s+\d+\s*=\s*\d+"
    "'\s*or\s*'"
    "'\s*;\s*"
    "(waitfor\(|sleep\s*\()"
)

XSS_PATTERNS=(
    "(<script[^>]*>)"
    "(javascript:)"
    "(onload|onerror|onclick\s*=)"
    "(<iframe[^>]*>)"
    "(eval\s*\(|alert\s*\()"
)

DIRECTORY_TRAVERSAL_PATTERNS=(
    "(\.\.[\/\\])+"
    "(\.\.%2f)+"
    "(\.\.%5c)+"
    "(%c0%af|%c1%9c)"
)

COMMAND_INJECTION_PATTERNS=(
    "(;\s*(rm|wget|curl|nc|netcat|whoami|id))"
    "(\|\s*(rm|wget|curl|nc|netcat))"
    "(&&\s*(rm|wget|curl|nc|netcat))"
    "(\`[^\`]*\`)"
    "\$\([^)]*\)"
)

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

# HTTP traffic capture
capture_http_traffic() {
    local duration="$1"
    local output_file="${PROJECT_ROOT}/runtime/logs/http-capture-$(date +%Y%m%d-%H%M%S).pcap"

    log_info "Capturing HTTP traffic for ${duration} seconds..."
    mkdir -p "$(dirname "$output_file")"

    if command -v tcpdump >/dev/null 2>&1; then
        if [ "$INTERFACE" = "any" ]; then
            tcpdump -i any -s 0 -w "$output_file" "port 80 or port 443" -G "$duration" -W 1 &
        else
            tcpdump -i "$INTERFACE" -s 0 -w "$output_file" "port 80 or port 443" -G "$duration" -W 1 &
        fi
        local tcpdump_pid=$!

        log_verbose "TCPdump started with PID: $tcpdump_pid"
        echo "$tcpdump_pid"

        # Wait for capture duration
        sleep "$duration"

        # Stop tcpdump
        kill "$tcpdump_pid" 2>/dev/null || true
        wait "$tcpdump_pid" 2>/dev/null || true

        log_success "HTTP traffic captured to: $output_file"
        echo "$output_file"
    else
        log_error "tcpdump not available for traffic capture"
        return 1
    fi
}

# Analyze HTTP payload for attack patterns
analyze_http_payload() {
    local payload="$1"
    local attack_type="$2"
    local patterns=()

    case "$attack_type" in
        "sql_injection")
            patterns=("${SQL_INJECTION_PATTERNS[@]}")
            ;;
        "xss")
            patterns=("${XSS_PATTERNS[@]}")
            ;;
        "directory_traversal")
            patterns=("${DIRECTORY_TRAVERSAL_PATTERNS[@]}")
            ;;
        "command_injection")
            patterns=("${COMMAND_INJECTION_PATTERNS[@]}")
            ;;
        *)
            log_error "Unknown attack type: $attack_type"
            return 1
            ;;
    esac

    local detected=false
    local matched_patterns=()

    for pattern in "${patterns[@]}"; do
        if echo "$payload" | grep -iqE "$pattern"; then
            detected=true
            matched_patterns+=("$pattern")
        fi
    done

    if [ "$detected" = true ]; then
        echo -e "${RED}🚨 $attack_type DETECTED${NC}"
        echo -e "${YELLOW}Matched patterns:${NC}"
        printf '  %s\n' "${matched_patterns[@]}"
        return 0
    fi

    return 1
}

# Extract HTTP payloads from capture file
extract_http_payloads() {
    local pcap_file="$1"

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, using basic analysis"
        return 1
    fi

    log_verbose "Extracting HTTP payloads from $pcap_file"

    # Extract HTTP requests
    tshark -r "$pcap_file" -Y "http.request" -T fields -e http.host -e http.request.uri -e http.user_agent 2>/dev/null | while IFS=$'\t' read -r host uri user_agent; do
        if [ -n "$host" ] && [ -n "$uri" ]; then
            echo "Host: $host"
            echo "URI: $uri"
            echo "User-Agent: $user_agent"
            echo "---"
        fi
    done
}

# Analyze HTTP headers for anomalies
analyze_http_headers() {
    local pcap_file="$1"

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, skipping header analysis"
        return 1
    fi

    log_info "Analyzing HTTP headers for anomalies..."

    echo
    echo -e "${BOLD}${CYAN}HTTP Header Analysis${NC}"
    echo -e "${CYAN}======================${NC}"
    echo

    # Check for suspicious User-Agents
    echo -e "${YELLOW}Suspicious User-Agents:${NC}"
    tshark -r "$pcap_file" -Y "http.user_agent contains \"sqlmap\" or http.user_agent contains \"nmap\" or http.user_agent contains \"nikto\"" -T fields -e http.user_agent 2>/dev/null | sort -u | while read -r ua; do
        if [ -n "$ua" ]; then
            echo -e "  ${RED}🔍 $ua${NC}"
        fi
    done

    # Check for unusual header sizes
    echo -e "\n${YELLOW}Unusually Large Headers:${NC}"
    tshark -r "$pcap_file" -Y "http.request" -T fields -e http.request.method -e http.request.uri -e http.host 2>/dev/null | while IFS=$'\t' read -r method uri host; do
        if [ -n "$uri" ] && [ ${#uri} -gt 1000 ]; then
            echo -e "  ${YELLOW}⚠️  $method $host${NC}"
            echo -e "     URI length: ${#uri} characters"
        fi
    done
}

# Perform comprehensive HTTP analysis
analyze_http_traffic() {
    local pcap_file="$1"

    log_info "Performing comprehensive HTTP traffic analysis..."

    # Initialize results
    local sql_injections=0
    local xss_attempts=0
    local directory_traversals=0
    local command_injections=0
    local total_requests=0

    if command -v tshark >/dev/null 2>&1; then
        # Count total HTTP requests
        total_requests=$(tshark -r "$pcap_file" -Y "http.request" -T fields -e http.request.method 2>/dev/null | wc -l)

        # Analyze each HTTP request
        tshark -r "$pcap_file" -Y "http.request" -T fields -e http.request.uri -e http.request.method 2>/dev/null | while IFS=$'\t' read -r uri method; do
            if [ -n "$uri" ]; then
                # Create payload for analysis
                local payload="$method $uri"

                # Test against different attack patterns
                if analyze_http_payload "$payload" "sql_injection" >/dev/null 2>&1; then
                    ((sql_injections++))
                fi

                if analyze_http_payload "$payload" "xss" >/dev/null 2>&1; then
                    ((xss_attempts++))
                fi

                if analyze_http_payload "$payload" "directory_traversal" >/dev/null 2>&1; then
                    ((directory_traversals++))
                fi

                if analyze_http_payload "$payload" "command_injection" >/dev/null 2>&1; then
                    ((command_injections++))
                fi
            fi
        done
    fi

    # Display results
    echo
    echo -e "${BOLD}${CYAN}HTTP Traffic Analysis Results${NC}"
    echo -e "${CYAN}==============================${NC}"
    echo
    echo -e "Total HTTP Requests: ${GREEN}$total_requests${NC}"
    echo -e "SQL Injection Attempts: ${RED}$sql_injections${NC}"
    echo -e "XSS Attempts: ${RED}$xss_attempts${NC}"
    echo -e "Directory Traversal Attempts: ${RED}$directory_traversals${NC}"
    echo -e "Command Injection Attempts: ${RED}$command_injections${NC}"

    # Calculate risk score
    local total_attacks=$((sql_injections + xss_attempts + directory_traversals + command_injections))
    local risk_percentage=0
    if [ "$total_requests" -gt 0 ]; then
        risk_percentage=$(( (total_attacks * 100) / total_requests ))
    fi

    echo
    echo -e "Risk Assessment:"
    if [ "$risk_percentage" -gt 20 ]; then
        echo -e "  Overall Risk: ${RED}HIGH${NC} ($risk_percentage% malicious requests)"
    elif [ "$risk_percentage" -gt 5 ]; then
        echo -e "  Overall Risk: ${YELLOW}MEDIUM${NC} ($risk_percentage% malicious requests)"
    else
        echo -e "  Overall Risk: ${GREEN}LOW${NC} ($risk_percentage% malicious requests)"
    fi
}

# Show help
show_help() {
    cat << EOF
${BOLD}HTTP/HTTPS Protocol Analyzer${NC}

${CYAN}USAGE:${NC}
    protocol-analyzer-http.sh [OPTIONS]

${CYAN}OPTIONS:${NC}
    -d, --duration SECONDS       Capture duration (default: 60)
    -i, --interface INTERFACE    Network interface (default: any)
    -f, --format FORMAT         Output format: human, json (default: human)
    -v, --verbose               Enable verbose output
    -c, --capture-only          Capture traffic only, no analysis
    -a, --analyze-file FILE     Analyze existing capture file
    -h, --help                  Show this help message

${CYAN}EXAMPLES:${NC}
    # Capture and analyze HTTP traffic for 2 minutes
    protocol-analyzer-http.sh --duration 120

    # Analyze existing capture file
    protocol-analyzer-http.sh --analyze-file traffic.pcap

    # Capture traffic on specific interface
    protocol-analyzer-http.sh --interface eth0

${CYAN}DETECTION CAPABILITIES:${NC}
    • SQL Injection attacks
    • Cross-Site Scripting (XSS)
    • Directory Traversal attacks
    • Command Injection attempts
    • Suspicious User-Agent detection
    • Anomalous HTTP headers

EOF
}

# JSON output
output_json() {
    local total_requests="$1"
    local sql_injections="$2"
    local xss_attempts="$3"
    local directory_traversals="$4"
    local command_injections="$5"
    local capture_file="$6"

    local total_attacks=$((sql_injections + xss_attempts + directory_traversals + command_injections))
    local risk_percentage=0
    if [ "$total_requests" -gt 0 ]; then
        risk_percentage=$(( (total_attacks * 100) / total_requests ))
    fi

    cat << EOF
{
  "analysis_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "protocol": "http",
  "capture_file": "$capture_file",
  "duration_seconds": $CAPTURE_DURATION,
  "statistics": {
    "total_requests": $total_requests,
    "attacks_detected": {
      "sql_injection": $sql_injections,
      "xss": $xss_attempts,
      "directory_traversal": $directory_traversals,
      "command_injection": $command_injections,
      "total": $total_attacks
    },
    "risk_percentage": $risk_percentage
  },
  "risk_level": "$([ "$risk_percentage" -gt 20 ] && echo "HIGH" || [ "$risk_percentage" -gt 5 ] && echo "MEDIUM" || echo "LOW")"
}
EOF
}

# Main execution
main() {
    local capture_only=false
    local analyze_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--duration)
                CAPTURE_DURATION="$2"
                shift 2
                ;;
            -i|--interface)
                INTERFACE="$2"
                shift 2
                ;;
            -f|--format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -c|--capture-only)
                capture_only=true
                shift
                ;;
            -a|--analyze-file)
                analyze_file="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    echo
    echo -e "${BOLD}${MAGENTA}HTTP/HTTPS Protocol Analyzer${NC}"
    echo -e "${MAGENTA}============================${NC}"
    echo

    if [ -n "$analyze_file" ]; then
        if [ ! -f "$analyze_file" ]; then
            log_error "Capture file not found: $analyze_file"
            exit 1
        fi

        log_info "Analyzing existing capture file: $analyze_file"

        if [ "$OUTPUT_FORMAT" = "json" ]; then
            # For JSON output, we'd need to implement full analysis in JSON format
            log_warning "JSON output for file analysis not fully implemented"
        else
            analyze_http_headers "$analyze_file"
            analyze_http_traffic "$analyze_file"
        fi
    else
        # Capture new traffic
        local pcap_file
        pcap_file=$(capture_http_traffic "$CAPTURE_DURATION")

        if [ "$capture_only" = true ]; then
            log_success "Traffic capture completed: $pcap_file"
            exit 0
        fi

        if [ "$OUTPUT_FORMAT" = "json" ]; then
            # Extract metrics for JSON output (simplified)
            local total_requests=0
            local sql_injections=0
            local xss_attempts=0
            local directory_traversals=0
            local command_injections=0

            if command -v tshark >/dev/null 2>&1; then
                total_requests=$(tshark -r "$pcap_file" -Y "http.request" -T fields -e http.request.method 2>/dev/null | wc -l)
            fi

            output_json "$total_requests" "$sql_injections" "$xss_attempts" "$directory_traversals" "$command_injections" "$pcap_file"
        else
            analyze_http_headers "$pcap_file"
            analyze_http_traffic "$pcap_file"
        fi
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi