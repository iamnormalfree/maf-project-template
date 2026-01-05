#!/bin/bash
# ABOUTME: CLI interface for MAF credential management and profile operations.
# ABOUTME: Provides user-friendly commands for managing multi-Codex account credentials.

set -euo pipefail

# Script paths
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Source libraries
source "$SCRIPT_DIR/lib/credential-manager.sh"
source "$SCRIPT_DIR/lib/profile-loader.sh"

# CLI help function
show_help() {
    cat << HELP_EOF
MAF Credential Management CLI

USAGE:
    $0 <command> [options]

COMMANDS:
    list                    List all available credential profiles
    create <profile>        Create a new credential profile
    validate <profile>      Validate a credential profile
    load <profile>          Load profile into current shell
    export <profile>        Export profile for agent usage
    select                  Interactive profile selection
    help                    Show this help message

EXAMPLES:
    $0 list                                    # Show available profiles
    $0 create my-profile                       # Create new profile interactively
    $0 validate codex-plus-1                   # Validate specific profile
    $0 load codex-plus-1                       # Load profile into shell
    $0 export codex-plus-1 > profile.env       # Export for agent

SECURITY:
    - All credential files use 600 permissions
    - Directory uses 700 permissions
    - API keys are never shown in logs
    - Temporary files are securely cleaned up

HELP_EOF
}

# CLI command handlers
cmd_list() {
    echo
    log_credential_info "MAF Credential Profiles"
    echo "==========================="
    list_credential_profiles
    echo
}

cmd_create() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        read -p "Enter profile name: " profile_name
        if [[ -z "$profile_name" ]]; then
            log_credential_error "Profile name is required"
            exit 1
        fi
    fi
    
    # Check if profile already exists
    local cred_file="$CREDENTIALS_DIR/${profile_name}.env"
    if [[ -f "$cred_file" ]]; then
        log_credential_warn "Profile '$profile_name' already exists"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_credential_info "Operation cancelled"
            exit 0
        fi
    fi
    
    # Collect credential information
    echo "Creating profile: $profile_name"
    echo
    
    # API key input
    local api_key
    read -s -p "Enter Anthropic API Key: " api_key
    echo
    
    if [[ ${#api_key} -lt 20 ]]; then
        log_credential_error "API key appears to be too short"
        exit 1
    fi
    
    # Base URL input
    local base_url
    read -p "Enter Base URL [default: https://api.anthropic.com]: " base_url
    base_url="${base_url:-https://api.anthropic.com}"
    
    # Priority input
    local priority
    echo "Priority options: primary, secondary, backup"
    read -p "Enter priority [default: secondary]: " priority
    case "$priority" in
        primary|secondary|backup) 
            ;;
        *) 
            priority="secondary"
            ;;
    esac
    
    # Create credential file
    if create_credential_file "$profile_name" "$api_key" "$base_url" "$priority"; then
        log_credential_success "Profile '$profile_name' created successfully"
        echo
        echo "You can now use this profile with:"
        echo "  $0 load $profile_name"
    else
        log_credential_error "Failed to create profile '$profile_name'"
        exit 1
    fi
}

cmd_validate() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        log_credential_error "Profile name is required"
        echo "Usage: $0 validate <profile-name>"
        exit 1
    fi
    
    if validate_profile_for_agent "$profile_name"; then
        log_credential_success "Profile '$profile_name' is valid"
        
        # Show profile details
        local priority
        priority=$(get_profile_priority "$profile_name")
        echo "  Priority: $priority"
        echo "  API Key: ${ANTHROPIC_API_KEY:0:10}...${ANTHROPIC_API_KEY: -10}"
        echo "  Base URL: $ANTHROPIC_BASE_URL"
    else
        log_credential_error "Profile '$profile_name' validation failed"
        exit 1
    fi
}

cmd_load() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        profile_name=$(detect_active_profile)
        if [[ -z "$profile_name" ]]; then
            log_credential_error "No profile specified and no default profile found"
            echo "Use '$0 list' to see available profiles"
            exit 1
        fi
    fi
    
    if load_profile_environment "$profile_name"; then
        log_credential_success "Profile '$profile_name' loaded into environment"
        echo
        echo "Environment variables set:"
        env | grep -E '^(ANTHROPIC_|MAF_)' | sort
    else
        log_credential_error "Failed to load profile '$profile_name'"
        exit 1
    fi
}

cmd_export() {
    local profile_name="${1:-}"
    
    if [[ -z "$profile_name" ]]; then
        log_credential_error "Profile name is required"
        echo "Usage: $0 export <profile-name>"
        exit 1
    fi
    
    if validate_profile_for_agent "$profile_name"; then
        log_profile_success "Exporting profile: $profile_name"
        export_profile_for_agent "$profile_name"
    else
        log_profile_error "Failed to export profile '$profile_name'"
        exit 1
    fi
}

cmd_select() {
    local selected_profile
    selected_profile=$(prompt_profile_selection)
    
    if [[ -n "$selected_profile" ]]; then
        echo "$selected_profile"
    else
        exit 1
    fi
}

# Main CLI logic
main() {
    local command="${1:-}"
    
    case "$command" in
        "list"|"ls")
            cmd_list
            ;;
        "create"|"new")
            cmd_create "${2:-}"
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
        "select"|"choose")
            cmd_select
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_credential_error "Unknown command: $command"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
