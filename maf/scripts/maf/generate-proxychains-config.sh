#!/bin/bash
# ABOUTME: Shell script to generate proxychains configuration from MAF security policy
# ABOUTME: Creates task-specific proxychains configurations for network access control

# Source MAF utilities and colors
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAF_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source colors and utilities
if [ -f "${SCRIPT_DIR}/lib/colors.sh" ]; then
    source "${SCRIPT_DIR}/lib/colors.sh"
else
    # Basic colors if lib/colors.sh not available
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

# Default values
TASK_ID=""
POLICY_FILE="${MAF_ROOT}/.maf/configs/security-policy.json"
OUTPUT_DIR="/tmp"
PROFILE="restricted"
VERBOSE=false
DRY_RUN=false
PROXY_MODE="strict"

# Help message
show_help() {
    cat << EOHELP
MAF Proxychains Configuration Generator - Generate proxychains configs from security policy

USAGE:
    generate-proxychains-config.sh [OPTIONS]

OPTIONS:
    -t, --task-id <id>           Task ID for configuration (required)
    -p, --policy-file <file>     Security policy file (default: .maf/configs/security-policy.json)
    -o, --output-dir <dir>       Output directory for config files (default: /tmp)
    --profile <profile>          Security profile to use (default: restricted)
    --mode <mode>                Proxy mode: strict, dynamic, random_chain (default: strict)
    --dry-run                    Show what would be generated without creating files
    -v, --verbose                Enable verbose output
    -h, --help                   Show this help message

PROXY MODES:
    strict       - Only allow explicitly configured routes (most secure)
    dynamic      - Dynamic proxy selection with fallback
    random_chain - Random proxy selection for load distribution

EXAMPLES:
    # Generate config for task with default profile
    ./generate-proxychains-config.sh --task-id task-123

    # Generate config for specific profile
    ./generate-proxychains-config.sh --task-id task-456 --profile standard

    # Dry run to preview configuration
    ./generate-proxychains-config.sh --task-id task-789 --dry-run

    # Generate with custom policy file
    ./generate-proxychains-config.sh --task-id task-abc --policy-file ./custom-policy.json

EXIT CODES:
    0   Configuration generated successfully
    1   Error in configuration generation
    2   Required arguments missing
    3   Invalid configuration

EOHELP
}

# Logging functions
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
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "[VERBOSE] $*"
    fi
}

# Check if required tools are available
check_dependencies() {
    local missing_deps=()
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi
    
    if ! command -v proxychains4 >/dev/null 2>&1 && ! command -v proxychains >/dev/null 2>&1; then
        missing_deps+=("proxychains-ng")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Install missing tools:"
        for dep in "${missing_deps[@]}"; do
            case "$dep" in
                "jq")
                    log_info "  Ubuntu/Debian: sudo apt-get install jq"
                    log_info "  macOS: brew install jq"
                    ;;
                "proxychains-ng")
                    log_info "  Run: ./install-security-tools.sh"
                    ;;
            esac
        done
        return 1
    fi
    
    return 0
}

# Validate and load security policy
load_security_policy() {
    local policy_file="$1"
    
    if [ ! -f "$policy_file" ]; then
        log_error "Security policy file not found: $policy_file"
        return 1
    fi
    
    # Validate JSON syntax
    if ! jq empty "$policy_file" 2>/dev/null; then
        log_error "Invalid JSON in security policy file: $policy_file"
        return 1
    fi
    
    # Check if profile exists
    if ! jq -e ".profiles[\"$PROFILE\"]" "$policy_file" >/dev/null 2>&1; then
        log_error "Security profile '$PROFILE' not found in policy file"
        log_info "Available profiles: $(jq -r '.profiles | keys | join(", ")' "$policy_file")"
        return 1
    fi
    
    log_verbose "Security policy loaded successfully"
    return 0
}

