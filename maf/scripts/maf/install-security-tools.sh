#!/bin/bash
# ABOUTME: Shell script to install MAF security isolation tools (proxychains-ng, bubblewrap, cgroups)
# ABOUTME: Cross-platform installation with verification and graceful degradation

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
VERBOSE=false
FORCE_INSTALL=false
SKIP_VERIFICATION=false
PLATFORM="auto"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="${MAF_ROOT}/.maf/configs"

# Help message
show_help() {
    cat << EOHELP
MAF Security Tools Installer - Install security isolation tools

USAGE:
    install-security-tools.sh [OPTIONS]

OPTIONS:
    -v, --verbose               Enable verbose output
    -f, --force                 Force installation even if tools already exist
    --skip-verification         Skip post-installation verification
    -p, --platform <platform>   Platform: auto, ubuntu, debian, macos (default: auto)
    -d, --install-dir <dir>     Installation directory (default: /usr/local/bin)
    -c, --config-dir <dir>      MAF configuration directory (default: .maf/configs)
    -h, --help                  Show this help message

TOOLS TO INSTALL:
    proxychains-ng   - Network proxy forcing for DNS filtering and access control
    bubblewrap       - Filesystem sandboxing with namespace isolation  
    cgroups         - Resource limiting (CPU, memory, process count) [Linux only]

PLATFORM SUPPORT:
    Ubuntu/Debian  - Full support (all tools)
    macOS          - Network and filesystem tools (cgroups not available)
    Other Linux    - Best effort with package manager detection

EXIT CODES:
    0   All tools installed successfully
    1   One or more tools failed to install
    2   System requirements not met
    3   Invalid arguments provided

EXAMPLES:
    # Auto-detect platform and install all tools
    ./install-security-tools.sh

    # Install on specific platform with verbose output
    ./install-security-tools.sh --platform ubuntu --verbose

    # Force reinstall and skip verification
    ./install-security-tools.sh --force --skip-verification

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

# Platform detection
detect_platform() {
    if [ "$PLATFORM" != "auto" ]; then
        log_verbose "Using specified platform: $PLATFORM"
        return 0
    fi

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            case "$ID" in
                ubuntu)
                    PLATFORM="ubuntu"
                    ;;
                debian)
                    PLATFORM="debian" 
                    ;;
                centos|rhel|fedora)
                    PLATFORM="redhat"
                    ;;
                *)
                    PLATFORM="linux"
                    ;;
            esac
        else
            PLATFORM="linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="macos"
    else
        PLATFORM="unknown"
    fi
    
    log_verbose "Detected platform: $PLATFORM"
}

# Check if running as root for system installations
check_root_requirements() {
    local needs_root=false
    
    # Check if we can write to installation directory
    if [ ! -w "$(dirname "$INSTALL_DIR")" ]; then
        needs_root=true
    fi
    
    # Ubuntu/Debian package installation requires root
    if [[ "$PLATFORM" == "ubuntu" || "$PLATFORM" == "debian" ]] && [ "$EUID" -ne 0 ]; then
        needs_root=true
    fi
    
    if [ "$needs_root" = true ]; then
        log_warning "Root privileges required for installation"
        log_info "Try running with sudo: sudo $0 $*"
        return 1
    fi
    
    return 0
}

# Check if tool is already installed
is_tool_installed() {
    local tool="$1"
    
    case "$tool" in
        "proxychains-ng")
            command -v proxychains4 >/dev/null 2>&1 || command -v proxychains >/dev/null 2>&1
            ;;
        "bubblewrap")
            command -v bwrap >/dev/null 2>&1
            ;;
        "cgroups")
            # cgroups is a kernel feature, check if available
            [ -d /sys/fs/cgroup ] && [ -r /sys/fs/cgroup ]
            ;;
        *)
            command -v "$tool" >/dev/null 2>&1
            ;;
    esac
}

