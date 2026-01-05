#!/bin/bash
# ABOUTME: Interactive helper script to create Claude API profile files for MAF multi-account support.
# ABOUTME: Prompts for profile details and generates properly formatted credential files.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_DIR")/../.." && pwd)"
CREDENTIALS_DIR="$PROJECT_ROOT/.maf/credentials"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Initialize credentials directory
init_credentials_dir() {
    log_step "Initializing credentials directory..."

    if [[ ! -d "$CREDENTIALS_DIR" ]]; then
        mkdir -p "$CREDENTIALS_DIR"
        chmod 700 "$CREDENTIALS_DIR"
        log_success "Created credentials directory: $CREDENTIALS_DIR"
    else
        # Ensure proper permissions
        chmod 700 "$CREDENTIALS_DIR"
        log_info "Credentials directory exists: $CREDENTIALS_DIR"
    fi
}

# Prompt for user input with validation
prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local default_value="${3:-}"
    local validation_pattern="${4:-}"
    local required="${5:-true}"

    while true; do
        if [[ -n "$default_value" ]]; then
            read -p "$prompt [$default_value]: " input
            input="${input:-$default_value}"
        else
            read -p "$prompt: " input
        fi

        # Check if required and empty
        if [[ "$required" == "true" ]] && [[ -z "$input" ]]; then
            log_error "This field is required. Please enter a value."
            continue
        fi

        # Check validation pattern if provided
        if [[ -n "$validation_pattern" ]] && [[ -n "$input" ]]; then
            if [[ ! "$input" =~ $validation_pattern ]]; then
                log_error "Invalid format. Please try again."
                continue
            fi
        fi

        # Check if profile already exists (only for profile names)
        if [[ "$var_name" == "PROFILE_NAME" ]] && [[ -f "$CREDENTIALS_DIR/$input.env" ]]; then
            log_warning "Profile '$input' already exists."
            read -p "Overwrite? (y/N): " overwrite
            if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
                continue
            fi
        fi

        # Set the variable and break
        declare -g "$var_name"="$input"
        break
    done
}

# Create profile file
create_profile_file() {
    local profile_name="$1"
    local description="$2"
    local account_email="$3"
    local api_key="$4"
    local base_url="${5:-https://api.anthropic.com}"
    local priority="${6:-secondary}"

    local profile_file="$CREDENTIALS_DIR/$profile_name.env"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    log_step "Creating profile file: $profile_file"

    cat > "$profile_file" << EOF
# Profile: $description
# Description: $description
# Account: $account_email
# Created: $timestamp
# WARNING: This file contains sensitive API credentials

# API Credentials
export ANTHROPIC_API_KEY="$api_key"

# Claude API Configuration
export ANTHROPIC_BASE_URL="$base_url"
export MAF_PROFILE_NAME="$profile_name"
export MAF_PROFILE_PRIORITY="$priority"

# Profile identification for MAF
export CODEX_PROFILE="$profile_name"
EOF

    # Set secure permissions
    chmod 600 "$profile_file"

    log_success "Profile file created: $profile_file"
    log_info "File permissions set to 600 (owner read/write only)"
}

# Validate profile file
validate_profile_file() {
    local profile_name="$1"
    local profile_file="$CREDENTIALS_DIR/$profile_name.env"

    log_step "Validating profile file..."

    # Check file exists and is readable
    if [[ ! -f "$profile_file" ]]; then
        log_error "Profile file not found: $profile_file"
        return 1
    fi

    # Check file permissions
    local file_perms
    file_perms=$(stat -c "%a" "$profile_file" 2>/dev/null || stat -f "%A" "$profile_file" 2>/dev/null)
    if [[ "$file_perms" != "600" ]]; then
        log_warning "File permissions are $file_perms, should be 600. Fixing..."
        chmod 600 "$profile_file"
    fi

    # Check required environment variables
    local required_vars=("ANTHROPIC_API_KEY")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^export $var=" "$profile_file" 2>/dev/null; then
            log_error "Missing required variable: $var"
            return 1
        fi
    done

    # Validate API key format
    local api_key
    api_key=$(grep "^export ANTHROPIC_API_KEY=" "$profile_file" | cut -d'"' -f2)
    if [[ ! "$api_key" =~ ^sk-ant-api03- ]]; then
        log_warning "API key format appears unusual. Expected: sk-ant-api03-..."
    fi

    log_success "Profile file validation passed"
    return 0
}