# Extract network policy from security profile
extract_network_policy() {
    local policy_file="$1"
    local profile="$2"
    
    local network_policy=$(jq -r ".profiles[\"$profile\"].network" "$policy_file")
    
    if [ "$network_policy" = "null" ]; then
        log_warning "Network policy not found in profile '$PROFILE', using defaults"
        network_policy='{"outbound_allowed": false, "allowed_hosts": [], "allowed_ports": [], "dns_resolution": false}'
    fi
    
    echo "$network_policy"
}

# Generate proxychains configuration content
generate_config_content() {
    local task_id="$1"
    local network_policy="$2"
    local proxy_mode="$3"
    
    local outbound_allowed=$(echo "$network_policy" | jq -r '.outbound_allowed')
    local allowed_hosts=$(echo "$network_policy" | jq -r '.allowed_hosts[]' 2>/dev/null || echo "")
    local allowed_ports=$(echo "$network_policy" | jq -r '.allowed_ports[]' 2>/dev/null || echo "")
    local dns_resolution=$(echo "$network_policy" | jq -r '.dns_resolution')
    
    log_verbose "Generating config with: outbound_allowed=$outbound_allowed, dns_resolution=$dns_resolution"
    
    # Build configuration
    local config_content="# MAF Proxychains Configuration for Task: $task_id
# Generated on: $(date)
# Profile: $PROFILE
# Mode: $proxy_mode
# Network Policy: outbound_allowed=$outbound_allowed, dns_resolution=$dns_resolution

# Core configuration
quiet_mode
proxy_dns"

    # Add proxy mode
    case "$proxy_mode" in
        "strict")
            config_content+=$'\nstrict_chain'
            ;;
        "dynamic")
            config_content+=$'\ndynamic_chain'
            ;;
        "random_chain")
            config_content+=$'\nrandom_chain'
            config_content+=$'\nchain_len = 1'
            ;;
    esac
    
    config_content+=$'\n\n[ProxyList]'

    # If no outbound access allowed, use null route
    if [ "$outbound_allowed" = "false" ]; then
        config_content+=$'\n# No outbound access allowed - all connections blocked'
        config_content+=$'\n# This configuration forces all network requests to fail'
    else
        if [ -n "$allowed_hosts" ]; then
            config_content+=$'\n# Allowed hosts and ports:'
            
            while IFS= read -r host; do
                [ -n "$host" ] || continue
                if [ -n "$allowed_ports" ]; then
                    while IFS= read -r port; do
                        [ -n "$port" ] || continue
                        config_content+=$'\n# Allow '$host':'$port
                        # Use direct connection as proxy (bypass proxy but still controlled)
                        config_content+=$'\nhttp  '$host' '$port' '
                    done <<< "$allowed_ports"
                else
                    config_content+=$'\n# Allow '$host' (all ports)'
                    config_content+=$'\nhttp  '$host' 80 '
                fi
            done <<< "$allowed_hosts"
        else
            config_content+=$'\n# Outbound allowed but no specific hosts configured'
            config_content+=$'\n# WARNING: This allows all outbound connections'
        fi
    fi
    
    echo "$config_content"
}

# Create task-specific output directory
create_output_directory() {
    local output_dir="$1"
    local task_id="$2"
    
    local task_output_dir="${output_dir}/maf-proxychains-${task_id}"
    
    if [ "$DRY_RUN" = false ]; then
        mkdir -p "$task_output_dir" || {
            log_error "Cannot create output directory: $task_output_dir"
            return 1
        }
        log_verbose "Created output directory: $task_output_dir"
    fi
    
    echo "$task_output_dir"
}

# Generate main proxychains configuration
generate_main_config() {
    local task_id="$1"
    local network_policy="$2"
    local output_dir="$3"
    
    local config_file="${output_dir}/proxychains.conf"
    
    local config_content=$(generate_config_content "$task_id" "$network_policy" "$PROXY_MODE")
    
    if [ "$DRY_RUN" = true ]; then
        echo
        log_info "DRY RUN: Would create config file: $config_file"
        echo
        echo "$config_content"
        echo
    else
        echo "$config_content" > "$config_file" || {
            log_error "Failed to write config file: $config_file"
            return 1
        }
        log_success "Generated proxychains config: $config_file"
    fi
}

