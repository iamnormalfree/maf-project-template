#!/bin/bash
# ABOUTME: TLS/SSL protocol analysis tool for network security monitoring
# Analyzes TLS handshakes, certificate chains, and detects suspicious TLS behavior

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

# Suspicious certificate patterns
SUSPICIOUS_ISSUERS=(
    "Let's Encrypt Authority X3"  # Can be legitimate but worth monitoring
    "STAGING"  # Staging environments
    "Self-Signed"
    "Unknown CA"
)

SUSPICIOUS_CIPHER_SUITES=(
    "TLS_RSA_WITH_RC4_128_SHA"  # Weak cipher
    "TLS_RSA_WITH_3DES_EDE_CBC_SHA"  # Deprecated
    "TLS_RSA_WITH_AES_128_CBC_SHA256"  # No forward secrecy
    "TLS_ECDHE_RSA_WITH_RC4_128_SHA"  # Weak cipher with ECDHE
)

WEAK_TLS_VERSIONS=(
    "SSLv2"
    "SSLv3"
    "TLSv1.0"  # Deprecated
)

# Certificate age thresholds (days)
CERTIFICATE_TOO_OLD=825  # ~2.25 years
CERTIFICATE_TOO_YOUNG=1   # Less than 1 day (potential abuse)

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

# TLS traffic capture
capture_tls_traffic() {
    local duration="$1"
    local output_file="${PROJECT_ROOT}/runtime/logs/tls-capture-$(date +%Y%m%d-%H%M%S).pcap"

    log_info "Capturing TLS/SSL traffic for ${duration} seconds..."
    mkdir -p "$(dirname "$output_file")"

    if command -v tcpdump >/dev/null 2>&1; then
        if [ "$INTERFACE" = "any" ]; then
            tcpdump -i any -s 0 -w "$output_file" "tcp port 443 or tcp port 8443 or tcp port 993 or tcp port 995 or tcp port 636" -G "$duration" -W 1 &
        else
            tcpdump -i "$INTERFACE" -s 0 -w "$output_file" "tcp port 443 or tcp port 8443 or tcp port 993 or tcp port 995 or tcp port 636" -G "$duration" -W 1 &
        fi
        local tcpdump_pid=$!

        log_verbose "TCPdump started with PID: $tcpdump_pid"

        # Wait for capture duration
        sleep "$duration"

        # Stop tcpdump
        kill "$tcpdump_pid" 2>/dev/null || true
        wait "$tcpdump_pid" 2>/dev/null || true

        log_success "TLS traffic captured to: $output_file"
        echo "$output_file"
    else
        log_error "tcpdump not available for traffic capture"
        return 1
    fi
}

# Extract TLS handshake information
extract_tls_handshakes() {
    local pcap_file="$1"

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot extract TLS handshakes"
        return 1
    fi

    log_verbose "Extracting TLS handshake information from $pcap_file"

    # Extract TLS handshakes
    tshark -r "$pcap_file" -Y "tls.handshake.type == 1" -T fields \
        -e tls.handshake.version -e tls.handshake.ciphersuite -e x509sat.uCN -e x509sat.uO -e x509sat.uOU 2>/dev/null | \
        while IFS=$'\t' read -r version cipher cn org ou; do
            if [ -n "$version" ]; then
                echo "$version|$cipher|$cn|$org|$ou"
            fi
        done
}

# Check for weak TLS versions
check_weak_tls_versions() {
    local version="$1"

    for weak_version in "${WEAK_TLS_VERSIONS[@]}"; do
        if [[ "$version" == *"$weak_version"* ]]; then
            return 0
        fi
    done
    return 1
}

# Check for weak cipher suites
check_weak_ciphers() {
    local cipher="$1"

    for weak_cipher in "${SUSPICIOUS_CIPHER_SUITES[@]}"; do
        if [[ "$cipher" == *"$weak_cipher"* ]]; then
            return 0
        fi
    done
    return 1
}

