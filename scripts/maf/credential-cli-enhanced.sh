#!/bin/bash
# ABOUTME: Enhanced CLI interface for MAF credential management with .env and JSON support.

set -euo pipefail

# Script paths
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_DIR")/.." && pwd)"

# Credential paths
MAF_CREDENTIALS_DIR="$PROJECT_ROOT/.maf/credentials"
CODEX_DIR="$PROJECT_ROOT/.codex"
CODEX_PROFILES_DIR="$CODEX_DIR/profiles"

# Security constants
readonly REQUIRED_FILE_PERMS="600"
readonly REQUIRED_DIR_PERMS="700"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" >&2; }

show_help() {
    cat << HELP_EOF
MAF Enhanced Credential Management CLI

USAGE:
    $0 <command> [options]

COMMANDS:
    list                    List all available credential profiles
    create-env <profile>    Create a new .env credential profile
    validate <profile>      Validate a credential profile
    load <profile>          Load profile into current shell
    export <profile>        Export profile for agent usage
    help                    Show this help message

HELP_EOF
}

validate_env_credentials() {
    local profile_name="$1"
    local cred_file="$MAF_CREDENTIALS_DIR/${profile_name}.env"
    
    if [[ ! -f "$cred_file" ]]; then
        return 1
    fi
    
    # Check required variables
    local required_vars=("ANTHROPIC_API_KEY" "MAF_PROFILE_NAME")
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^export $var=" "$cred_file"; then
            return 1
        fi
    done
    
    # Validate API key format (basic check)
    local api_key
    api_key=$(grep "^export ANTHROPIC_API_KEY=" "$cred_file" | cut -d'"' -f2)
    
    if [[ ${#api_key} -lt 20 ]]; then
        return 1
    fi
    
    return 0
}

cmd_create_env() {
    local profile_name="${1:-}"
    local api_key="${2:-}"
    local base_url="${3:-https://api.anthropic.com}"
    local priority="${4:-secondary}"
    
    if [[ -z "$profile_name" ]]; then
        read -p "Enter profile name: " profile_name
        if [[ -z "$profile_name" ]]; then
            log_error "Profile name is required"
            exit 1
        fi
    fi
    
    if [[ -z "$api_key" ]]; then
        read -s -p "Enter Anthropic API Key: " api_key
        echo
        if [[ ${#api_key} -lt 20 ]]; then
            log_error "API key appears to be too short"
            exit 1
        fi
    fi
    
    # Create directory if it doesn't exist
    mkdir -p "$MAF_CREDENTIALS_DIR"
    chmod 700 "$MAF_CREDENTIALS_DIR"
    
    local cred_file="$MAF_CREDENTIALS_DIR/${profile_name}.env"
    
    if [[ -f "$cred_file" ]]; then
        log_warn "Credential file already exists: $cred_file"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Operation cancelled"
            exit 0
        fi
    fi
    
    # Create credential file with secure permissions
    umask 077
    cat > "$cred_file" << CRED_EOF
# MAF Credential Profile: $profile_name
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# WARNING: This file contains sensitive API credentials

export ANTHROPIC_API_KEY="$api_key"
export ANTHROPIC_BASE_URL="$base_url"
export MAF_PROFILE_NAME="$profile_name"
export MAF_PROFILE_PRIORITY="$priority"
CRED_EOF
    
    chmod 600 "$cred_file"
    
    if validate_env_credentials "$profile_name"; then
        log_success "Created credential file: $cred_file"
        echo "You can now use this profile with: $0 load $profile_name"
    else
        rm -f "$cred_file"
        log_error "Failed to create secure credential file"
        exit 1
    fi
}

cmd_list() {
    echo
    log_info "MAF Credential Profiles"
    echo "==========================="
    
    local profiles_found=false
    
    # Check .env profiles
    if [[ -d "$MAF_CREDENTIALS_DIR" ]]; then
        local env_profiles=()
        for file in "$MAF_CREDENTIALS_DIR"/*.env; do
            if [[ -f "$file" ]] && [[ ! "$file" =~ example ]]; then
                local profile_name
                profile_name=$(basename "$file" .env)
                if validate_env_credentials "$profile_name" >/dev/null 2>&1; then
                    env_profiles+=("$profile_name")
                fi
            fi
        done
        
        if [[ ${#env_profiles[@]} -gt 0 ]]; then
            echo
            echo "Environment File Profiles (.env):"
            for profile in "${env_profiles[@]}"; do
                local priority
                priority=$(grep "^export MAF_PROFILE_PRIORITY=" "$MAF_CREDENTIALS_DIR/${profile}.env" | cut -d'"' -f2 || echo "secondary")
                echo "  - $profile ($priority) [.env]"
            done
            profiles_found=true
        fi
    fi
    
    if [[ "$profiles_found" == "false" ]]; then
        log_warn "No credential profiles found"
        echo "Use '$0 create-env <profile>' to create a new .env profile"
        exit 1
    fi
    
    echo
}

cmd_validate() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        log_error "Profile name is required"
        echo "Usage: $0 validate <profile-name>"
        exit 1
    fi
    
    # Try .env validation
    if validate_env_credentials "$profile_name"; then
        log_success "Profile '$profile_name' (.env format) is valid"
        
        local priority
        priority=$(grep "^export MAF_PROFILE_PRIORITY=" "$MAF_CREDENTIALS_DIR/${profile_name}.env" | cut -d'"' -f2 || echo "secondary")
        local api_key
        api_key=$(grep "^export ANTHROPIC_API_KEY=" "$MAF_CREDENTIALS_DIR/${profile_name}.env" | cut -d'"' -f2)
        local base_url
        base_url=$(grep "^export ANTHROPIC_BASE_URL=" "$MAF_CREDENTIALS_DIR/${profile_name}.env" | cut -d'"' -f2)
        
        echo "  Priority: $priority"
        echo "  API Key: ...${api_key: -10}"
        echo "  Base URL: $base_url"
    else
        log_error "Profile '$profile_name' validation failed"
        exit 1
    fi
}

cmd_load() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        log_error "Profile name is required"
        echo "Usage: $0 load <profile-name>"
        exit 1
    fi
    
    if [[ -f "$MAF_CREDENTIALS_DIR/${profile_name}.env" ]]; then
        if validate_env_credentials "$profile_name"; then
            # Output the .env file content for sourcing
            cat "$MAF_CREDENTIALS_DIR/${profile_name}.env"
            return 0
        fi
    fi
    
    log_error "Profile not found: $profile_name"
    exit 1
}

cmd_export() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        log_error "Profile name is required"
        echo "Usage: $0 export <profile-name>"
        exit 1
    fi
    
    if [[ -f "$MAF_CREDENTIALS_DIR/${profile_name}.env" ]]; then
        if validate_env_credentials "$profile_name"; then
            grep "^export " "$MAF_CREDENTIALS_DIR/${profile_name}.env"
            return 0
        fi
    fi
    
    log_error "Profile not found: $profile_name"
    exit 1
}

main() {
    local command="${1:-}"
    
    case "$command" in
        "list"|"ls")
            cmd_list
            ;;
        "create-env"|"new")
            cmd_create_env "${2:-}" "${3:-}" "${4:-}" "${5:-}"
            ;;
        "validate"|"check")
            cmd_validate "${2:-}"
            ;;
        "load"|"use")
            cmd_load "${2:-}"
            ;;
        "export")
            cmd_export "${2:-}"
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo
            show_help
            exit 1
            ;;
    esac
}

main "$@"