# Show next steps
show_next_steps() {
    local profile_name="$1"

    echo
    log_success "Profile '$profile_name' created successfully!"
    echo
    echo "Next steps:"
    echo "1. Test your profile:"
    echo "   bash scripts/maf/lib/profile-loader.sh validate $profile_name"
    echo
    echo "2. List all profiles:"
    echo "   bash scripts/maf/lib/profile-loader.sh list"
    echo
    echo "3. Use with MAF:"
    echo "   npm run maf:spawn-agents -- --profile $profile_name"
    echo
    echo "4. Enable automatic rotation:"
    echo "   npm run maf:spawn-agents -- --force-rotation"
    echo
    echo "Documentation: .maf/credentials/README.md"
}

# Main function
main() {
    echo
    echo "=============================================="
    echo "    MAF Codex Profile Creation Helper"
    echo "=============================================="
    echo
    echo "This script helps you create Claude API profile files"
    echo "for multi-account support in MAF."
    echo

    # Initialize credentials directory
    init_credentials_dir

    # Collect profile information
    echo "Please provide the following information:"
    echo

    # Profile name
    prompt_input "Profile name (e.g., codex-primary, claude-work)" PROFILE_NAME "" "^[a-zA-Z0-9_-]+$" true

    # Description
    prompt_input "Profile description" DESCRIPTION "" "" true

    # Account email
    prompt_input "Associated account email" ACCOUNT_EMAIL "" "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$" true

    # API key
    echo
    log_info "Get your API key from: https://platform.openai.com/api-keys"
    prompt_input "Claude API key (sk-ant-api03-...)" API_KEY "" "^sk-ant-api03-.+" true

    # Base URL (with default)
    prompt_input "API base URL" BASE_URL "https://api.anthropic.com" "^https?://.+" false

    # Priority
    echo
    echo "Priority options:"
    echo "  primary   - Default profile when no profile specified"
    echo "  secondary - Alternative profile for specific use cases"
    echo "  backup    - Fallback profile for redundancy"
    echo
    while true; do
        prompt_input "Priority level (primary/secondary/backup)" PRIORITY "secondary" "^(primary|secondary|backup)$" true
        break
    done

    echo
    echo "Profile Summary:"
    echo "================"
    echo "Name:        $PROFILE_NAME"
    echo "Description: $DESCRIPTION"
    echo "Account:     $ACCOUNT_EMAIL"
    echo "API Key:     ${API_KEY:0:20}..."
    echo "Base URL:    $BASE_URL"
    echo "Priority:    $PRIORITY"
    echo

    read -p "Create this profile? (Y/n): " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        log_info "Profile creation cancelled."
        exit 0
    fi

    # Create the profile file
    create_profile_file "$PROFILE_NAME" "$DESCRIPTION" "$ACCOUNT_EMAIL" "$API_KEY" "$BASE_URL" "$PRIORITY"

    # Validate the created file
    if validate_profile_file "$PROFILE_NAME"; then
        show_next_steps "$PROFILE_NAME"
    else
        log_error "Profile validation failed. Please check the file manually."
        exit 1
    fi
}

# Show usage if --help or no arguments
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Interactive helper script to create Claude API profile files for MAF."
    echo
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo
    echo "This script will:"
    echo "  1. Prompt for profile details (name, description, API key, etc.)"
    echo "  2. Create a properly formatted .env file in .maf/credentials/"
    echo "  3. Set secure file permissions (600)"
    echo "  4. Validate the created profile file"
    echo
    echo "Example:"
    echo "  $0                                    # Interactive mode"
    echo
    echo "After creating a profile:"
    echo "  bash scripts/maf/lib/profile-loader.sh list"
    echo "  npm run maf:spawn-agents -- --profile <profile-name>"
    exit 0
fi

# Run main function
main "$@"