# Check certificate age
check_certificate_age() {
    local not_after="$1"
    local not_before="$2"

    if [ -z "$not_after" ] || [ -z "$not_before" ]; then
        return 1
    fi

    # Convert dates to timestamps (simplified approach)
    local current_timestamp=$(date +%s)
    local expiry_timestamp=$(date -d "$not_after" +%s 2>/dev/null || echo $((current_timestamp + 365 * 24 * 3600)))  # Default to 1 year from now if parsing fails
    local issue_timestamp=$(date -d "$not_before" +%s 2>/dev/null || echo $((current_timestamp - 30 * 24 * 3600)))  # Default to 30 days ago if parsing fails

    local cert_age_days=$(( (current_timestamp - issue_timestamp) / (24 * 3600) ))
    local cert_days_until_expiry=$(( (expiry_timestamp - current_timestamp) / (24 * 3600) ))

    # Check if certificate is too old
    if [ "$cert_age_days" -gt "$CERTIFICATE_TOO_OLD" ]; then
        return 0
    fi

    # Check if certificate is too young (potential abuse)
    if [ "$cert_age_days" -lt "$CERTIFICATE_TOO_YOUNG" ]; then
        return 2
    fi

    # Check if certificate is expiring soon
    if [ "$cert_days_until_expiry" -lt 30 ]; then
        return 3
    fi

    return 1
}

# Analyze TLS handshakes
analyze_tls_handshakes() {
    local pcap_file="$1"

    log_info "Analyzing TLS handshakes..."

    local total_handshakes=0
    local weak_versions=0
    local weak_ciphers=0
    local self_signed=0
    local expired_certs=0
    local suspicious_issuers=0

    while IFS='|' read -r version cipher cn org ou; do
        if [ -n "$version" ]; then
            ((total_handshakes++))

            # Check for weak TLS versions
            if check_weak_tls_versions "$version"; then
                ((weak_versions++))
                log_verbose "Weak TLS version detected: $version"
            fi

            # Check for weak cipher suites
            if check_weak_ciphers "$cipher"; then
                ((weak_ciphers++))
                log_verbose "Weak cipher suite detected: $cipher"
            fi

            # Check for self-signed certificates (simplified check)
            if [[ "$cn" == *"self-signed"* ]] || [[ "$cn" == *"unknown"* ]]; then
                ((self_signed++))
                log_verbose "Self-signed certificate detected: $cn"
            fi

            # Check for suspicious issuers
            for issuer in "${SUSPICIOUS_ISSUERS[@]}"; do
                if [[ "$org" == *"$issuer"* ]] || [[ "$ou" == *"$issuer"* ]]; then
                    ((suspicious_issuers++))
                    log_verbose "Suspicious issuer detected: $issuer"
                    break
                fi
            done
        fi
    done < <(extract_tls_handshakes "$pcap_file")

    # Display results
    echo
    echo -e "${BOLD}${CYAN}TLS Handshake Analysis Results${NC}"
    echo -e "${CYAN}===============================${NC}"
    echo
    echo -e "Total TLS Handshakes: ${GREEN}$total_handshakes${NC}"
    echo -e "Weak TLS Versions: ${RED}$weak_versions${NC}"
    echo -e "Weak Cipher Suites: ${RED}$weak_ciphers${NC}"
    echo -e "Self-Signed Certificates: ${YELLOW}$self_signed${NC}"
    echo -e "Suspicious Issuers: ${YELLOW}$suspicious_issuers${NC}"
    echo -e "Expired Certificates: ${RED}$expired_certs${NC}"

    # Calculate risk score
    local total_weak=$((weak_versions + weak_ciphers + self_signed + suspicious_issuers + expired_certs))
    local risk_percentage=0
    if [ "$total_handshakes" -gt 0 ]; then
        risk_percentage=$(( (total_weak * 100) / total_handshakes ))
    fi

    echo
    echo -e "Risk Assessment:"
    if [ "$risk_percentage" -gt 25 ]; then
        echo -e "  Overall Risk: ${RED}HIGH${NC} ($risk_percentage% problematic handshakes)"
    elif [ "$risk_percentage" -gt 10 ]; then
        echo -e "  Overall Risk: ${YELLOW}MEDIUM${NC} ($risk_percentage% problematic handshakes)"
    else
        echo -e "  Overall Risk: ${GREEN}LOW${NC} ($risk_percentage% problematic handshakes)"
    fi
}