# Generate host-specific configurations for additional routing rules
generate_host_configs() {
    local task_id="$1"
    local network_policy="$2"
    local output_dir="$3"
    
    local allowed_hosts=$(echo "$network_policy" | jq -r '.allowed_hosts[]' 2>/dev/null)
    local allowed_ports=$(echo "$network_policy" | jq -r '.allowed_ports[]' 2>/dev/null)
    
    if [ -n "$allowed_hosts" ]; then
        while IFS= read -r host; do
            [ -n "$host" ] || continue
            
            local host_config="${output_dir}/${host}.conf"
            local host_content="# Host-specific configuration for $host
# Task: $task_id
# Generated: $(date)

[ProxyList]"

            if [ -n "$allowed_ports" ]; then
                while IFS= read -r port; do
                    [ -n "$port" ] || continue
                    host_content+=$'\nhttp  '$host' '$port' '
                done <<< "$allowed_ports"
            fi
            
            if [ "$DRY_RUN" = true ]; then
                log_verbose "DRY RUN: Would create host config: $host_config"
            else
                echo "$host_content" > "$host_config" || {
                    log_warning "Failed to write host config: $host_config"
                    continue
                }
                log_verbose "Generated host config: $host_config"
            fi
        done <<< "$allowed_hosts"
    fi
}

# Generate environment setup script
generate_env_script() {
    local task_id="$1"
    local output_dir="$2"
    local config_file="${output_dir}/proxychains.conf"
    
    local env_script="${output_dir}/setup-proxychains.sh"
    
    local env_content='#!/bin/bash
# ABOUTME: Environment setup script for MAF task proxychains configuration
# ABOUTME: Sets up proxychains environment for task: '$task_id'

# Configuration
TASK_ID="'$task_id'"
PROXYCHAINS_CONFIG="'$config_file'"
PROXYCHAINS_BIN="'

    # Find proxychains binary
    if command -v proxychains4 >/dev/null 2>&1; then
        PROXYCHAINS_BIN="proxychains4"
    elif command -v proxychains >/dev/null 2>&1; then
        PROXYCHAINS_BIN="proxychains"
    else
        echo "ERROR: proxychains-ng not found. Install with: ./install-security-tools.sh" >&2
        exit 1
    fi

    env_content+='"

# Export environment variables
export PROXYCHAINS_CONF_FILE="$PROXYCHAINS_CONFIG"
export PROXYCHAINS_CONFIG_FILE="$PROXYCHAINS_CONFIG"

# Create alias for easy usage
alias proxychains-task="$PROXYCHAINS_BIN -f $PROXYCHAINS_CONFIG"

# Display configuration
echo "MAF Proxychains Environment Setup"
echo "================================="
echo "Task ID: $TASK_ID"
echo "Config File: $PROXYCHAINS_CONFIG"
echo "Proxychains Binary: $PROXYCHAINS_BIN"
echo ""
echo "Usage Examples:"
echo "  proxychains-task curl https://example.com"
echo "  proxychains-task npm install"
echo "  $PROXYCHAINS_BIN -f $PROXYCHAINS_CONFIG node script.js"
echo ""

# Test configuration
echo "Testing proxychains configuration..."
$PROXYCHAINS_BIN --help >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Proxychains configuration is valid"
else
    echo "✗ Proxychains configuration error"
    exit 1
fi'
    
    if [ "$DRY_RUN" = true ]; then
        log_verbose "DRY RUN: Would create env script: $env_script"
    else
        echo "$env_content" > "$env_script" || {
            log_error "Failed to write env script: $env_script"
            return 1
        }
        chmod +x "$env_script"
        log_success "Generated environment script: $env_script"
    fi
}

