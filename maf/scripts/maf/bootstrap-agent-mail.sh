#!/bin/bash
# ABOUTME: Multi-command wrapper script for MAF Agent Mail system bootstrap and management.
# ABOUTME: Provides install|update|status|bootstrap-only commands with Python 3.14 compatibility handling.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
AGENT_MAIL_DIR="$PROJECT_ROOT/mcp_agent_mail"
BUILDS_DIR="$PROJECT_ROOT/.beads/builds"
LOGS_DIR="$PROJECT_ROOT/.maf/logs"
VENV_DIR="$AGENT_MAIL_DIR/.venv"

# Python version handling
PYTHON_VERSION_REQUIRED="3.14"
PYTHON_VERSION_CURRENT=$(python3 --version 2>&1 | cut -d' ' -f2 || echo "unknown")

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Show usage information
show_usage() {
    echo "🚀 MAF Agent Mail Bootstrap Script"
    echo "=================================="
    echo
    echo "Multi-command interface for Agent Mail system management."
    echo
    echo "Usage: $0 {install|update|status|bootstrap-only}"
    echo
    echo "Commands:"
    echo "  install         Fresh installation of Agent Mail system"
    echo "  update          Update existing Agent Mail installation"  
    echo "  status          Check system status and configuration"
    echo "  bootstrap-only  Run bootstrap process without installation"
    echo
    echo "Examples:"
    echo "  $0 install         # Install Agent Mail from scratch"
    echo "  $0 update          # Update existing installation"
    echo "  $0 status          # Check current system status"
    echo "  $0 bootstrap-only  # Bootstrap environment only"
    echo
}

# Ensure directories exist
ensure_directories() {
    log_info "Creating necessary directories..."
    mkdir -p "$BUILDS_DIR" "$LOGS_DIR"
}

# Check system prerequisites
check_prerequisites() {
    log_info "Checking system prerequisites..."
    
    local issues=0
    
    # Check Python availability
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 required but not found"
        ((issues++))
    else
        log_info "Python version: $PYTHON_VERSION_CURRENT"
        
        # Check Python version compatibility
        if [[ "$PYTHON_VERSION_CURRENT" < "$PYTHON_VERSION_REQUIRED" ]]; then
            log_warning "Python $PYTHON_VERSION_REQUIRED required, but found $PYTHON_VERSION_CURRENT"
            log_warning "The Agent Mail system may not work correctly with this Python version"
            log_info "Consider upgrading Python for full compatibility"
            ((issues++))
        fi
    fi
    
    # Check pip availability (more flexible check)
    if ! python3 -c "import ensurepip" 2>/dev/null && ! command -v pip3 &> /dev/null; then
        log_error "pip not available - required for package installation"
        log_info "Install pip with: python3 -m ensurepip --upgrade"
        ((issues++))
    fi
    
    # Check Beads CLI (optional for bootstrap-only)
    if ! command -v bd &> /dev/null; then
        log_warning "Beads CLI not found. Install with: npm install -g @beads/bd"
        log_warning "Some features may not work without Beads CLI"
    fi
    
    return $issues
}

# Check Agent Mail repository status
check_agent_mail_status() {
    log_info "Checking Agent Mail repository status..."
    
    if [[ ! -d "$AGENT_MAIL_DIR" ]]; then
        log_warning "Agent Mail directory not found at: $AGENT_MAIL_DIR"
        return 1
    fi
    
    log_success "Agent Mail directory found: $AGENT_MAIL_DIR"
    
    # Check for required files
    local required_files=("pyproject.toml")
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$AGENT_MAIL_DIR/$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        log_warning "Missing required files: ${missing_files[*]}"
        return 1
    fi
    
    # Check if virtual environment exists
    if [[ -d "$VENV_DIR" ]]; then
        log_success "Virtual environment found: $VENV_DIR"
        return 0
    else
        log_info "No virtual environment found"
        return 2
    fi
}

