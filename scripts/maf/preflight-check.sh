#!/bin/bash
# ABOUTME: Shell script wrapper for MAF preflight validation
# ABOUTME: Provides CLI interface for preflight checks with proper error handling

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
AGENT_ID=""
OUTPUT_FORMAT="human"
EVIDENCE_COLLECTION="true"
CHECK_TYPE="preflight_validation"
TIMEOUT_MS=30000
VERBOSE=false

# Help message
show_help() {
    cat << EOF
MAF Preflight Check - Bootstrap validation for MAF agents

USAGE:
    preflight-check.sh [OPTIONS]

OPTIONS:
    -a, --agent-id <id>        Agent ID to use for the check
    -f, --format <format>       Output format: human, json (default: human)
    -c, --check-type <type>     Check type: preflight_validation, smoke_test,
                               reservation_check, escalation_path
    -t, --timeout <ms>          Timeout in milliseconds (default: 30000)
    --no-evidence              Disable evidence collection
    --minimal                  Skip Python/MCP/Environment validation (minimal mode)
    --full-validation          Enable full Python/MCP/Environment validation (default)
    -v, --verbose               Enable verbose output
    -h, --help                  Show this help message

EXIT CODES:
    0   All checks passed
    1   One or more checks failed
    2   System error occurred
    3   Invalid arguments provided

EXAMPLES:
    # Run basic preflight check
    ./preflight-check.sh

    # Run with custom agent ID and JSON output
    ./preflight-check.sh --agent-id my-agent --format json

    # Run smoke test without evidence collection
    ./preflight-check.sh --check-type smoke_test --no-evidence

EOF
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

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--agent-id)
                AGENT_ID="$2"
                shift 2
                ;;
            -f|--format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            -c|--check-type)
                CHECK_TYPE="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT_MS="$2"
                shift 2
                ;;
            --no-evidence)
                EVIDENCE_COLLECTION="false"
                shift
                ;;
            --minimal)
                MINIMAL_MODE=true
                shift
                ;;
            --full-validation)
                FULL_VALIDATION=true
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

# Validate environment
validate_environment() {
    log_verbose "Validating environment..."
    
    # Check if we're in a valid MAF project
    if [ ! -f "${MAF_ROOT}/package.json" ]; then
        log_error "Not in a valid MAF project (package.json not found)"
        exit 2
    fi

    # Check if preflight coordinator exists
    local coordinator_file="${MAF_ROOT}/lib/maf/preflight-coordinator.ts"
    if [ ! -f "$coordinator_file" ]; then
        log_error "Preflight coordinator not found: $coordinator_file"
        exit 2
    fi

    log_verbose "Environment validation passed"
}

# Setup environment
setup_environment() {
    log_verbose "Setting up environment..."

    # Load .env.local if it exists (for API keys and other environment variables)
    if [ -f "${MAF_ROOT}/.env.local" ]; then
        log_verbose "Loading environment variables from .env.local..."
        # Export all variables from .env.local, filtering out comments and empty lines
        set -a
        source <(grep -v '^#' "${MAF_ROOT}/.env.local" | grep -v '^$' | sed 's/^export//' | sed 's/=/="/;s/$/"/')
        set +a
        log_verbose "Environment variables loaded from .env.local"
    fi

    # Set defaults from environment variables if not specified
    if [ -z "$AGENT_ID" ]; then
        AGENT_ID="${MAF_AGENT_ID:-agent-$(date +%s)}"
    fi

    # Export environment variables for Node.js process
    export MAF_AGENT_ID="$AGENT_ID"
    export MAF_AGENT_MAIL_ROOT="${MAF_AGENT_MAIL_ROOT:-.agent-mail}"
    export MAF_RUNTIME="${MAF_RUNTIME:-file}"
    export MAF_DB_PATH="${MAF_DB_PATH:-runtime/maf.db}"
    export MAF_LOG_LEVEL="${MAF_LOG_LEVEL:-info}"
}

# Run the preflight check
run_preflight_check() {
    # Only log if not in JSON mode
    if [ "$OUTPUT_FORMAT" != "json" ]; then
        log_info "Starting MAF preflight check..."
    fi

    # Build arguments for the TypeScript script
    local args=()
    [ -n "$AGENT_ID" ] && args+=("--agent-id" "$AGENT_ID")
    [ "$OUTPUT_FORMAT" = "json" ] && args+=("--json")
    [ "$EVIDENCE_COLLECTION" = "false" ] && args+=("--no-evidence")
    [ -n "$CHECK_TYPE" ] && args+=("--check-type" "$CHECK_TYPE")
    [ "$MINIMAL_MODE" = true ] && args+=("--minimal")
    [ "$FULL_VALIDATION" = true ] && args+=("--full-validation")

    # Change to project root
    cd "$MAF_ROOT"

    # Always try to run with compiled JavaScript first (build if needed)
    if [ ! -f "dist/lib/maf/preflight-coordinator.js" ]; then
        log_info "Compiling MAF scripts..."
        if command -v npm >/dev/null 2>&1; then
            npm run maf:build-scripts >/dev/null 2>&1
        fi
    fi

    if [ -f "dist/lib/maf/preflight-coordinator.js" ]; then
        # For JSON output, suppress shell logging and let script handle output
        if [ "$OUTPUT_FORMAT" = "json" ]; then
            export NODE_PATH="${MAF_ROOT}/dist:${NODE_PATH:-}"
            exec node dist/scripts/maf/preflight-check.js "${args[@]}"
        else
            log_verbose "Running with compiled JavaScript..."
            export NODE_PATH="${MAF_ROOT}/dist:${NODE_PATH:-}"
            node dist/scripts/maf/preflight-check.js "${args[@]}"
            return $?
        fi
    else
        log_error "Compiled JavaScript not found. Please run 'npm run maf:build-scripts'"
        exit 2
    fi
}

# Main execution
main() {
    # Parse command line arguments first to check for JSON format
    parse_args "$@"

    # Validate environment
    validate_environment

    # Setup environment
    setup_environment

    # For JSON output, suppress shell logging entirely
    if [ "$OUTPUT_FORMAT" = "json" ]; then
        run_preflight_check
        exit $?
    else
        log_info "MAF Preflight Check v1.0.0"
        echo
        run_preflight_check
        local exit_code=$?

        if [ $exit_code -eq 0 ]; then
            log_success "Preflight check completed successfully"
        else
            log_error "Preflight check failed with exit code: $exit_code"
        fi

        exit $exit_code
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
test change
