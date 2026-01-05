#!/bin/bash
# ABOUTME: Initialize .agent-mail directory structure with dummy agent registration
# ABOUTME: Creates directory structure, configuration files, and dummy agent for MAF integration

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
AGENT_MAIL_DIR="$PROJECT_ROOT/.agent-mail"
DUMMY_AGENT_ID="claude-test"

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

# Create directory structure
create_directory_structure() {
    log_info "Creating .agent-mail directory structure..."
    
    local dirs=(
        "$AGENT_MAIL_DIR"
        "$AGENT_MAIL_DIR/agents"
        "$AGENT_MAIL_DIR/config"
        "$AGENT_MAIL_DIR/messages"
        "$AGENT_MAIL_DIR/reservations"
        "$AGENT_MAIL_DIR/logs"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_success "Created directory: $dir"
        else
            log_info "Directory already exists: $dir"
        fi
    done
}

# Create agent registry with dummy agent
create_agent_registry() {
    log_info "Creating agent registry with dummy agent..."
    
    local registry_file="$AGENT_MAIL_DIR/agents/registry.json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    cat > "$registry_file" << REGISTRY_EOF
{
  "metadata": {
    "version": "1.0.0",
    "createdAt": "$timestamp",
    "lastUpdated": "$timestamp",
    "description": "MAF Agent Registry - manages agent registration and capabilities"
  },
  "agents": [
    {
      "id": "$DUMMY_AGENT_ID",
      "type": "test",
      "status": "active",
      "registeredAt": "$timestamp",
      "lastSeen": "$timestamp",
      "capabilities": [
        "file_reservation",
        "task_claiming"
      ],
      "properties": {
        "canClaimTasks": true,
        "canManageReservations": true,
        "maxConcurrentLeases": 5,
        "supportedFileTypes": ["ts", "tsx", "js", "jsx", "json"],
        "heartbeatInterval": 30
      },
      "endpoints": {
        "mcp": "mcp://localhost:3000/agents/$DUMMY_AGENT_ID",
        "http": null
      }
    }
  ],
  "schema": {
    "version": "1.0.0",
    "agentFields": [
      {"name": "id", "type": "string", "required": true},
      {"name": "type", "type": "string", "required": true},
      {"name": "status", "type": "string", "required": true},
      {"name": "capabilities", "type": "array", "required": true},
      {"name": "properties", "type": "object", "required": false}
    ]
  }
}
REGISTRY_EOF
    
    log_success "Created agent registry: $registry_file"
}

# Create MAF configuration
create_maf_config() {
    log_info "Creating MAF configuration..."
    
    local config_file="$AGENT_MAIL_DIR/config/maf-config.json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    cat > "$config_file" << CONFIG_EOF
{
  "metadata": {
    "version": "1.0.0",
    "createdAt": "$timestamp",
    "description": "MAF Configuration - runtime state and integration settings"
  },
  "runtimeState": {
    "leaseDurationMinutes": 30,
    "heartbeatIntervalSeconds": 30,
    "cleanupIntervalMinutes": 5,
    "maxLeasesPerAgent": 10,
    "supportsLeaseManagement": true,
    "supportsHeartbeatTracking": true,
    "supportsMessageQueuing": true,
    "persistToDisk": true
  },
  "reservations": {
    "minimalUsageSlice": {
      "enabled": true,
      "maxReservationDurationMinutes": 60,
      "maxFilesPerReservation": 10,
      "allowedFilePatterns": ["*.ts", "*.tsx", "*.js", "*.jsx", "*.json"],
      "excludedPaths": [".git", "node_modules", ".next", "dist"]
    },
    "conflictResolution": {
      "strategy": "first-come-first-served",
      "retryIntervalSeconds": 5,
      "maxRetries": 3
    }
  },
  "beads": {
    "taskClaimTimeoutMinutes": 15,
    "maxConcurrentTasks": 5,
    "heartbeatIntervalSeconds": 30,
    "integrationMode": "mcp",
    "supportedCommands": ["claim", "release", "status", "heartbeat"]
  },
  "logging": {
    "level": "info",
    "persistToDisk": true,
    "maxLogSizeMB": 100,
    "retentionDays": 7
  },
  "security": {
    "requireAuthentication": false,
    "allowedAgents": ["*"],
    "tokenValidationEnabled": false
  }
}
CONFIG_EOF
    
    log_success "Created MAF configuration: $config_file"
}

# Create reservations database
create_reservations_database() {
    log_info "Creating reservations database..."
    
    local db_file="$AGENT_MAIL_DIR/reservations/reservations.db"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    cat > "$db_file" << RESERVATIONS_EOF
{
  "metadata": {
    "version": "1.0.0",
    "createdAt": "$timestamp",
    "lastUpdated": "$timestamp",
    "description": "File Reservations Database - tracks file locks and leases"
  },
  "reservations": [],
  "schema": {
    "version": "1.0.0",
    "fields": [
      {"name": "id", "type": "string", "required": true, "description": "Unique reservation identifier"},
      {"name": "agentId", "type": "string", "required": true, "description": "Agent making the reservation"},
      {"name": "filePath", "type": "string", "required": true, "description": "Absolute path to reserved file"},
      {"name": "createdAt", "type": "string", "required": true, "description": "ISO timestamp when reservation was created"},
      {"name": "expiresAt", "type": "string", "required": true, "description": "ISO timestamp when reservation expires"},
      {"name": "status", "type": "string", "required": true, "description": "Reservation status (active, expired, released)"},
      {"name": "purpose", "type": "string", "required": false, "description": "Purpose of the reservation"}
    ]
  },
  "indexes": [
    {"name": "by_agent", "fields": ["agentId"]},
    {"name": "by_file", "fields": ["filePath"]},
    {"name": "by_status", "fields": ["status"]},
    {"name": "by_expiry", "fields": ["expiresAt"]}
  ],
  "statistics": {
    "totalReservations": 0,
    "activeReservations": 0,
    "expiredReservations": 0,
    "releasedReservations": 0
  }
}
RESERVATIONS_EOF
    
    log_success "Created reservations database: $db_file"
}

# Create initial log file
create_initial_log() {
    log_info "Creating initial log file..."
    
    local log_file="$AGENT_MAIL_DIR/logs/agent-mail.log"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    cat > "$log_file" << LOG_EOF
[$timestamp] INFO: Agent Mail system initialized
[$timestamp] INFO: Directory structure created
[$timestamp] INFO: Dummy agent '$DUMMY_AGENT_ID' registered
[$timestamp] INFO: MAF configuration loaded
[$timestamp] INFO: Reservations database initialized
[$timestamp] INFO: System ready for agent operations
LOG_EOF
    
    log_success "Created initial log file: $log_file"
}

# Create validation script
create_validation_script() {
    log_info "Creating validation script..."
    
    local validation_file="$AGENT_MAIL_DIR/validate.sh"
    
    cat > "$validation_file" << 'VALIDATION_EOF'
#!/bin/bash
# ABOUTME: Validation script for .agent-mail directory structure and configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AGENT_MAIL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

echo "🔍 Validating .agent-mail configuration..."
echo

# Validate directory structure
echo "Directory Structure:"
required_dirs=("agents" "config" "messages" "reservations" "logs")
for dir in "${required_dirs[@]}"; do
    if [[ -d "$AGENT_MAIL_DIR/$dir" ]]; then
        log_success "$dir/ directory exists"
    else
        log_error "$dir/ directory missing"
    fi
done
echo

# Validate required files
echo "Required Files:"
required_files=(
    "agents/registry.json"
    "config/maf-config.json" 
    "reservations/reservations.db"
    "logs/agent-mail.log"
)
for file in "${required_files[@]}"; do
    if [[ -f "$AGENT_MAIL_DIR/$file" ]]; then
        log_success "$file exists"
    else
        log_error "$file missing"
    fi
done
echo

# Validate JSON syntax
echo "JSON Syntax Validation:"
json_files=("agents/registry.json" "config/maf-config.json" "reservations/reservations.db")
for file in "${json_files[@]}"; do
    if [[ -f "$AGENT_MAIL_DIR/$file" ]]; then
        if python3 -m json.tool "$AGENT_MAIL_DIR/$file" > /dev/null 2>&1; then
            log_success "$file has valid JSON"
        else
            log_error "$file has invalid JSON"
        fi
    fi
done
echo

# Validate dummy agent registration
echo "Dummy Agent Registration:"
registry_file="$AGENT_MAIL_DIR/agents/registry.json"
if [[ -f "$registry_file" ]]; then
    if python3 -c "import json; data=json.load(open('$registry_file')); agents=[a for a in data.get('agents', []) if a.get('id') == 'claude-test']; exit(0 if agents else 1)" 2>/dev/null; then
        log_success "Dummy agent 'claude-test' registered"
    else
        log_error "Dummy agent 'claude-test' not found"
    fi
fi
echo

echo "Validation complete."
VALIDATION_EOF
    
    chmod +x "$validation_file"
    log_success "Created validation script: $validation_file"
}

# Main execution
main() {
    echo "🚀 Initializing .agent-mail Directory Structure"
    echo "=============================================="
    echo
    
    # Check if .agent-mail already exists
    if [[ -d "$AGENT_MAIL_DIR" ]]; then
        log_warning ".agent-mail directory already exists"
        read -p "Do you want to continue and overwrite existing files? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Initialization cancelled by user"
            exit 0
        fi
    fi
    
    # Create all components
    create_directory_structure
    create_agent_registry
    create_maf_config
    create_reservations_database
    create_initial_log
    create_validation_script
    
    echo
    log_success ".agent-mail initialization completed successfully!"
    echo
    echo "📁 Directory: $AGENT_MAIL_DIR"
    echo "🤖 Dummy Agent: $DUMMY_AGENT_ID"
    echo "🔧 Validation: Run .agent-mail/validate.sh to check configuration"
    echo
    echo "Next steps:"
    echo "1. Run tests: npm test -- tests/maf/agent-mail-init.test.ts"
    echo "2. Test integration: npm run maf:test-beads-flow"
}
