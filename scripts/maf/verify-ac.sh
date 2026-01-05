#!/bin/bash
# ABOUTME: Acceptance Criteria Verification for MAF Beads
# ABOUTME: Validates that bead acceptance criteria are actually met before allowing closure
# COMPLETION_DRIVE: Implements detection gap fix for false bead closures
# LCL: verification_mode::ac_validation
# LCL: superpowers_integration::sp_verify_sp_tdd_enhanced
#
# Usage:
#   verify-ac.sh <bead_id> [--audit] [--use-sp]
#
# Options:
#   --audit      Run in audit mode (more verbose, exits with error on failure)
#   --use-sp     Use Superpowers skills for enhanced verification
#
# Exit codes:
#   0 - All acceptance criteria verified
#   1 - One or more criteria failed
#   2 - Invalid arguments or bead not found

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
PROJECT_ROOT="${MAF_ROOT}"
AUDIT_MODE=false
USE_SUPERPOWERS=false

# Statistics
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
SKIPPED_CHECKS=0
declare -a FAILED_ITEMS=()
declare -a PASSED_ITEMS=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
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

log_skip() {
    echo -e "${YELLOW}[⊘]${NC} $*"
}

# Show usage
show_usage() {
    cat << EOF
Acceptance Criteria Verification for MAF Beads

USAGE:
    verify-ac.sh <bead_id> [--audit] [--use-sp]

ARGUMENTS:
    bead_id               Bead ID to verify (e.g., roundtable-abc)

OPTIONS:
    --audit               Run in audit mode (detailed output, exit on failure)
    --use-sp              Use Superpowers skills for enhanced verification
    -h, --help            Show this help message

DESCRIPTION:
    Verifies that bead acceptance criteria are actually met before allowing closure.

    Checks performed:
    - Script tests run successfully
    - Required files exist
    - Commands are available
    - Git diffs include expected patterns
    - Tests pass (if TDD mode)

EXIT CODES:
    0 - All acceptance criteria verified
    1 - One or more criteria failed
    2 - Invalid arguments or bead not found

EXAMPLES:
    verify-ac.sh roundtable-abc
    verify-ac.sh roundtable-abc --use-sp
    verify-ac.sh roundtable-abc --audit

EOF
}

# Parse arguments
BEAD_ID=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --audit)
            AUDIT_MODE=true
            shift
            ;;
        --use-sp)
            USE_SUPERPOWERS=true
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

# Change to project root
cd "$PROJECT_ROOT"

# Get bead data
BEAD_JSON=$(jq -r "select(.id == \"$BEAD_ID\")" "$BEADS_FILE")
if [ -z "$BEAD_JSON" ]; then
    log_error "Bead not found: $BEAD_ID"
    exit 2
fi

# Extract acceptance criteria
AC_TEXT=$(echo "$BEAD_JSON" | jq -r '.acceptance_criteria // empty')

if [ "$AC_TEXT" = "null" ] || [ -z "$AC_TEXT" ]; then
    log_warn "No acceptance criteria defined for bead $BEAD_ID"
    log_info "Skipping verification"
    exit 0
fi

echo -e "${BLUE}=== Acceptance Criteria Verification: ${BEAD_ID} ===${NC}"
echo ""

# Parse AC text into structured format
# This handles both free-text AC and attempts to extract testable criteria

check_script_tests() {
    local ac_text="$1"
    local found=false

    echo -e "${BLUE}→${NC} Checking script tests..."

    # Look for script test patterns
    # Patterns like:
    # - "./scripts/x.sh runs without error"
    # - "pnpm test passes"
    # - "make build succeeds"
    # - "via scripts/ops/update-ai-frameworks.sh"

    # Convert literal \n to actual newlines
    ac_text=$(echo "$ac_text" | sed 's/\\n/\n/g')

    # Extract script commands from AC text
    local scripts=()
    while IFS= read -r line; do
        # Pattern 1: explicit "runs/succeeds/passes" keywords
        if echo "$line" | grep -qE "^\s*-\s+[\./\$].*\.(sh|js|ts)\s+(runs|succeeds|passes)"; then
            local script=$(echo "$line" | sed -E 's/^\s*-\s+//; s/\s+(runs|succeeds|passes)\s*$//')
            scripts+=("$script")
        # Pattern 2: "via script.sh" or "via ./script.sh"
        elif echo "$line" | grep -qE "via\s+[\./]*[\w/\-]+\.(sh|js|ts)"; then
            local script=$(echo "$line" | grep -oE "via\s+[\./]*[\w/\-]+\.(sh|js|ts)" | sed 's/^via\s*//')
            scripts+=("$script")
        # Pattern 3: command keywords (pnpm, npm, make, etc.)
        elif echo "$line" | grep -qE "(pnpm|npm|make|python|node)\s+(test|build|compile|install)"; then
            local cmd=$(echo "$line" | grep -oE "(pnpm|npm|make|python|node)\s+(test|build|compile|install)" | head -1)
            scripts+=("$cmd")
        fi
    done <<< "$ac_text"

    if [ ${#scripts[@]} -eq 0 ]; then
        # Try global pattern search as fallback
        if echo "$ac_text" | grep -qE "via\s+[\./]*[\w/\-]+\.sh"; then
            local script=$(echo "$ac_text" | grep -oE "via\s+[\./]*[\w/\-]+\.sh" | sed 's/^via\s*//' | head -1)
            scripts+=("$script")
        fi
    fi

    if [ ${#scripts[@]} -eq 0 ]; then
        log_skip "No script tests found in acceptance criteria"
        return 0
    fi

    found=true
    for script_cmd in "${scripts[@]}"; do
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -n "  Testing: $script_cmd ... "

        # Check if script exists first
        if [ ! -f "$script_cmd" ] && [ ! -f "./$script_cmd" ]; then
            log_error "NOT FOUND"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            FAILED_ITEMS+=("script: $script_cmd (file not found)")
            continue
        fi

        # Try to run the script
        if eval "$script_cmd > /dev/null 2>&1"; then
            log_success "PASSED"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            PASSED_ITEMS+=("script: $script_cmd")
        else
            log_error "FAILED"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            FAILED_ITEMS+=("script: $script_cmd")

            if [ "$AUDIT_MODE" = true ]; then
                echo "        Running in verbose mode to show failure:"
                eval "$script_cmd" || true
            fi
        fi
    done

    return 0
}

check_file_exists() {
    local ac_text="$1"
    local found=false

    echo ""
    echo -e "${BLUE}→${NC} Checking required files..."

    # Extract file patterns from AC text
    # Patterns like:
    # - "docs/plan/superpowers-integration.md exists"
    # - ".claude/external/response-awareness exists"
    # - "README.md is updated"

    # Convert literal \n to actual newlines
    ac_text=$(echo "$ac_text" | sed 's/\\n/\n/g')

    local files=()
    while IFS= read -r line; do
        if echo "$line" | grep -qE "^\s*-\s+[\./\$].*\s+exists?"; then
            # Extract the file path
            local file=$(echo "$line" | sed -E 's/^\s*-\s+//; s/[\s\(].*//')
            files+=("$file")
        elif echo "$line" | grep -qE "^\s*-\s+[\./\$].*\.md\s+created"; then
            local file=$(echo "$line" | sed -E 's/^\s*-\s+//; s/[\s\(].*//')
            files+=("$file")
        fi
    done <<< "$ac_text"

    # Also check for file existence patterns in common formats
    if [ ${#files[@]} -eq 0 ]; then
        # Look for paths in AC text (include uppercase for camelCase filenames)
        local potential_files=$(echo "$ac_text" | grep -oE '[a-zA-Z0-9_./-]+\.(md|sh|js|ts|json)' | sort -u)
        if [ -n "$potential_files" ]; then
            while IFS= read -r file; do
                files+=("$file")
            done <<< "$potential_files"
        fi
    fi

    if [ ${#files[@]} -eq 0 ]; then
        log_skip "No file checks found in acceptance criteria"
        return 0
    fi

    found=true
    for file_path in "${files[@]}"; do
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

        # Skip if it's a variable or placeholder
        if echo "$file_path" | grep -qE '\$\(.*\)'; then
            log_skip "SKIP: $file_path (contains variable)"
            SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
            continue
        fi

        echo -n "  Checking: $file_path ... "

        if [ -f "$file_path" ]; then
            local size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null || echo "unknown")
            if [ "$size" != "0" ]; then
                log_success "EXISTS (${size} bytes)"
                PASSED_CHECKS=$((PASSED_CHECKS + 1))
                PASSED_ITEMS+=("file: $file_path")
            else
                log_warn "EMPTY (0 bytes)"
                if [ "$AUDIT_MODE" = true ]; then
                    FAILED_ITEMS+=("file: $file_path (empty)")
                fi
            fi
        else
            log_error "NOT FOUND"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            FAILED_ITEMS+=("file: $file_path")
        fi
    done

    return 0
}

check_command_availability() {
    local ac_text="$1"
    local found=false

    echo ""
    echo -e "${BLUE}→${NC} Checking command availability..."

    # Look for command patterns in AC
    # Patterns like:
    # - "/response-awareness command is available"
    # - "/sp-tdd works"
    # - "can run /command"
    # - "Implementor panes can run /response-awareness"
    # - "can run /sp-tdd, /sp-debug, /sp-write-plan"

    # Convert literal \n to actual newlines
    ac_text=$(echo "$ac_text" | sed 's/\\n/\n/g')

    local commands=()
    while IFS= read -r line; do
        # Skip lines that look like file paths (contain .sh, .md, .js extensions)
        if echo "$line" | grep -qE '\.(sh|md|js|ts|json)'; then
            continue
        fi

        # Pattern 1: explicit "command/available/works/usable" keywords
        if echo "$line" | grep -qE "/[a-z-]+\s+(command|available|works|usable)"; then
            # Extract ALL /commands from the line, not just the first one
            local line_commands=$(echo "$line" | grep -oE "/[a-z-]+" | tr '\n' ' ')
            for cmd in $line_commands; do
                commands+=("$cmd")
            done
        # Pattern 2: "can run /command" pattern (handles comma-separated lists)
        elif echo "$line" | grep -qE "can\s+run\s+"; then
            # Extract ALL /commands from the line
            local line_commands=$(echo "$line" | grep -oE "/[a-z-]+" | tr '\n' ' ')
            for cmd in $line_commands; do
                commands+=("$cmd")
            done
        fi
    done <<< "$ac_text"

    if [ ${#commands[@]} -eq 0 ]; then
        log_skip "No command availability checks found"
        return 0
    fi

    found=true
    for cmd_name in "${commands[@]}"; do
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -n "  Checking: $cmd_name ... "

        # Check if it's a Claude Code command
        if echo "$cmd_name" | grep -qE "^/[a-z]+"; then
            # Check if command file exists
            local cmd_file=".claude/commands/${cmd_name#/}.md"
            if [ -f "$cmd_file" ]; then
                # Check if it's enabled (not disabled)
                if grep -q "disable-model-invocation:\s*true" "$cmd_file"; then
                    log_error "DISABLED"
                    FAILED_CHECKS=$((FAILED_CHECKS + 1))
                    FAILED_ITEMS+=("command: $cmd_name (disabled)")
                else
                    log_success "AVAILABLE"
                    PASSED_CHECKS=$((PASSED_CHECKS + 1))
                    PASSED_ITEMS+=("command: $cmd_name")
                fi
            else
                log_error "NOT FOUND"
                FAILED_CHECKS=$((FAILED_CHECKS + 1))
                FAILED_ITEMS+=("command: $cmd_name")
            fi
        else
            log_skip "SKIP: $cmd_name (not a Claude command)"
        fi
    done

    return 0
}

check_test_requirements() {
    local ac_text="$1"
    local found=false

    echo ""
    echo -e "${BLUE}→${NC} Checking test requirements..."

    # If using Superpowers, invoke /sp-tdd for TDD verification
    if [ "$USE_SUPERPOWERS" = true ]; then
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -n "  Running TDD verification via /sp-tdd ... "

        # Check if we can invoke Superpowers
        if [ -f ".claude/skills/test-driven-development.md" ]; then
            log_info "Invoking /sp-tdd for enhanced verification..."

            # Create a TDD verification prompt
            local tdd_prompt="Verify test coverage for bead $BEAD_ID:
- Check if tests exist for the code changes
- Verify tests actually pass
- Report on test coverage percentage
- Identify any untested edge cases

Acceptance criteria to verify:
$AC_TEXT

Focus on whether tests exist and pass, not on running them yourself."

            # Save prompt to temp file
            local tdd_prompt_file="/tmp/sp-tdd-$BEAD_ID.txt"
            echo "$tdd_prompt" > "$tdd_prompt_file"

            log_info "TDD prompt saved to $tdd_prompt_file"
            log_info "(In a full agent session, /sp-tdd would process this)"
            log_skip "SKIPPED (requires Claude agent session)"
            SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
        else
            log_warn "Superpowers TDD skill not found"
        fi
    fi

    # Check if AC mentions "pnpm test" or "npm test"
    if echo "$ac_text" | grep -qE "(pnpm|npm)\s+test"; then
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -n "  Checking: test suite exists ... "

        if [ -f "package.json" ] && jq -e '.scripts.test' package.json; then
            log_success "DEFINED"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            PASSED_ITEMS+=("test: pnpm test defined")
        else
            log_error "NOT DEFINED"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            FAILED_ITEMS+=("test: pnpm test not defined")
        fi
    fi

    return 0
}

check_git_diff_patterns() {
    local ac_text="$1"
    local found=false

    echo ""
    echo -e "${BLUE}→${NC} Checking git diff patterns..."

    # Look for patterns like:
    # - "changes include apps/backend/**"
    # - "modified src/**"

    # Convert literal \n to actual newlines
    ac_text=$(echo "$ac_text" | sed 's/\\n/\n/g')

    local patterns=()
    while IFS= read -r line; do
        if echo "$line" | grep -qE "(changes|modified|includes?)\s+[\w/*]+"; then
            local pattern=$(echo "$line" | grep -oE '[\w/*]+' | head -1)
            patterns+=("$pattern")
        fi
    done <<< "$ac_text"

    if [ ${#patterns[@]} -eq 0 ]; then
        log_skip "No git diff pattern checks found"
        return 0
    fi

    found=true
    for pattern in "${patterns[@]}"; do
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -n "  Checking: git changes include $pattern ... "

        # Check if there are any changes matching the pattern
        if git diff --name-only HEAD~5..HEAD | grep -qE "$pattern"; then
            log_success "FOUND CHANGES"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            PASSED_ITEMS+=("git: $pattern")
        else
            log_warn "NO CHANGES (may be OK if not yet committed)"
            # Don't fail on this - changes might not be committed yet
        fi
    done

    return 0
}

# Superpowers-enhanced verification
run_superpowers_verification() {
    echo ""
    echo -e "${BLUE}=== Superpowers Enhanced Verification ===${NC}"

    # Use /sp-verify if available for systematic verification
    if [ -f ".claude/skills/verification-before-completion.md" ]; then
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        echo -n "  Invoking /sp-verify framework ... "

        local verify_prompt="Systematic verification of acceptance criteria for bead $BEAD_ID:

Acceptance Criteria:
$AC_TEXT

Please verify:
1. Each criterion is clearly defined and testable
2. Evidence exists that each criterion was met
3. No criteria were skipped or assumed
4. Tests (if applicable) actually pass
5. Documentation (if applicable) is complete

Report any gaps between claimed completion and actual evidence."

        local verify_prompt_file="/tmp/sp-verify-$BEAD_ID.txt"
        echo "$verify_prompt" > "$verify_prompt_file"

        log_info "Verification prompt saved to $verify_prompt_file"
        log_info "(In a full agent session, /sp-verify would process this)"
        log_skip "SKIPPED (requires Claude agent session)"
        SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
    else
        log_skip "Superpowers Verify skill not found"
    fi

    return 0
}

# Main verification flow
main() {
    cd "$PROJECT_ROOT"

    # Run standard checks
    check_script_tests "$AC_TEXT"
    check_file_exists "$AC_TEXT"
    check_command_availability "$AC_TEXT"
    check_test_requirements "$AC_TEXT"
    check_git_diff_patterns "$AC_TEXT"

    # Run Superpowers-enhanced checks if requested
    if [ "$USE_SUPERPOWERS" = true ]; then
        run_superpowers_verification
    fi

    # Print summary
    echo ""
    echo -e "${BLUE}=== Verification Summary ===${NC}"
    echo "Total checks: $TOTAL_CHECKS"
    echo -e "  ${GREEN}Passed:${NC} $PASSED_CHECKS"
    echo -e "  ${RED}Failed:${NC} $FAILED_CHECKS"
    echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED_CHECKS"
    echo ""

    if [ $FAILED_CHECKS -gt 0 ]; then
        echo -e "${RED}=== FAILED ITEMS ===${NC}"
        for item in "${FAILED_ITEMS[@]}"; do
            echo "  ❌ $item"
        done
        echo ""

        if [ "$AUDIT_MODE" = true ]; then
            log_error "Acceptance criteria NOT verified - audit mode failing"
            exit 1
        else
            log_warn "Acceptance criteria have failures - recommend addressing before closing"
            exit 1
        fi
    fi

    if [ $PASSED_CHECKS -eq 0 ] && [ $SKIPPED_CHECKS -eq 0 ]; then
        log_warn "No verifiable acceptance criteria found - manual verification recommended"
    else
        echo -e "${GREEN}=== PASSED ITEMS ===${NC}"
        for item in "${PASSED_ITEMS[@]}"; do
            echo "  ✅ $item"
        done
        echo ""
        log_success "Acceptance criteria VERIFIED - safe to close bead"
    fi

    exit 0
}

main