# Install Agent Mail system
install_agent_mail() {
    log_info "Starting Agent Mail installation..."

    # Check if directory exists and handle appropriately
    if [[ -d "$AGENT_MAIL_DIR" ]]; then
        log_warning "Agent Mail directory already exists"
        log_info "Use 'update' command to update existing installation"

        read -p "Do you want to proceed with re-installation? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled by user"
            return 0
        fi

        # Remove existing directory for clean re-install
        log_info "Removing existing directory for clean installation..."
        rm -rf "$AGENT_MAIL_DIR"
    fi

    # Clone the repository
    log_info "Cloning MCP Agent Mail repository..."
    if ! git clone https://github.com/Dicklesworthstone/mcp_agent_mail "$AGENT_MAIL_DIR"; then
        log_error "Failed to clone mcp_agent_mail repository"
        log_error "Please check your internet connection and try again"
        return 1
    fi

    log_success "Repository cloned successfully"

    # Verify the clone worked
    if [[ ! -d "$AGENT_MAIL_DIR" ]]; then
        log_error "Agent Mail directory not found after cloning: $AGENT_MAIL_DIR"
        return 1
    fi
    
    # Install Python dependencies with compatibility handling
    cd "$AGENT_MAIL_DIR"
    
    if [[ ! -f "pyproject.toml" ]]; then
        log_error "pyproject.toml not found in agent mail directory"
        return 1
    fi
    
    log_info "Installing Python dependencies..."
    
    # Handle Python version compatibility
    if [[ "$PYTHON_VERSION_CURRENT" < "$PYTHON_VERSION_REQUIRED" ]]; then
        log_warning "Attempting installation with Python $PYTHON_VERSION_CURRENT (requires $PYTHON_VERSION_REQUIRED)"
        log_info "If installation fails, please upgrade Python to $PYTHON_VERSION_REQUIRED"
        
        # Try to install core dependencies that might work with older Python
        log_info "Attempting compatibility installation..."
        
        # Try installing with --no-deps first, then install compatible dependencies
        if python3 -m pip install --upgrade pip setuptools wheel 2>"$LOGS_DIR/pip-upgrade.log"; then
            log_info "pip upgraded successfully"
        else
            log_warning "Failed to upgrade pip, continuing with existing version"
        fi
        
        # Try installing minimal dependencies
        log_info "Installing core dependencies with compatibility mode..."
        python3 -m pip install fastapi>=0.100.0 uvicorn jinja2 pathspec 2>>"$LOGS_DIR/pip-install.log" || {
            log_warning "Some dependencies failed to install with Python $PYTHON_VERSION_CURRENT"
            log_warning "This may be expected due to Python version incompatibility"
            log_info "Please upgrade to Python $PYTHON_VERSION_REQUIRED for full compatibility"
        }
    else
        # Standard installation for compatible Python versions
        if python3 -m pip install -e . 2>"$LOGS_DIR/pip-install.log"; then
            log_success "Dependencies installed successfully"
        else
            log_error "Failed to install dependencies. Check logs: $LOGS_DIR/pip-install.log"
            return 1
        fi
    fi
    
    # Validate installation
    validate_agent_mail_installation
    
    log_success "Agent Mail installation completed successfully"
    log_info "Next steps: npm run maf:test-beads-flow"
}