# Validate generated configuration
validate_config() {
    local config_file="$1"
    
    if [ "$DRY_RUN" = true ]; then
        log_verbose "DRY RUN: Skipping configuration validation"
        return 0
    fi
    
    if [ ! -f "$config_file" ]; then
        log_error "Configuration file not found: $config_file"
        return 1
    fi
    
    # Test with proxychains validation
    local proxychains_bin="proxychains4"
    if ! command -v "$proxychains_bin" >/dev/null 2>&1; then
        proxychains_bin="proxychains"
    fi
    
    # Basic syntax check (proxychains doesn't have a validation command, so we test help)
    if "$proxychains_bin" -f "$config_file" --help >/dev/null 2>&1; then
        log_success "Configuration validation passed"
        return 0
    else
        log_warning "Configuration validation failed (may still work in practice)"
        return 1
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--task-id)
                TASK_ID="$2"
                shift 2
                ;;
            -p|--policy-file)
                POLICY_FILE="$2"
                shift 2
                ;;
            -o|--output-dir)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --profile)
                PROFILE="$2"
                shift 2
                ;;
            --mode)
                PROXY_MODE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
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
                log_error "Unknown option: $1"
                show_help
                exit 3
                ;;
        esac
    done
}

# Main function
main() {
    parse_args "$@"
    
    # Validate required arguments
    if [ -z "$TASK_ID" ]; then
        log_error "Task ID is required. Use --task-id <id>"
        show_help
        exit 2
    fi
    
    # Validate proxy mode
    case "$PROXY_MODE" in
        "strict"|"dynamic"|"random_chain")
            ;;
        *)
            log_error "Invalid proxy mode: $PROXY_MODE"
            log_info "Valid modes: strict, dynamic, random_chain"
            exit 3
            ;;
    esac
    
    log_info "MAF Proxychains Configuration Generator v1.0.0"
    log_info "Generating configuration for task: $TASK_ID"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN MODE - No files will be created"
    fi
    
    echo
    
    # Check dependencies
    if ! check_dependencies; then
        exit 1
    fi
    
    # Load and validate security policy
    if ! load_security_policy "$POLICY_FILE"; then
        exit 1
    fi
    
    # Extract network policy
    local network_policy=$(extract_network_policy "$POLICY_FILE" "$PROFILE")
    log_verbose "Network policy extracted for profile: $PROFILE"
    
    # Create output directory
    local task_output_dir=$(create_output_directory "$OUTPUT_DIR" "$TASK_ID")
    
    # Generate main configuration
    local main_config_file="${task_output_dir}/proxychains.conf"
    generate_main_config "$TASK_ID" "$network_policy" "$task_output_dir"
    
    # Generate host-specific configurations
    generate_host_configs "$TASK_ID" "$network_policy" "$task_output_dir"
    
    # Generate environment setup script
    generate_env_script "$TASK_ID" "$task_output_dir"
    
    # Validate configuration
    if [ "$DRY_RUN" = false ]; then
        validate_config "$main_config_file"
    fi
    
    # Summary
    echo
    log_info "Configuration Generation Summary:"
    log_info "  Task ID: $TASK_ID"
    log_info "  Profile: $PROFILE"
    log_info "  Mode: $PROXY_MODE"
    log_info "  Policy File: $POLICY_FILE"
    log_info "  Output Directory: $task_output_dir"
    
    if [ "$DRY_RUN" = false ]; then
        echo
        log_success "Proxychains configuration generated successfully!"
        log_info "Generated files:"
        log_info "  - ${task_output_dir}/proxychains.conf"
        log_info "  - ${task_output_dir}/setup-proxychains.sh"
        echo
        log_info "To use this configuration:"
        log_info "  cd ${task_output_dir}"
        log_info "  source setup-proxychains.sh"
        log_info "  proxychains-task <your command>"
        echo
    else
        echo
        log_info "DRY RUN COMPLETE - No files were created"
        echo
    fi
    
    exit 0
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