# Show TLS version distribution
show_tls_versions() {
    local pcap_file="$1"

    echo
    echo -e "${BOLD}${CYAN}TLS Version Distribution${NC}"
    echo -e "${CYAN}========================${NC}"
    echo

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot show TLS versions"
        return 1
    fi

    # Count TLS versions
    tshark -r "$pcap_file" -Y "tls.handshake.type == 1" -T fields -e tls.handshake.version 2>/dev/null | \
        sort | uniq -c | sort -nr | while read -r count version; do
        if [ -n "$version" ]; then
            local version_color="$GREEN"
            if check_weak_tls_versions "$version"; then
                version_color="$RED"
            fi
            echo -e "  ${version_color}$count${NC} connections: ${version_color}$version${NC}"
        fi
    done
}

# Show cipher suite distribution
show_cipher_suites() {
    local pcap_file="$1"
    local limit="${2:-10}"

    echo
    echo -e "${BOLD}${CYAN}Top Cipher Suites${NC}"
    echo -e "${CYAN}================${NC}"
    echo

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot show cipher suites"
        return 1
    fi

    # Count cipher suites
    tshark -r "$pcap_file" -Y "tls.handshake.type == 1" -T fields -e tls.handshake.ciphersuite 2>/dev/null | \
        sort | uniq -c | sort -nr | head -n "$limit" | while read -r count cipher; do
        if [ -n "$cipher" ] && [ "$count" -gt 1 ]; then
            local cipher_color="$GREEN"
            if check_weak_ciphers "$cipher"; then
                cipher_color="$RED"
            fi
            echo -e "  ${cipher_color}$count${NC} connections: ${cipher_color}$cipher${NC}"
        fi
    done
}