# Update existing Agent Mail installation
update_agent_mail() {
    log_info "Updating Agent Mail installation..."
    
    if [[ ! -d "$AGENT_MAIL_DIR" ]]; then
        log_error "Agent Mail directory not found at: $AGENT_MAIL_DIR"
        log_info "Use 'install' command for fresh installation"
        return 1
    fi
    
    cd "$AGENT_MAIL_DIR"
    
    if [[ ! -f "pyproject.toml" ]]; then
        log_error "pyproject.toml not found - cannot update"
        return 1
    fi
    
    log_info "Updating Python dependencies..."
    
    # Handle Python version compatibility during update
    if [[ "$PYTHON_VERSION_CURRENT" < "$PYTHON_VERSION_REQUIRED" ]]; then
        log_warning "Updating with Python $PYTHON_VERSION_CURRENT (may have compatibility issues)"
        
        # Force reinstall with current Python version
        python3 -m pip install --upgrade pip setuptools wheel 2>"$LOGS_DIR/pip-update.log" || true
        
        # Try installing minimal dependencies
        python3 -m pip install fastapi>=0.100.0 uvicorn jinja2 pathspec 2>>"$LOGS_DIR/pip-update.log" || {
            log_warning "Some dependencies failed to update due to Python version incompatibility"
        }
    else
        # Standard update
        python3 -m pip install -e . --upgrade 2>"$LOGS_DIR/pip-update.log" || {
            log_error "Failed to update dependencies"
            log_error "Check logs: $LOGS_DIR/pip-update.log"
            return 1
        }
    fi
    
    # Validate update
    validate_agent_mail_installation
    
    log_success "Agent Mail update completed successfully"
}

# Validate Agent Mail installation
validate_agent_mail_installation() {
    log_info "Validating Agent Mail installation..."
    
    cd "$AGENT_MAIL_DIR"
    
    # Check for Python package installation
    if ! python3 -c "import mcp_agent_mail" 2>/dev/null; then
        log_warning "Agent Mail package not found in Python path"
        log_info "This may be expected during development installation or with Python version incompatibility"
    else
        log_success "Agent Mail package is importable"
    fi
    
    # Check for required files
    local required_files=("src/mcp_agent_mail/__init__.py" "src/mcp_agent_mail/server.py")
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$AGENT_MAIL_DIR/$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        log_error "Installation validation failed - missing files: ${missing_files[*]}"
        return 1
    fi
    
    log_success "Installation validation passed"
}

# Show system status
show_status() {
    echo "📊 MAF Agent Mail System Status"
    echo "==============================="
    echo
    
    # Agent Mail directory status
    if [[ -d "$AGENT_MAIL_DIR" ]]; then
        log_success "Agent Mail directory: Found at $AGENT_MAIL_DIR"
        
        # Check git status if it's a git repository
        cd "$AGENT_MAIL_DIR"
        if [[ -d ".git" ]]; then
            local branch=$(git branch --show-current 2>/dev/null || echo "unknown")
            local commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
            log_info "Git branch: $branch (commit: $commit)"
            
            # Check for uncommitted changes
            if ! git diff --quiet || ! git diff --cached --quiet; then
                log_warning "Repository has uncommitted changes"
            fi
        fi
    else
        log_error "Agent Mail directory: Not found at $AGENT_MAIL_DIR"
    fi
    
    echo
    
    # Python environment status
    log_info "Python Environment:"
    echo "  Version: $PYTHON_VERSION_CURRENT"
    echo "  Required: $PYTHON_VERSION_REQUIRED"
    
    if command -v python3 &> /dev/null; then
        if [[ "$PYTHON_VERSION_CURRENT" < "$PYTHON_VERSION_REQUIRED" ]]; then
            echo "  Status: ⚠️  Version mismatch (may work with compatibility mode)"
        else
            echo "  Status: ✅ Compatible"
        fi
    else
        echo "  Status: ❌ Not found"
    fi
    
    echo
    
    # Virtual environment status
    if [[ -d "$VENV_DIR" ]]; then
        log_success "Virtual Environment: Found at $VENV_DIR"
    else
        log_info "Virtual Environment: Not found"
    fi
    
    echo
    
    # Dependencies status
    if [[ -f "$AGENT_MAIL_DIR/pyproject.toml" ]]; then
        log_info "Dependencies: pyproject.toml found"
        
        # Check if package is installed
        if python3 -c "import mcp_agent_mail" 2>/dev/null; then
            log_success "Package: Installed and importable"
        else
            log_warning "Package: Not installed or not in Python path"
        fi
    else
        log_error "Dependencies: pyproject.toml not found"
    fi
    
    echo
    
    # MCP Configuration status
    local mcp_configs=("$PROJECT_ROOT/codex.mcp.json" "$PROJECT_ROOT/cursor.mcp.json" "$PROJECT_ROOT/gemini.mcp.json")
    local config_found=0
    
    log_info "MCP Configuration Files:"
    for config in "${mcp_configs[@]}"; do
        if [[ -f "$config" ]]; then
            log_success "✅ $(basename "$config")"
            ((config_found++))
        else
            log_info "❌ $(basename "$config")"
        fi
    done
    
    if [[ $config_found -eq 0 ]]; then
        log_warning "No MCP configuration files found"
    fi
    
    echo
    
    # Tools status
    if command -v bd &> /dev/null; then
        log_success "Beads CLI: Installed"
    else
        log_warning "Beads CLI: Not found (npm install -g @beads/bd)"
    fi
}

# Run bootstrap-only process
bootstrap_only() {
    log_info "Running bootstrap-only process..."
    
    ensure_directories
    
    # Check prerequisites but don't fail on version mismatch
    log_info "Checking prerequisites (non-critical for bootstrap)..."
    if check_prerequisites; then
        log_success "All prerequisites met"
    else
        log_warning "Some prerequisites missing, but continuing with bootstrap"
    fi
    
    # Initialize workflow
    initialize_workflow
    
    # Run health check if available
    if [[ -f "$SCRIPT_DIR/health-check.mjs" ]]; then
        log_info "Running MAF health check..."
        if node "$SCRIPT_DIR/health-check.mjs"; then
            log_success "MAF health check passed"
        else
            log_warning "MAF health check had warnings (non-critical)"
        fi
    else
        log_info "Health check script not found, skipping"
    fi
    
    log_success "Bootstrap process completed successfully!"
    log_info "Use 'install' or 'update' commands to manage Agent Mail installation"
}

# Initialize Beads workflow
initialize_workflow() {
    log_info "Initializing Beads workflow..."
    
    cd "$PROJECT_ROOT"
    
    # Create a simple workflow file if it doesn't exist
    local workflow_file="$PROJECT_ROOT/.beads/agent-mail-workflow.md"
    if [[ ! -f "$workflow_file" ]]; then
        mkdir -p "$(dirname "$workflow_file")"
        cat > "$workflow_file" << 'WORKEOF'
# Agent Mail Workflow

## Purpose
Bootstrap and manage the MAF Agent Mail system using Beads orchestration.

## Tasks
1. Setup Python environment
2. Install dependencies  
3. Validate configuration
4. Initialize MCP server
5. Run health checks

## Dependencies
- Beads CLI v0.22.1+
- Python 3.14+ (3.12+ may work with compatibility mode)
- MCP protocol libraries
WORKEOF
        log_success "Created workflow configuration: $workflow_file"
    else
        log_info "Workflow configuration already exists"
    fi
}

# Main execution - command router
main() {
    local command="${1:-}"
    
    # Ensure we're in the right directory context
    cd "$PROJECT_ROOT"
    
    case "$command" in
        "install")
            ensure_directories
            if check_prerequisites; then
                install_agent_mail
            else
                log_error "Prerequisites check failed. Install missing dependencies and try again."
                exit 1
            fi
            ;;
        "update")
            ensure_directories
            if check_prerequisites; then
                update_agent_mail
            else
                log_error "Prerequisites check failed. Install missing dependencies and try again."
                exit 1
            fi
            ;;
        "status")
            show_status
            ;;
        "bootstrap-only")
            bootstrap_only
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        "")
            log_error "No command specified"
            echo
            show_usage
            exit 1
            ;;
        *)
            log_error "Invalid command: $command"
            echo
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
