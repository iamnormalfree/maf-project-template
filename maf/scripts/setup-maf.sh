#!/bin/bash
# ABOUTME: Automated MAF setup script for new projects.
# ABOUTME: Checks for environment variables, creates config, initializes Agent Mail.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Detect project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# For subtree layout (maf/scripts/), go up two levels to reach project root
# For direct layout (scripts/), go up one level to reach project root
if [[ "$SCRIPT_DIR" == *"/maf/scripts" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

MAF_DIR="$PROJECT_ROOT/maf"
CREDENTIALS_DIR="$PROJECT_ROOT/.maf/credentials"
CONFIG_DIR="$PROJECT_ROOT/.maf/config"

log_info "MAF Setup Script"
log_info "================"
log_info "Project root: ${BOLD}$PROJECT_ROOT${NC}"
echo ""

# Check if MAF directory exists
if [[ ! -d "$MAF_DIR" ]]; then
    log_error "MAF directory not found at: $MAF_DIR"
    log_error "Please run this script from a project with MAF installed as a subtree."
    exit 1
fi

# Step 1: Create directory structure
log_step "1/7 Creating directory structure..."
mkdir -p "$CREDENTIALS_DIR"
mkdir -p "$CONFIG_DIR"
log_success "Directories created"
echo ""

# Step 2: Setup agent topology
log_step "2/7 Setting up agent topology..."
if [[ ! -f "$CONFIG_DIR/agent-topology.json" ]]; then
    if [[ -f "$MAF_DIR/.maf/config/agent-topology.json.example" ]]; then
        cp "$MAF_DIR/.maf/config/agent-topology.json.example" "$CONFIG_DIR/agent-topology.json"
        log_success "Agent topology config created: $CONFIG_DIR/agent-topology.json"
        log_info "Edit this file to customize your agent team"
    else
        log_warning "Agent topology example not found, creating minimal config..."
        cat > "$CONFIG_DIR/agent-topology.json" <<'EOF'
{
  "panes": [
    {"index": 0, "role": "supervisor", "agent_name": "GreenMountain"},
    {"index": 1, "role": "implementor-1", "agent_name": "OrangePond"}
  ]
}
EOF
        log_success "Minimal agent topology config created"
    fi
else
    log_info "Agent topology already exists, skipping..."
fi
echo ""

# Step 3: Setup credentials (check env vars first)
log_step "3/7 Setting up credentials..."

# Function to setup credential file
setup_credential() {
    local cred_name="$1"
    local env_var="$2"
    local example_file="$3"
    local target_file="$4"

    # Check if environment variable is set
    if [[ -n "${!env_var:-}" ]]; then
        # Use environment variable
        echo "$cred_name=${!env_var}" > "$target_file"
        chmod 600 "$target_file"
        log_success "$cred_name configured from environment variable \$$env_var"
        return 0
    fi

    # Check if file already exists
    if [[ -f "$target_file" ]]; then
        log_info "$cred_name file already exists: $target_file"
        return 0
    fi

    # Check if example file exists
    if [[ -f "$example_file" ]]; then
        cp "$example_file" "$target_file"
        chmod 600 "$target_file"
        log_warning "$cred_name file created from template: $target_file"
        log_warning "Please edit this file and add your $cred_name"
        log_info "  Or set $env_var environment variable and re-run this script"
        return 1
    fi

    # Create empty template
    echo "$cred_name=your_$cred_name_here" > "$target_file"
    chmod 600 "$target_file"
    log_warning "$cred_name file created: $target_file"
    log_warning "Please edit this file and add your $cred_name"
    log_info "  Or set $env_var environment variable and re-run this script"
    return 1
}

# Setup OpenAI API key
setup_credential \
    "OPENAI_API_KEY" \
    "OPENAI_API_KEY" \
    "$MAF_DIR/.maf/credentials/openai.env.example" \
    "$CREDENTIALS_DIR/openai.env"

# Setup GitHub token (optional)
setup_credential \
    "GITHUB_TOKEN" \
    "GITHUB_TOKEN" \
    "$MAF_DIR/.maf/credentials/github.env.example" \
    "$CREDENTIALS_DIR/github.env" || true

# Setup Anthropic API key if ANTHROPIC_API_KEY is set (optional)
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    setup_credential \
        "ANTHROPIC_API_KEY" \
        "ANTHROPIC_API_KEY" \
        "$MAF_DIR/.maf/credentials/anthropic.env.example" \
        "$CREDENTIALS_DIR/anthropic.env" || true
fi

echo ""

# Step 4: Create .gitignore entries for credentials
log_step "4/7 Ensuring credentials are gitignored..."
GITIGNORE_FILE="$PROJECT_ROOT/.maf/.gitignore"
if [[ ! -f "$GITIGNORE_FILE" ]]; then
    mkdir -p "$(dirname "$GITIGNORE_FILE")"
    cat > "$GITIGNORE_FILE" <<'EOF'
# MAF local state
credentials/
*.env
*.db
*.lock
logs/
state/
EOF
    log_success "Created .maf/.gitignore"
else
    log_info ".maf/.gitignore already exists"
fi
echo ""

# Step 5: Initialize MCP Agent Mail
log_step "5/7 Initializing MCP Agent Mail..."
if [[ -f "$MAF_DIR/scripts/maf/bootstrap-agent-mail.sh" ]]; then
    if bash "$MAF_DIR/scripts/maf/bootstrap-agent-mail.sh" 2>&1; then
        log_success "MCP Agent Mail initialized"
    else
        log_warning "MCP Agent Mail initialization had issues (may need credentials first)"
    fi
else
    log_warning "Agent Mail bootstrap script not found, skipping..."
fi
echo ""

# Step 6: Install dependencies
log_step "6/7 Installing dependencies..."
if command -v pnpm &> /dev/null; then
    if [[ -f "$PROJECT_ROOT/package.json" ]] || [[ -f "$PROJECT_ROOT/pnpm-workspace.yaml" ]]; then
        log_info "Running pnpm install..."
        if pnpm install --silent; then
            log_success "Dependencies installed"
        else
            log_warning "Dependency installation had issues, run 'pnpm install' manually"
        fi
    else
        log_info "No package.json found, skipping dependency installation"
    fi
else
    log_warning "pnpm not found, skipping dependency installation"
    log_info "Install pnpm: npm install -g pnpm"
fi
echo ""

# Step 7: Validation
log_step "7/7 Validating installation..."
VALIDATION_PASSED=true

# Check MAF directory
if [[ -d "$MAF_DIR" ]]; then
    log_success "✓ MAF directory exists"
else
    log_error "✗ MAF directory missing"
    VALIDATION_PASSED=false
fi

# Check config
if [[ -f "$CONFIG_DIR/agent-topology.json" ]]; then
    log_success "✓ Agent topology configured"
else
    log_error "✗ Agent topology missing"
    VALIDATION_PASSED=false
fi

# Check credentials (warning only)
if [[ -f "$CREDENTIALS_DIR/openai.env" ]] || [[ -n "${OPENAI_API_KEY:-}" ]]; then
    log_success "✓ OpenAI credentials available"
else
    log_warning "⚠ OpenAI credentials not configured (required for agents)"
fi

# Check Agent Mail
if [[ -d "$PROJECT_ROOT/.agent-mail" ]]; then
    log_success "✓ MCP Agent Mail initialized"
else
    log_warning "⚠ MCP Agent Mail not initialized (run manually if needed)"
fi

echo ""

# Final summary
echo "========================================"
if [[ "$VALIDATION_PASSED" == "true" ]]; then
    log_success "MAF Setup Complete!"
    echo ""
    log_info "Next steps:"
    echo "  1. Edit credentials: nano .maf/credentials/openai.env"
    echo "  2. Or set environment variables: export OPENAI_API_KEY=sk-..."
    echo "  3. Test agent spawning:"
    echo "     bash maf/scripts/maf/spawn-agents.sh --layout minimal_2_pane --workers 2 --background"
    echo ""
    log_info "Useful commands:"
    echo "  - Check health:  bash maf/scripts/maf/context-manager-v2.sh status"
    echo "  - List agents:   tmux ls"
    echo "  - Attach to tmux: tmux attach -t maf-session"
    echo "  - Detach:        Press Ctrl+B, then D"
else
    log_error "Setup validation failed. Please check the errors above."
    exit 1
fi
echo "========================================"