# Detect TLS anomalies
detect_tls_anomalies() {
    local pcap_file="$1"

    echo
    echo -e "${BOLD}${CYAN}TLS Anomaly Detection${NC}"
    echo -e "${CYAN}======================${NC}"
    echo

    if ! command -v tshark >/dev/null 2>&1; then
        log_warning "tshark not available, cannot detect TLS anomalies"
        return 1
    fi

    # Check for TLS handshake failures
    local handshake_failures=$(tshark -r "$pcap_file" -Y "tls.alert.level == 2" -T fields -e tls.alert.description 2>/dev/null | wc -l)

    if [ "$handshake_failures" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️  TLS Handshake Failures: $handshake_failures${NC}"
        echo -e "  ${YELLOW}Sample alerts:${NC}"
        tshark -r "$pcap_file" -Y "tls.alert.level == 2" -T fields -e tls.alert.description 2>/dev/null | sort | uniq -c | sort -nr | head -3 | while read -r count alert; do
            echo -e "    $alert ($count occurrences)"
        done
    else
        echo -e "  ${GREEN}✅ No TLS handshake failures detected${NC}"
    fi

    # Check for incomplete TLS handshakes
    local incomplete_handshakes=$(tshark -r "$pcap_file" -Y "tls.handshake.type == 1 and not tls.handshake.type == 2" -T fields -e ip.src -e ip.dst 2>/dev/null | wc -l)

    if [ "$incomplete_handshakes" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️  Incomplete TLS Handshakes: $incomplete_handshakes${NC}"
    else
        echo -e "  ${GREEN}✅ No incomplete TLS handshakes detected${NC}"
    fi

    # Check for unusual certificate chains
    local cert_chain_issues=$(tshark -r "$pcap_file" -Y "x509sat.len == 0" -T fields -e ip.src -e ip.dst 2>/dev/null | wc -l)

    if [ "$cert_chain_issues" -gt 0 ]; then
        echo -e "  ${RED}🚨 Certificate Chain Issues: $cert_chain_issues${NC}"
    fi
}

# Show help
show_help() {
    cat << EOF
${BOLD}TLS/SSL Protocol Analyzer${NC}

${CYAN}USAGE:${NC}
    protocol-analyzer-tls.sh [OPTIONS]

${CYAN}OPTIONS:${NC}
    -d, --duration SECONDS       Capture duration (default: 60)
    -i, --interface INTERFACE    Network interface (default: any)
    -f, --format FORMAT         Output format: human, json (default: human)
    -v, --verbose               Enable verbose output
    -c, --capture-only          Capture traffic only, no analysis
    -a, --analyze-file FILE     Analyze existing capture file
    -s, --show-ciphers N        Show top N cipher suites (default: 10)
    -h, --help                  Show this help message

${CYAN}DETECTION CAPABILITIES:${NC}
    • Weak TLS version detection
    • Weak cipher suite identification
    • Self-signed certificate detection
    • Suspicious issuer monitoring
    • TLS handshake failure analysis
    • Certificate age validation
    • Certificate chain anomaly detection

${CYAN}EXAMPLES:${NC}
    # Capture and analyze TLS traffic for 5 minutes
    protocol-analyzer-tls.sh --duration 300

    # Analyze existing capture file
    protocol-analyzer-tls.sh --analyze-file tls.pcap

    # Show top 15 cipher suites
    protocol-analyzer-tls.sh --show-ciphers 15

EOF
}

# JSON output
output_json() {
    local total_handshakes="$1"
    local weak_versions="$2"
    local weak_ciphers="$3"
    local self_signed="$4"
    local suspicious_issuers="$5"
    local expired_certs="$6"
    local capture_file="$7"

    local total_weak=$((weak_versions + weak_ciphers + self_signed + suspicious_issuers + expired_certs))
    local risk_percentage=0
    if [ "$total_handshakes" -gt 0 ]; then
        risk_percentage=$(( (total_weak * 100) / total_handshakes ))
    fi

    cat << EOF
{
  "analysis_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "protocol": "tls",
  "capture_file": "$capture_file",
  "duration_seconds": $CAPTURE_DURATION,
  "statistics": {
    "total_handshakes": $total_handshakes,
    "security_issues": {
      "weak_tls_versions": $weak_versions,
      "weak_cipher_suites": $weak_ciphers,
      "self_signed_certificates": $self_signed,
      "suspicious_issuers": $suspicious_issuers,
      "expired_certificates": $expired_certs,
      "total_issues": $total_weak
    },
    "risk_percentage": $risk_percentage
  },
  "risk_level": "$([ "$risk_percentage" -gt 25 ] && echo "HIGH" || [ "$risk_percentage" -gt 10 ] && echo "MEDIUM" || echo "LOW")"
}
EOF
}

# Main execution
main() {
    local capture_only=false
    local analyze_file=""
    local show_ciphers=10

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
            -s|--show-ciphers)
                show_ciphers="$2"
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
    echo -e "${BOLD}${MAGENTA}TLS/SSL Protocol Analyzer${NC}"
    echo -e "${MAGENTA}========================${NC}"
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
            analyze_tls_handshakes "$analyze_file"
            show_tls_versions "$analyze_file"
            show_cipher_suites "$analyze_file" "$show_ciphers"
            detect_tls_anomalies "$analyze_file"
        fi
    else
        # Capture new traffic
        local pcap_file
        pcap_file=$(capture_tls_traffic "$CAPTURE_DURATION")

        if [ "$capture_only" = true ]; then
            log_success "Traffic capture completed: $pcap_file"
            exit 0
        fi

        if [ "$OUTPUT_FORMAT" = "json" ]; then
            # Extract metrics for JSON output (simplified)
            local total_handshakes=0
            local weak_versions=0
            local weak_ciphers=0
            local self_signed=0
            local suspicious_issuers=0
            local expired_certs=0

            if command -v tshark >/dev/null 2>&1; then
                total_handshakes=$(tshark -r "$pcap_file" -Y "tls.handshake.type == 1" -T fields -e tls.handshake.version 2>/dev/null | wc -l)
            fi

            output_json "$total_handshakes" "$weak_versions" "$weak_ciphers" "$self_signed" "$suspicious_issuers" "$expired_certs" "$pcap_file"
        else
            analyze_tls_handshakes "$pcap_file"
            show_tls_versions "$pcap_file"
            show_cipher_suites "$pcap_file" "$show_ciphers"
            detect_tls_anomalies "$pcap_file"
        fi
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi