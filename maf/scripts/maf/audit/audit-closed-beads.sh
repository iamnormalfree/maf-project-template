#!/bin/bash
# ABOUTME: Quarterly audit of closed beads for false closures
# ABOUTME: Runs verify-ac.sh on all closed beads with acceptance criteria
# COMPLETION_DRIVE: Prevents future false closures from accumulating
# LCL: automation::quarterly_audit
# LCL: integrity_check::false_closure_detection
#
# Scheduled: Quarterly (Jan 1, Apr 1, Jul 1, Oct 1 at 2 AM)
# Manual: Run anytime to audit all closed beads
#
# Exit codes:
#   0 - All beads verified successfully
#   1 - One or more beads failed verification (false closures detected)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script is at scripts/maf/audit/, so go up 3 levels to reach project root
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Source colors if available
if [ -f "${SCRIPT_DIR}/../lib/colors.sh" ]; then
    source "${SCRIPT_DIR}/../lib/colors.sh"
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

# Configuration (will be resolved after cd to PROJECT_ROOT)
VERIFY_SCRIPT_REL="scripts/maf/verify-ac.sh"
AUDIT_LOG_REL=".maf/logs/audit-closed-beads.log"

# Statistics
TOTAL_COUNT=0
PASSED_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0
declare -a FAILED_BEADS=()
declare -a PASSED_BEADS=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$AUDIT_LOG"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "$AUDIT_LOG"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" | tee -a "$AUDIT_LOG"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $*" | tee -a "$AUDIT_LOG"
}

# Print header
print_header() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}   Closed Bead Audit${NC}"
    echo -e "${BLUE}======================================${NC}"
    echo ""
    echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "Project: $PROJECT_ROOT"
    echo ""
}

# Print summary
print_summary() {
    echo ""
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}   Audit Summary${NC}"
    echo -e "${BLUE}======================================${NC}"
    echo "Total audited: $TOTAL_COUNT"
    echo -e "  ${GREEN}Passed:${NC} $PASSED_COUNT"
    echo -e "  ${RED}Failed:${NC} $FAILED_COUNT"
    echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED_COUNT"
    echo ""

    if [ ${#FAILED_BEADS[@]} -gt 0 ]; then
        echo -e "${RED}Failed Beads:${NC}"
        for bead in "${FAILED_BEADS[@]}"; do
            echo "  ❌ $bead"
        done
        echo ""
    fi

    if [ ${#PASSED_BEADS[@]} -gt 0 ] && [ "$VERBOSE" = true ]; then
        echo -e "${GREEN}Passed Beads:${NC}"
        for bead in "${PASSED_BEADS[@]}"; do
            echo "  ✅ $bead"
        done
        echo ""
    fi
}

# Verify a single bead
verify_bead() {
    local bead_id="$1"
    local verify_script="$2"
    local output
    local exit_code

    TOTAL_COUNT=$((TOTAL_COUNT + 1))

    # Run verification and capture output
    if output=$("$verify_script" "$bead_id" 2>&1); then
        exit_code=0
    else
        exit_code=$?
    fi

    if [ $exit_code -eq 0 ]; then
        PASSED_COUNT=$((PASSED_COUNT + 1))
        PASSED_BEADS+=("$bead_id")
        if [ "$VERBOSE" = true ]; then
            log_success "$bead_id"
        fi
    elif [ $exit_code -eq 2 ]; then
        # Exit code 2 means bead not found or no AC - skip
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        log_warn "$bead_id (skipped - no AC or not found)"
    else
        FAILED_COUNT=$((FAILED_COUNT + 1))
        FAILED_BEADS+=("$bead_id")
        log_error "$bead_id"

        if [ "$VERBOSE" = true ]; then
            echo "  Output:"
            echo "$output" | sed 's/^/    /'
        fi
    fi
}

# Main function
main() {
    cd "$PROJECT_ROOT"

    # Resolve paths after cd
    local BEADS_FILE=".beads/beads.jsonl"
    local VERIFY_SCRIPT="$VERIFY_SCRIPT_REL"
    local AUDIT_LOG="$AUDIT_LOG_REL"

    # Ensure log directory exists
    mkdir -p "$(dirname "$AUDIT_LOG")"

    VERBOSE=false
    SKIP_SUMMARY=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -q|--quiet)
                SKIP_SUMMARY=true
                shift
                ;;
            -h|--help)
                cat << EOF
Closed Bead Audit - Detect False Closures

USAGE:
    audit-closed-beads.sh [OPTIONS]

OPTIONS:
    -v, --verbose    Show detailed output for each bead
    -q, --quiet      Skip summary of passed beads
    -h, --help       Show this help message

DESCRIPTION:
    Audits all closed beads with acceptance criteria to detect false closures.
    Runs verify-ac.sh on each bead and reports failures.

EXIT CODES:
    0 - All beads verified successfully
    1 - One or more beads failed verification

EXAMPLES:
    audit-closed-beads.sh           # Run audit
    audit-closed-beads.sh -v        # Run with verbose output

EOF
                exit 0
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done

    print_header | tee -a "$AUDIT_LOG"

    # Check if beads file exists
    if [ ! -f "$BEADS_FILE" ]; then
        log_error "Beads file not found: $BEADS_FILE"
        exit 1
    fi

    # Check if verify script exists
    if [ ! -f "$VERIFY_SCRIPT" ]; then
        log_error "Verify script not found: $VERIFY_SCRIPT"
        exit 1
    fi

    # Get all closed beads with acceptance criteria
    log_info "Finding closed beads with acceptance criteria..."

    local beads
    beads=$(jq -r 'select(.status == "closed" and (.acceptance_criteria // "") != "" and .acceptance_criteria != "null") | .id' "$BEADS_FILE" 2>/dev/null || true)

    if [ -z "$beads" ]; then
        log_warn "No closed beads with acceptance criteria found"
        echo ""
        echo "✅ Nothing to audit"
        exit 0
    fi

    local bead_count
    bead_count=$(echo "$beads" | wc -l)
    log_info "Found $bead_count beads to audit"
    echo ""

    # Verify each bead
    while IFS= read -r bead; do
        [ -n "$bead" ] || continue
        verify_bead "$bead" "$VERIFY_SCRIPT"
    done <<< "$beads"

    # Print summary
    print_summary | tee -a "$AUDIT_LOG"

    # Exit with appropriate code
    if [ $FAILED_COUNT -gt 0 ]; then
        log_error "False closures detected - review required"
        log_info "Audit log saved to: $AUDIT_LOG"
        exit 1
    else
        log_success "All beads verified successfully"
        log_info "Audit log saved to: $AUDIT_LOG"
        exit 0
    fi
}

main "$@"
