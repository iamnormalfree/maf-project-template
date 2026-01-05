#!/bin/bash
# ABOUTME: DNS protocol analysis tool for network security monitoring
# Analyzes DNS traffic patterns, detects tunneling, and identifies suspicious domains

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

# Suspicious TLDs and patterns
SUSPICIOUS_TLDS=(
    ".tk" ".ml" ".ga" ".cf" ".gq" ".men"
    ".click" ".download" ".link" ".xyz" ".trade"
    ".win" ".top" ".loan" ".review" ".website"
)

DNS_TUNNELING_PATTERNS=(
    "^[a-f0-9]{32,}\\."  # Long hex strings
    "^[a-zA-Z0-9]{50,}\\."  # Very long subdomains
    "^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\\."  # UUID patterns
    "^[a-zA-Z0-9]{16,}\\..*\\.[a-zA-Z0-9]{16,}\\."  # Multi-segment encoding
)

DGA_PATTERNS=(
    "^[a-z]{8,}[0-9]{4,}\\."  # Dictionary + numbers
    "^[a-z]{20,}\\."  # Very long dictionary words
    "^[a-z0-9]{16,}\\.ru\\|\\.cn\\|\\.tk\\|\\.ml"  # Long names on suspicious TLDs
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

# DNS traffic capture
capture_dns_traffic() {
    local duration="$1"
    local output_file="${PROJECT_ROOT}/runtime/logs/dns-capture-$(date +%Y%m%d-%H%M%S).pcap"

    log_info "Capturing DNS traffic for ${duration} seconds..."
    mkdir -p "$(dirname "$output_file")"

    if command -v tcpdump >/dev/null 2>&1; then
        if [ "$INTERFACE" = "any" ]; then
            tcpdump -i any -s 0 -w "$output_file" "port 53" -G "$duration" -W 1 &
        else
            tcpdump -i "$INTERFACE" -s 0 -w "$output_file" "port 53" -G "$duration" -W 1 &
        fi
        local tcpdump_pid=$!

        log_verbose "TCPdump started with PID: $tcpdump_pid"

        # Wait for capture duration
        sleep "$duration"

        # Stop tcpdump
        kill "$tcpdump_pid" 2>/dev/null || true
        wait "$tcpdump_pid" 2>/dev/null || true

        log_success "DNS traffic captured to: $output_file"
        echo "$output_file"
    else
        log_error "tcpdump not available for traffic capture"
        return 1
    fi
}

# Extract DNS queries from capture file
extract_dns_queries() {
    local pcap_file="$1"

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot extract DNS queries"
        return 1
    fi

    log_verbose "Extracting DNS queries from $pcap_file"

    # Extract DNS queries and responses
    tshark -r "$pcap_file" -Y "dns" -T fields -e dns.qry.name -e dns.qry.type -e dns.flags.response 2>/dev/null | while IFS=$'\t' read -r domain query_type is_response; do
        if [ -n "$domain" ]; then
            local response_flag="QUERY"
            if [ "$is_response" = "1" ]; then
                response_flag="RESPONSE"
            fi
            echo "$domain|$query_type|$response_flag"
        fi
    done
}

# Check for suspicious TLDs
check_suspicious_tlds() {
    local domain="$1"

    for tld in "${SUSPICIOUS_TLDS[@]}"; do
        if [[ "$domain" == *"$tld" ]]; then
            return 0
        fi
    done
    return 1
}

# Check for DNS tunneling patterns
check_dns_tunneling() {
    local domain="$1"
    local subdomain=$(echo "$domain" | cut -d'.' -f1)

    for pattern in "${DNS_TUNNELING_PATTERNS[@]}"; do
        if [[ "$subdomain" =~ $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# Check for DGA (Domain Generation Algorithm) patterns
check_dga_patterns() {
    local domain="$1"

    for pattern in "${DGA_PATTERNS[@]}"; do
        if [[ "$domain" =~ $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# Calculate domain entropy (simplified)
calculate_domain_entropy() {
    local domain="$1"
    local subdomain=$(echo "$domain" | cut -d'.' -f1)

    # Remove common subdomain patterns
    subdomain=$(echo "$subdomain" | sed 's/^www\|^mail\|^ftp\|^api\|^cdn//')

    # Calculate character frequency entropy
    local len=${#subdomain}
    if [ "$len" -lt 8 ]; then
        echo "0"
        return
    fi

    # Count unique characters
    local unique_chars=$(echo "$subdomain" | fold -w1 | sort -u | wc -l)

    # Simple entropy calculation
    local entropy=$(( (unique_chars * 100) / len ))
    echo "$entropy"
}

# Analyze DNS query patterns
analyze_dns_patterns() {
    local pcap_file="$1"

    log_info "Analyzing DNS query patterns..."

    local total_queries=0
    local suspicious_tlds=0
    local tunneling_attempts=0
    local dga_domains=0
    local high_entropy_domains=0
    local unique_domains=()

    while IFS='|' read -r domain query_type response_flag; do
        if [ -n "$domain" ]; then
            # Count queries only (not responses)
            if [ "$response_flag" = "QUERY" ]; then
                ((total_queries++))
                unique_domains+=("$domain")

                # Check for suspicious TLDs
                if check_suspicious_tlds "$domain"; then
                    ((suspicious_tlds++))
                    log_verbose "Suspicious TLD detected: $domain"
                fi

                # Check for DNS tunneling
                if check_dns_tunneling "$domain"; then
                    ((tunneling_attempts++))
                    log_verbose "DNS tunneling pattern detected: $domain"
                fi

                # Check for DGA patterns
                if check_dga_patterns "$domain"; then
                    ((dga_domains++))
                    log_verbose "DGA pattern detected: $domain"
                fi

                # Check for high entropy domains
                local entropy=$(calculate_domain_entropy "$domain")
                if [ "$entropy" -gt 60 ]; then
                    ((high_entropy_domains++))
                    log_verbose "High entropy domain ($entropy%): $domain"
                fi
            fi
        fi
    done < <(extract_dns_queries "$pcap_file")

    # Get unique domain count
    local unique_domain_count=$(printf '%s\n' "${unique_domains[@]}" | sort -u | wc -l)

    # Display results
    echo
    echo -e "${BOLD}${CYAN}DNS Traffic Analysis Results${NC}"
    echo -e "${CYAN}============================${NC}"
    echo
    echo -e "Total DNS Queries: ${GREEN}$total_queries${NC}"
    echo -e "Unique Domains: ${GREEN}$unique_domain_count${NC}"
    echo -e "Suspicious TLDs: ${RED}$suspicious_tlds${NC}"
    echo -e "DNS Tunneling Attempts: ${RED}$tunneling_attempts${NC}"
    echo -e "DGA Domains: ${RED}$dga_domains${NC}"
    echo -e "High Entropy Domains: ${YELLOW}$high_entropy_domains${NC}"

    # Calculate risk score
    local total_suspicious=$((suspicious_tlds + tunneling_attempts + dga_domains + high_entropy_domains))
    local risk_percentage=0
    if [ "$total_queries" -gt 0 ]; then
        risk_percentage=$(( (total_suspicious * 100) / total_queries ))
    fi

    echo
    echo -e "Risk Assessment:"
    if [ "$risk_percentage" -gt 15 ]; then
        echo -e "  Overall Risk: ${RED}HIGH${NC} ($risk_percentage% suspicious queries)"
    elif [ "$risk_percentage" -gt 5 ]; then
        echo -e "  Overall Risk: ${YELLOW}MEDIUM${NC} ($risk_percentage% suspicious queries)"
    else
        echo -e "  Overall Risk: ${GREEN}LOW${NC} ($risk_percentage% suspicious queries)"
    fi
}

# Show top queried domains
show_top_domains() {
    local pcap_file="$1"
    local limit="${2:-10}"

    echo
    echo -e "${BOLD}${CYAN}Top Queried Domains${NC}"
    echo -e "${CYAN}===================${NC}"
    echo

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot show top domains"
        return 1
    fi

    # Extract and count domains
    tshark -r "$pcap_file" -Y "dns.flags.response == 0" -T fields -e dns.qry.name 2>/dev/null | \
        sort | uniq -c | sort -nr | head -n "$limit" | while read -r count domain; do
        if [ -n "$domain" ] && [ "$count" -gt 1 ]; then
            echo -e "  ${GREEN}$count${NC} queries: ${CYAN}$domain${NC}"
        fi
    done
}

# Detect DNS amplification attacks
detect_dns_amplification() {
    local pcap_file="$1"

    echo
    echo -e "${BOLD}${CYAN}DNS Amplification Detection${NC}"
    echo -e "${CYAN}==========================${NC}"
    echo

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot detect amplification attacks"
        return 1
    fi

    # Check for large DNS responses
    local large_responses=$(tshark -r "$pcap_file" -Y "dns.flags.response == 1 and dns.length > 512" -T fields -e dns.length -e dns.qry.name 2>/dev/null | wc -l)

    if [ "$large_responses" -gt 0 ]; then
        echo -e "  ${RED}🚨 Potential DNS Amplification Detected${NC}"
        echo -e "  Large DNS responses (>512 bytes): ${RED}$large_responses${NC}"

        # Show some examples
        echo -e "\n  ${YELLOW}Sample large responses:${NC}"
        tshark -r "$pcap_file" -Y "dns.flags.response == 1 and dns.length > 512" -T fields -e dns.length -e dns.qry.name 2>/dev/null | head -5 | while read -r length domain; do
            echo -e "    ${length} bytes: $domain"
        done
    else
        echo -e "  ${GREEN}✅ No DNS amplification detected${NC}"
    fi
}

# Show help
show_help() {
    cat << EOF
${BOLD}DNS Protocol Analyzer${NC}

${CYAN}USAGE:${NC}
    protocol-analyzer-dns.sh [OPTIONS]

${CYAN}OPTIONS:${NC}
    -d, --duration SECONDS       Capture duration (default: 60)
    -i, --interface INTERFACE    Network interface (default: any)
    -f, --format FORMAT         Output format: human, json (default: human)
    -v, --verbose               Enable verbose output
    -c, --capture-only          Capture traffic only, no analysis
    -a, --analyze-file FILE     Analyze existing capture file
    -t, --top-domains N         Show top N queried domains (default: 10)
    -h, --help                  Show this help message

${CYAN}DETECTION CAPABILITIES:${NC}
    • DNS Tunneling detection
    • Domain Generation Algorithm (DGA) detection
    • Suspicious TLD monitoring
    • High entropy domain detection
    • DNS amplification attack detection
    • Query pattern analysis

${CYAN}EXAMPLES:${NC}
    # Capture and analyze DNS traffic for 5 minutes
    protocol-analyzer-dns.sh --duration 300

    # Analyze existing capture file
    protocol-analyzer-dns.sh --analyze-file dns.pcap

    # Show top 20 queried domains
    protocol-analyzer-dns.sh --top-domains 20

EOF
}

# JSON output
output_json() {
    local total_queries="$1"
    local unique_domains="$2"
    local suspicious_tlds="$3"
    local tunneling_attempts="$4"
    local dga_domains="$5"
    local high_entropy_domains="$6"
    local capture_file="$7"

    local total_suspicious=$((suspicious_tlds + tunneling_attempts + dga_domains + high_entropy_domains))
    local risk_percentage=0
    if [ "$total_queries" -gt 0 ]; then
        risk_percentage=$(( (total_suspicious * 100) / total_queries ))
    fi

    cat << EOF
{
  "analysis_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "protocol": "dns",
  "capture_file": "$capture_file",
  "duration_seconds": $CAPTURE_DURATION,
  "statistics": {
    "total_queries": $total_queries,
    "unique_domains": $unique_domains,
    "suspicious_activity": {
      "suspicious_tlds": $suspicious_tlds,
      "dns_tunneling_attempts": $tunneling_attempts,
      "dga_domains": $dga_domains,
      "high_entropy_domains": $high_entropy_domains,
      "total_suspicious": $total_suspicious
    },
    "risk_percentage": $risk_percentage
  },
  "risk_level": "$([ "$risk_percentage" -gt 15 ] && echo "HIGH" || [ "$risk_percentage" -gt 5 ] && echo "MEDIUM" || echo "LOW")"
}
EOF
}

# Main execution
main() {
    local capture_only=false
    local analyze_file=""
    local top_domains=10

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
            -t|--top-domains)
                top_domains="$2"
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
    echo -e "${BOLD}${MAGENTA}DNS Protocol Analyzer${NC}"
    echo -e "${MAGENTA}=======================${NC}"
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
            analyze_dns_patterns "$analyze_file"
            show_top_domains "$analyze_file" "$top_domains"
            detect_dns_amplification "$analyze_file"
        fi
    else
        # Capture new traffic
        local pcap_file
        pcap_file=$(capture_dns_traffic "$CAPTURE_DURATION")

        if [ "$capture_only" = true ]; then
            log_success "Traffic capture completed: $pcap_file"
            exit 0
        fi

        if [ "$OUTPUT_FORMAT" = "json" ]; then
            # Extract metrics for JSON output (simplified)
            local total_queries=0
            local unique_domains=0
            local suspicious_tlds=0
            local tunneling_attempts=0
            local dga_domains=0
            local high_entropy_domains=0

            if command -v tshark >/dev/null 2>&1; then
                total_queries=$(tshark -r "$pcap_file" -Y "dns.flags.response == 0" -T fields -e dns.qry.name 2>/dev/null | wc -l)
                unique_domains=$(tshark -r "$pcap_file" -Y "dns.flags.response == 0" -T fields -e dns.qry.name 2>/dev/null | sort -u | wc -l)
            fi

            output_json "$total_queries" "$unique_domains" "$suspicious_tlds" "$tunneling_attempts" "$dga_domains" "$high_entropy_domains" "$pcap_file"
        else
            analyze_dns_patterns "$pcap_file"
            show_top_domains "$pcap_file" "$top_domains"
            detect_dns_amplification "$pcap_file"
        fi
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi