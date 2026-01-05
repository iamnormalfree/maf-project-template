#!/bin/bash
# ABOUTME: Supervisor's Merge Gate Verification Script
# ABOUTME: Verifies all conditions are met before allowing bead closure
# COMPLETION_DRIVE: Implements merge gate enforcement from detection-gaps-analysis.md
# LCL: verification_mode::merge_gate
# LCL: supervisor_workflow::pre_close_validation
#
# Usage:
#   verify-merge-gate.sh <bead_id> [--force] [--skip-ci] [--skip-reviewer]
#
# Options:
#   --force         Skip all checks (use only in emergencies)
#   --skip-ci       Skip CI status check
#   --skip-reviewer Skip reviewer approval check
#
# Exit codes:
#   0 - Merge gate passed (safe to close)
#   1 - Merge gate failed (do not close)
#   2 - Invalid arguments or bead not found
#
# This script implements the Supervisor's merge gate verification as described in
# docs/analysis/detection-gaps-analysis.md - Fix 4: Merge Gate Enforcement

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAF_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source colors and utilities
if [ -f "${SCRIPT_DIR}/lib/colors.sh" ]; then
    source "${SCRIPT_DIR}/lib/colors.sh"
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

# Configuration
BEADS_FILE="${BEADS_FILE:-.beads/beads.jsonl}"
RECEIPTS_DIR="receipts"
PROJECT_ROOT="${MAF_ROOT}"
FORCE_MODE=false
SKIP_CI=false
SKIP_REVIEWER=false

# Gate checks status
declare -a GATE_CHECKS=()
declare -a GATE_PASSED=()
declare -a GATE_FAILED=()

# Logging functions
log_info() {
    echo -e "${BLUE}[GATE]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $*"
}

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $*" >&2
}

# Show usage
show_usage() {
    cat << EOF
Supervisor's Merge Gate Verification

USAGE:
    verify-merge-gate.sh <bead_id> [--force] [--skip-ci] [--skip-reviewer]

ARGUMENTS:
    bead_id               Bead ID to verify (e.g., roundtable-abc)

OPTIONS:
    --force               Skip all checks (emergency only, requires confirmation)
    --skip-ci             Skip CI status check
    --skip-reviewer       Skip reviewer approval check
    -h, --help            Show this help message

DESCRIPTION:
    Verifies all conditions are met before allowing bead closure.

    Gate checks performed:
    1. Receipt exists AND is valid (not placeholder)
    2. Receipt AC section shows all PASS
    3. Receipt includes test results
    4. CI is green (if PR open)
    5. Reviewer approved in Agent Mail

EXIT CODES:
    0 - Merge gate passed (safe to close)
    1 - Merge gate failed (do not close)
    2 - Invalid arguments or bead not found

EXAMPLES:
    verify-merge-gate.sh roundtable-abc
    verify-merge-gate.sh roundtable-abc --skip-ci
    verify-merge-gate.sh roundtable-abc --force

EOF
}

# Parse arguments
BEAD_ID=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_MODE=true
            shift
            ;;
        --skip-ci)
            SKIP_CI=true
            shift
            ;;
        --skip-reviewer)
            SKIP_REVIEWER=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            show_usage
            exit 2
            ;;
        *)
            if [ -z "$BEAD_ID" ]; then
                BEAD_ID="$1"
            else
                log_error "Multiple bead IDs provided"
                show_usage
                exit 2
            fi
            shift
            ;;
    esac
done

# Validate bead ID
if [ -z "$BEAD_ID" ]; then
    log_error "Bead ID required"
    show_usage
    exit 2
fi

# Force mode confirmation
if [ "$FORCE_MODE" = true ]; then
    log_warn "⚠️  FORCE MODE REQUESTED"
    echo ""
    log_warn "This will skip ALL merge gate checks."
    log_warn "Only use this in emergencies (e.g., CI down, reviewer unavailable)."
    echo ""
    read -p "Type 'FORCE' to confirm: " confirmation
    if [ "$confirmation" != "FORCE" ]; then
        log_error "Force mode cancelled"
        exit 1
    fi
    echo ""
    log_success "Force mode confirmed - bypassing all checks"
    echo ""
fi

# Change to project root
cd "$PROJECT_ROOT"

# Get bead data
BEAD_JSON=$(jq -r "select(.id == \"$BEAD_ID\")" "$BEADS_FILE")
if [ -z "$BEAD_JSON" ]; then
    log_error "Bead not found: $BEAD_ID"
    exit 2
fi

BEAD_STATUS=$(echo "$BEAD_JSON" | jq -r '.status // "unknown"')

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Supervisor Merge Gate Verification                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
log_info "Bead: ${GREEN}${BEAD_ID}${NC}"
log_info "Status: ${BEAD_STATUS}"
echo ""

# ============================================================================
# GATE CHECK 1: Receipt exists AND is valid
# ============================================================================

GATE_CHECKS+=("Receipt exists and is valid")

log_info "▶ Checking receipt..."

RECEIPT_FILE="${RECEIPTS_DIR}/${BEAD_ID}.md"

if [ ! -f "$RECEIPT_FILE" ]; then
    log_error "Receipt not found: ${RECEIPT_FILE}"
    GATE_FAILED+=("Receipt missing")
else
    RECEIPT_SIZE=$(stat -f%z "$RECEIPT_FILE" 2>/dev/null || stat -c%s "$RECEIPT_FILE" 2>/dev/null || echo "0")

    if [ "$RECEIPT_SIZE" -eq 0 ]; then
        log_error "Receipt is empty (0 bytes)"
        GATE_FAILED+=("Receipt empty")
    else
        log_success "Receipt exists (${RECEIPT_SIZE} bytes)"

        # Check for placeholder content
        if grep -q "Typical development commands (customize based on actual work)" "$RECEIPT_FILE"; then
            log_error "Receipt contains placeholder content (not actual work)"
            GATE_FAILED+=("Receipt is placeholder")
        else
            log_success "Receipt contains actual work (not placeholder)"
            GATE_PASSED+=("Receipt valid")
        fi
    fi
fi

echo ""

# ============================================================================
# GATE CHECK 2: Receipt AC section shows PASS
# ============================================================================

GATE_CHECKS+=("Acceptance criteria verified in receipt")

log_info "▶ Checking acceptance criteria verification..."

if [ ! -f "$RECEIPT_FILE" ]; then
    log_error "Cannot check AC - receipt missing"
    GATE_FAILED+=("AC verification unknown")
else
    # Check if AC verification section exists
    if ! grep -q "## Acceptance Criteria Verification" "$RECEIPT_FILE"; then
        log_warn "No AC verification section in receipt (receipt may be old format)"
        GATE_FAILED+=("AC verification section missing")
    else
        # Check for FAILED status
        if grep -q "❌.*ACCEPTANCE CRITERIA NOT FULLY VERIFIED" "$RECEIPT_FILE"; then
            log_error "Acceptance criteria NOT verified"
            AC_FAILED_COUNT=$(grep -oP 'Failed:\s*\K\d+' "$RECEIPT_FILE" | head -1 || echo "?")
            log_error "Failed checks: ${AC_FAILED_COUNT}"
            GATE_FAILED+=("AC not verified (${AC_FAILED_COUNT} failed)")
        # Check for PASS status
        elif grep -q "✅.*ALL ACCEPTANCE CRITERIA VERIFIED" "$RECEIPT_FILE"; then
            AC_PASSED_COUNT=$(grep -oP '✅.*ALL ACCEPTANCE CRITERIA VERIFIED.*\K\d+' "$RECEIPT_FILE" | head -1 || echo "?")
            log_success "All acceptance criteria verified (${AC_PASSED_COUNT} checks passed)"
            GATE_PASSED+=("AC verified")
        else
            # No AC defined
            if grep -q "No acceptance criteria defined" "$RECEIPT_FILE"; then
                log_warn "No acceptance criteria defined for this bead"
                GATE_FAILED+=("No AC defined")
            else
                log_warn "Could not determine AC verification status"
                GATE_FAILED+=("AC status unclear")
            fi
        fi
    fi
fi

echo ""

# ============================================================================
# GATE CHECK 3: Receipt includes test results
# ============================================================================

GATE_CHECKS+=("Test results included in receipt")

log_info "▶ Checking test results..."

if [ ! -f "$RECEIPT_FILE" ]; then
    log_error "Cannot check tests - receipt missing"
    GATE_FAILED+=("Test results unknown")
else
    # Check if Commands Run section has actual commands (not placeholder)
    if grep -q "Typical development commands (customize based on actual work)" "$RECEIPT_FILE"; then
        log_warn "Commands section contains placeholder (no actual commands listed)"
        GATE_FAILED+=("No actual commands listed")
    else
        log_success "Commands section contains actual commands"
        GATE_PASSED+=("Commands documented")
    fi

    # Check if there's a Test Results section
    if grep -q "## Test Results" "$RECEIPT_FILE"; then
        log_success "Test results section present"
        GATE_PASSED+=("Test results present")
    else
        log_warn "No explicit Test Results section (may be OK for non-code beads)"
    fi
fi

echo ""

# ============================================================================
# GATE CHECK 4: CI is green
# ============================================================================

GATE_CHECKS+=("CI status is green")

if [ "$SKIP_CI" = true ]; then
    log_warn "Skipping CI check (--skip-ci flag)"
    GATE_PASSED+=("CI check skipped")
elif [ "$FORCE_MODE" = true ]; then
    log_warn "Skipping CI check (force mode)"
else
    log_info "▶ Checking CI status..."

    # Check if gh CLI is available
    if ! command -v gh &>/dev/null; then
        log_warn "gh CLI not available - cannot check CI status"
        GATE_FAILED+=("CI status unknown (gh not available)")
    else
        # Check if there's a PR open for this bead
        BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "unknown")

        if echo "$BRANCH_NAME" | grep -qE "^roundtable-"; then
            # We're on a feature branch, check CI
            LATEST_RUN=$(gh run list --limit 1 --json conclusion,status --jq '.[0]' 2>/dev/null || echo "{}")

            if [ "$LATEST_RUN" = "{}" ]; then
                log_warn "No CI runs found"
                GATE_FAILED+=("No CI runs")
            else
                RUN_CONCLUSION=$(echo "$LATEST_RUN" | jq -r '.conclusion // empty')
                RUN_STATUS=$(echo "$LATEST_RUN" | jq -r '.status // empty')

                if [ "$RUN_CONCLUSION" = "success" ]; then
                    log_success "CI is green: ${RUN_CONCLUSION}"
                    GATE_PASSED+=("CI green")
                elif [ "$RUN_STATUS" = "in_progress" ] || [ "$RUN_STATUS" = "queued" ]; then
                    log_warn "CI still running: ${RUN_STATUS}"
                    GATE_FAILED+=("CI in progress")
                else
                    log_error "CI not green: ${RUN_CONCLUSION:-$RUN_STATUS}"
                    GATE_FAILED+=("CI not green: ${RUN_CONCLUSION:-$RUN_STATUS}")
                fi
            fi
        else
            log_info "Not on a feature branch (${BRANCH_NAME}) - skipping CI check"
        fi
    fi
fi

echo ""

# ============================================================================
# GATE CHECK 5: Reviewer approved
# ============================================================================

GATE_CHECKS+=("Reviewer approved")

if [ "$SKIP_REVIEWER" = true ]; then
    log_warn "Skipping reviewer approval check (--skip-reviewer flag)"
    GATE_PASSED+=("Reviewer check skipped")
elif [ "$FORCE_MODE" = true ]; then
    log_warn "Skipping reviewer approval check (force mode)"
else
    log_info "▶ Checking reviewer approval..."

    # Check if mcp-agent-mail is available
    if command -v mcp-client &>/dev/null || [ -d ".agent-mail" ]; then
        # Check Agent Mail for reviewer approval
        # This would use the MCP Agent Mail API to check for approval messages
        # For now, we'll check if there's a recent approval in the message history

        # Look for approval patterns in Agent Mail
        if [ -d ".agent-mail" ]; then
            # Check for recent approval messages
            APPROVAL_COUNT=$(find .agent-mail -name "*.json" -newer .bead-ledger/${BEAD_ID}.json 2>/dev/null | \
                xargs grep -l "approved\|LGTM\|looks good" 2>/dev/null | wc -l || echo "0")

            if [ "$APPROVAL_COUNT" -gt 0 ]; then
                log_success "Found reviewer approval in Agent Mail"
                GATE_PASSED+=("Reviewer approved")
            else
                log_warn "No reviewer approval found in Agent Mail"
                GATE_FAILED+=("No reviewer approval")
            fi
        else
            log_warn "Agent Mail directory not found"
            GATE_FAILED+=("Reviewer approval unknown")
        fi
    else
        log_warn "MCP Agent Mail not available - cannot check reviewer approval"
        GATE_FAILED+=("Reviewer approval unknown (MCP not available)")
    fi
fi

echo ""

# ============================================================================
# SUMMARY AND DECISION
# ============================================================================

PASSED_COUNT=${#GATE_PASSED[@]}
FAILED_COUNT=${#GATE_FAILED[@]}
TOTAL_COUNT=${#GATE_CHECKS[@]}

echo -e "${BLUE}═════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    GATE SUMMARY                        ${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════════════${NC}"
echo ""
echo "Total Checks: ${TOTAL_COUNT}"
echo -e "  ${GREEN}Passed:${NC} ${PASSED_COUNT}"
echo -e "  ${RED}Failed:${NC} ${FAILED_COUNT}"
echo ""

if [ ${#GATE_PASSED[@]} -gt 0 ]; then
    echo -e "${GREEN}✓ PASSED Checks:${NC}"
    for check in "${GATE_PASSED[@]}"; do
        echo "  ✅ $check"
    done
    echo ""
fi

if [ ${#GATE_FAILED[@]} -gt 0 ]; then
    echo -e "${RED}✗ FAILED Checks:${NC}"
    for check in "${GATE_FAILED[@]}"; do
        echo "  ❌ $check"
    done
    echo ""
fi

# Make decision
if [ "$FORCE_MODE" = true ]; then
    echo -e "${YELLOW}═════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}              DECISION: FORCE APPROVED                 ${NC}"
    echo -e "${YELLOW}═════════════════════════════════════════════════════════${NC}"
    echo ""
    log_warn "⚠️  Merge gate BYPASSED due to force mode"
    log_warn "This should only happen in emergencies"
    echo ""
    log_info "Before closing, please verify:"
    log_info "  1. You have documented the reason for force mode"
    log_info "  2. You will create a follow-up bead to address failures"
    echo ""
    exit 0
fi

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}═════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}              DECISION: GATE PASSED                     ${NC}"
    echo -e "${GREEN}═════════════════════════════════════════════════════════${NC}"
    echo ""
    log_success "✅ All merge gate checks passed"
    echo ""
    log_info "It is safe to close this bead:"
    log_info "  ./scripts/maf/bd-close ${BEAD_ID}"
    echo ""
    exit 0
else
    echo -e "${RED}═════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}              DECISION: GATE FAILED                      ${NC}"
    echo -e "${RED}═════════════════════════════════════════════════════════${NC}"
    echo ""
    log_error "❌ Merge gate FAILED - do NOT close this bead"
    echo ""
    log_info "To fix failures:"
    log_info "  1. Address each failed check above"
    log_info "  2. Regenerate receipt if needed: receipt ${BEAD_ID}"
    log_info "  3. Re-run verification: ./scripts/maf/verify-merge-gate.sh ${BEAD_ID}"
    echo ""
    log_info "To bypass (emergency only):"
    log_info "  ./scripts/maf/verify-merge-gate.sh ${BEAD_ID} --force"
    echo ""
    exit 1
fi
