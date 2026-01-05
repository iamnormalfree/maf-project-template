#!/bin/bash
# ABOUTME: Codex profile loading and management utilities for MAF multi-Codex account support.
# ABOUTME: Provides shell-based credential loading, profile selection, and environment isolation.

set -euo pipefail

# Script directory and project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Detect subtree layout and adjust PROJECT_ROOT accordingly
if [[ "$SCRIPT_DIR" == *"/maf/scripts/maf/lib" ]]; then
    # Subtree layout: maf/scripts/maf/lib/ -> go up 4 levels
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
else
    # Direct layout: scripts/maf/lib/ -> go up 3 levels
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# Profile storage paths - Updated to use .maf/credentials for consistency
CREDENTIALS_DIR="$PROJECT_ROOT/.maf/credentials"
CODEX_DIR="$PROJECT_ROOT/.codex"
PROFILES_DIR="$CREDENTIALS_DIR"  # Primary location for profile files
ACTIVE_PROFILE_FILE="$CODEX_DIR/.active-profile"
PROFILE_STATE_DIR="$CODEX_DIR/.state"

# Colors for output
source "$SCRIPT_DIR/colors.sh" 2>/dev/null || {
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    NC='\033[0m'
}

# Logging functions
log_profile_info() {
    echo -e "${CYAN}[PROFILE]${NC} $1"
}

log_profile_success() {
    echo -e "${GREEN}[PROFILE]${NC} $1"
}

log_profile_warning() {
    echo -e "${YELLOW}[PROFILE]${NC} $1"
}

log_profile_error() {
    echo -e "${RED}[PROFILE]${NC} $1"
}

log_profile_debug() {
    if [[ "${DEBUG_MODE:-false}" == "true" ]]; then
        echo -e "${MAGENTA}[PROFILE-DEBUG]${NC} $1"
    fi
}

# Initialize profile system
initialize_profile_system() {
    log_profile_debug "Initializing profile system"
    
    # Create necessary directories
    mkdir -p "$PROFILES_DIR" "$PROFILE_STATE_DIR"
    
    # Create .codex directory if it doesn't exist
    if [[ ! -d "$CODEX_DIR" ]]; then
        mkdir -p "$CODEX_DIR"
        log_profile_info "Created Codex directory: $CODEX_DIR"
    fi
    
    return 0
}