# Get tool version
get_tool_version() {
    local tool="$1"
    
    case "$tool" in
        "proxychains-ng")
            if command -v proxychains4 >/dev/null 2>&1; then
                proxychains4 --version 2>/dev/null | head -n1 || echo "unknown"
            elif command -v proxychains >/dev/null 2>&1; then
                proxychains --version 2>/dev/null | head -n1 || echo "unknown"
            fi
            ;;
        "bubblewrap")
            bwrap --version 2>/dev/null | head -n1 || echo "unknown"
            ;;
        "cgroups")
            echo "kernel feature"
            ;;
        *)
            "$tool" --version 2>/dev/null | head -n1 || echo "unknown"
            ;;
    esac
}

# Install proxychains-ng
install_proxychains() {
    log_info "Installing proxychains-ng..."
    
    case "$PLATFORM" in
        "ubuntu"|"debian")
            apt-get update >/dev/null 2>&1
            apt-get install -y proxychains4 >/dev/null 2>&1
            ;;
        "macos")
            if command -v brew >/dev/null 2>&1; then
                brew install proxychains-ng >/dev/null 2>&1
            else
                log_error "Homebrew not found. Please install Homebrew first."
                return 1
            fi
            ;;
        "redhat")
            if command -v yum >/dev/null 2>&1; then
                yum install -y proxychains-ng >/dev/null 2>&1
            elif command -v dnf >/dev/null 2>&1; then
                dnf install -y proxychains-ng >/dev/null 2>&1
            else
                log_error "No supported package manager found for proxychains-ng"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported platform for proxychains-ng installation"
            return 1
            ;;
    esac
    
    # Verify installation
    if is_tool_installed "proxychains-ng"; then
        local version=$(get_tool_version "proxychains-ng")
        log_success "proxychains-ng installed: $version"
        return 0
    else
        log_error "proxychains-ng installation failed"
        return 1
    fi
}

# Install bubblewrap
install_bubblewrap() {
    log_info "Installing bubblewrap..."
    
    case "$PLATFORM" in
        "ubuntu"|"debian")
            apt-get update >/dev/null 2>&1
            apt-get install -y bubblewrap >/dev/null 2>&1
            ;;
        "macos")
            if command -v brew >/dev/null 2>&1; then
                brew install bubblewrap >/dev/null 2>&1
            else
                log_error "Homebrew not found. Please install Homebrew first."
                return 1
            fi
            ;;
        "redhat")
            if command -v yum >/dev/null 2>&1; then
                yum install -y bubblewrap >/dev/null 2>&1
            elif command -v dnf >/dev/null 2>&1; then
                dnf install -y bubblewrap >/dev/null 2>&1
            else
                log_error "No supported package manager found for bubblewrap"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported platform for bubblewrap installation"
            return 1
            ;;
    esac
    
    # Verify installation
    if is_tool_installed "bubblewrap"; then
        local version=$(get_tool_version "bubblewrap")
        log_success "bubblewrap installed: $version"
        return 0
    else
        log_error "bubblewrap installation failed"
        return 1
    fi
}

# Setup cgroups (Linux only - kernel feature, no installation needed)
setup_cgroups() {
    if [[ "$PLATFORM" != "ubuntu" && "$PLATFORM" != "debian" && "$PLATFORM" != "linux" && "$PLATFORM" != "redhat" ]]; then
        log_warning "cgroups not supported on $PLATFORM"
        return 0
    fi
    
    log_info "Setting up cgroups configuration..."
    
    # Check if cgroups is available
    if ! is_tool_installed "cgroups"; then
        log_error "cgroups not available on this system"
        return 1
    fi
    
    # Create MAF cgroups configuration directory
    local maf_cgroup_dir="/sys/fs/cgroup/maf"
    
    # Try to create MAF cgroup directory (may fail without proper permissions)
    if [ -w /sys/fs/cgroup ]; then
        mkdir -p "$maf_cgroup_dir" 2>/dev/null || {
            log_warning "Cannot create MAF cgroup directory (requires root or systemd)"
            log_info "cgroups will be available but MAF-specific limits require setup"
        }
    fi
    
    log_success "cgroups available: kernel feature"
    return 0
}

# Create MAF security configuration directory
setup_maf_config() {
    log_info "Setting up MAF security configuration..."
    
    mkdir -p "$CONFIG_DIR"
    
    # Create basic security policy structure if not exists
    if [ ! -f "$CONFIG_DIR/security-policy.json" ]; then
        cat > "$CONFIG_DIR/security-policy.json" << 'POLICYEOF'
{
  "default_profile": "restricted",
  "profiles": {
    "restricted": {
      "network": {
        "outbound_allowed": false,
        "allowed_hosts": [],
        "allowed_ports": [],
        "dns_resolution": false
      },
      "filesystem": {
        "read_allowed": [],
        "write_allowed": [],
        "exec_allowed": [],
        "temp_dir": "/tmp/maf-${task_id}"
      },
      "resources": {
        "max_memory_mb": 512,
        "max_cpu_percent": 50,
        "max_execution_time_sec": 300,
        "max_processes": 10
      },
      "tools": {
        "allowed_commands": ["node", "npm", "git"],
        "blocked_patterns": ["rm -rf /", "sudo", "chmod 777"],
        "shell_access": false,
        "environment_variables": {
          "allowed": ["NODE_ENV", "PATH"],
          "blocked": ["PASSWORD", "TOKEN", "SECRET"]
        }
      }
    }
  }
}
POLICYEOF
        log_success "Created default security policy configuration"
    fi
    
    return 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -f|--force)
                FORCE_INSTALL=true
                shift
                ;;
            --skip-verification)
                SKIP_VERIFICATION=true
                shift
                ;;
            -p|--platform)
                PLATFORM="$2"
                shift 2
                ;;
            -d|--install-dir)
                INSTALL_DIR="$2"
                shift 2
                ;;
            -c|--config-dir)
                CONFIG_DIR="$2"
                shift 2
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

# Main installation function
main() {
    parse_args "$@"
    
    log_info "MAF Security Tools Installer v1.0.0"
    log_info "Platform detection and tool installation..."
    echo
    
    # Detect platform
    detect_platform
    if [ "$PLATFORM" = "unknown" ]; then
        log_error "Unsupported platform: $OSTYPE"
        exit 2
    fi
    
    # Check root requirements for system packages
    if ! check_root_requirements; then
        exit 2
    fi
    
    # Setup MAF configuration
    setup_maf_config
    
    local failed=0
    local tools_installed=0
    
    # Install tools with force handling
    log_info "Installing security tools for platform: $PLATFORM"
    echo
    
    # proxychains-ng
    if [ "$FORCE_INSTALL" = true ] || ! is_tool_installed "proxychains-ng"; then
        if install_proxychains; then
            ((tools_installed++))
        else
            ((failed++))
        fi
    else
        log_info "proxychains-ng already installed: $(get_tool_version 'proxychains-ng')"
    fi
    
    # bubblewrap
    if [ "$FORCE_INSTALL" = true ] || ! is_tool_installed "bubblewrap"; then
        if install_bubblewrap; then
            ((tools_installed++))
        else
            ((failed++))
        fi
    else
        log_info "bubblewrap already installed: $(get_tool_version 'bubblewrap')"
    fi
    
    # cgroups (Linux only)
    if [[ "$PLATFORM" != "macos" ]]; then
        if [ "$FORCE_INSTALL" = true ] || ! is_tool_installed "cgroups"; then
            if setup_cgroups; then
                ((tools_installed++))
            else
                ((failed++))
            fi
        else
            log_info "cgroups already available: kernel feature"
        fi
    fi
    
    # Summary
    echo
    log_info "Installation Summary:"
    log_info "  Tools installed: $tools_installed"
    log_info "  Failures: $failed"
    log_info "  Platform: $PLATFORM"
    log_info "  Config directory: $CONFIG_DIR"
    
    if [ $failed -eq 0 ]; then
        echo
        log_success "All security tools installed successfully!"
        log_info "Next steps:"
        log_info "  1. Run: ./scripts/maf/generate-proxychains-config.sh"
        log_info "  2. Run: ./scripts/maf/setup-cgroups.sh"
        log_info "  3. Run: ./scripts/maf/verify-security-tools.sh"
        echo
        exit 0
    else
        echo
        log_error "Installation completed with $failed failures"
        log_info "Check the logs above for specific error details"
        echo
        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