# List available Codex profiles - Updated to look for .env files
list_profiles() {
    if [[ ! -d "$PROFILES_DIR" ]]; then
        log_profile_warning "No credentials directory found at $PROFILES_DIR"
        echo "  Run: bash scripts/maf/lib/credential-manager.sh init"
        return 1
    fi

    local profiles=()
    for profile_file in "$PROFILES_DIR"/*.env; do
        if [[ -f "$profile_file" ]]; then
            local profile_name
            profile_name=$(basename "$profile_file" .env)
            profiles+=("$profile_name")
        fi
    done

    if [[ ${#profiles[@]} -eq 0 ]]; then
        log_profile_warning "No Codex profiles found in $PROFILES_DIR"
        echo "  Profile files should be named: profile-name.env"
        return 1
    fi

    echo "Available Codex Profiles:"
    echo "========================"

    for profile in "${profiles[@]}"; do
        local profile_file="$PROFILES_DIR/$profile.env"
        local status="active"

        # Check if profile has required environment variables
        if ! grep -q "ANTHROPIC_API_KEY=" "$profile_file" 2>/dev/null; then
            status="incomplete"
        fi

        # Get profile description from file
        local display_name
        display_name=$(grep "^# Profile:" "$profile_file" 2>/dev/null | cut -d: -f2- | xargs || echo "$profile")

        echo "  - $profile ($display_name) [$status]"
    done

    return 0
}

# Validate profile exists and is properly configured - Updated for .env files
validate_profile() {
    local profile_name="$1"

    local profile_file="$PROFILES_DIR/$profile_name.env"

    if [[ ! -f "$profile_file" ]]; then
        log_profile_error "Profile file not found: $profile_file"
        return 1
    fi

    # Check file permissions (should be 600)
    local file_perms
    file_perms=$(stat -c "%a" "$profile_file" 2>/dev/null || stat -f "%A" "$profile_file" 2>/dev/null)
    if [[ "$file_perms" != "600" ]]; then
        log_profile_warning "Profile file permissions should be 600, currently: $file_perms"
        log_profile_info "Fix with: chmod 600 \"$profile_file\""
    fi

    # Validate required environment variables
    local required_vars=("ANTHROPIC_API_KEY")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^export $var=" "$profile_file" 2>/dev/null && ! grep -q "^$var=" "$profile_file" 2>/dev/null; then
            log_profile_error "Missing required variable '$var' in profile: $profile_file"
            return 1
        fi
    done

    log_profile_debug "Profile validation successful: $profile_name"
    return 0
}

# Select profile using round-robin with fallback priority
select_profile_for_agent() {
    local agent_type="$1"
    local agent_config="$2"
    local session_name="$3"
    local force_profile="${4:-}"
    
    # If force profile is specified, use it
    if [[ -n "$force_profile" ]]; then
        if validate_profile "$force_profile"; then
            log_profile_info "Using forced profile: $force_profile"
            echo "$force_profile"
            return 0
        else
            log_profile_error "Forced profile is invalid: $force_profile"
            return 1
        fi
    fi
    
    # Get profile selection strategy from agent config
    local profiles_array
    profiles_array=$(echo "$agent_config" | jq -r '.codex_profiles // empty')
    
    if [[ -z "$profiles_array" ]] || [[ "$profiles_array" == "null" ]]; then
        # If no strategy configured, check if there's exactly one profile available
        local available_profiles=()
        for profile_file in "$PROFILES_DIR"/*.env; do
            if [[ -f "$profile_file" ]]; then
                local profile_name
                profile_name=$(basename "$profile_file" .env)
                if validate_profile "$profile_name"; then
                    available_profiles+=("$profile_name")
                fi
            fi
        done
        
        if [[ ${#available_profiles[@]} -eq 1 ]]; then
            log_profile_info "Auto-selecting single available profile: ${available_profiles[0]}"
            echo "${available_profiles[0]}"
            return 0
        elif [[ ${#available_profiles[@]} -gt 1 ]]; then
            log_profile_warning "Multiple profiles available but no selection strategy configured"
            return 1
        else
            log_profile_warning "No valid profiles found"
            return 1
        fi
    fi
    
    # Parse profiles array and select one (simplified for now)
    local profile_name
    profile_name=$(echo "$profiles_array" | jq -r '.[0].name // empty')
    
    if [[ -n "$profile_name" ]] && validate_profile "$profile_name"; then
        echo "$profile_name"
        return 0
    else
        log_profile_error "No valid profiles found in agent configuration"
        return 1
    fi
}

# Load profile environment variables - Updated to source .env files
load_profile_environment() {
    local profile_name="$1"
    local target_session="$2"
    local agent_id="$3"

    if ! validate_profile "$profile_name"; then
        log_profile_error "Cannot load invalid profile: $profile_name"
        return 1
    fi

    local profile_file="$PROFILES_DIR/$profile_name.env"

    # Create environment loading script that sources the profile file
    local env_script="$PROFILE_STATE_DIR/${agent_id}_env.sh"
    cat > "$env_script" << ENVEOF
#!/bin/bash
# Generated profile environment for agent: $agent_id
# Profile: $profile_name
# Session: $target_session

# Load profile credentials and configuration
if [[ -f "$profile_file" ]]; then
    source "$profile_file"
    echo "Profile loaded: $profile_name"
else
    echo "Error: Profile file not found: $profile_file"
    return 1
fi

# Codex profile identification
export CODEX_PROFILE="$profile_name"
export MAF_CODEX_PROFILE="$profile_name"
export MAF_AGENT_PROFILE_LOADED="true"
export MAF_PROFILE_FILE_PATH="$profile_file"
ENVEOF

    chmod +x "$env_script"

    log_profile_success "Profile environment script created: $env_script"
    echo "$env_script"
    return 0
}

# Check profile health and rate limit status
check_profile_health() {
    local profile_name="$1"
    
    if ! validate_profile "$profile_name"; then
        return 1
    fi
    
    log_profile_info "Health check completed for profile: $profile_name"
    return 0
}

# Main execution - only run when called directly, not when sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        "init")
            initialize_profile_system
            ;;
        "list")
            list_profiles
            ;;
        "validate")
            validate_profile "$2"
            ;;
        "select")
            select_profile_for_agent "$2" "$3" "$4" "${5:-}"
            ;;
        "load")
            load_profile_environment "$2" "$3" "$4"
            ;;
        "health")
            check_profile_health "$2"
            ;;
        *)
            echo "Usage: $0 {init|list|validate|select|load|health} [args...]"
            exit 1
            ;;
    esac
fi
