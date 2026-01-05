#!/bin/bash

# MAF CI Gate Demo Script
# Demonstrates all gate scenarios for evidence collection

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"

echo "🚀 MAF CI Review Gates Demo"
echo "============================"
echo

# Function to run gate and display results
run_gate() {
    local scenario="$1"
    local file="$2"
    
    echo "📋 Scenario: $scenario"
    echo "📁 Input: $file"
    echo "---"
    
    if [ ! -f "$file" ]; then
        echo "❌ File not found: $file"
        return 1
    fi
    
    # Run gate and capture output
    echo "🔄 Running gate..."
    if npm run maf:ci:gate -- --input "$file" 2>/dev/null; then
        local output=$(npm run maf:ci:gate -- --input "$file" 2>/dev/null)
        local exit_code=0
    else
        local output=$(npm run maf:ci:gate -- --input "$file" 2>&1 || true)
        local exit_code=$?
    fi
    
    # Parse and display results
    if command -v jq >/dev/null 2>&1; then
        local success=$(echo "$output" | jq -r '.success // "error"')
        local code=$(echo "$output" | jq -r '.code // "unknown"')
        local reason=$(echo "$output" | jq -r '.reason // "none"')
        local escalation=$(echo "$output" | jq -r '.escalationRecommended // false')
        
        case "$success" in
            "true")
                echo "✅ PASS (code $code)"
                [ "$escalation" = "true" ] && echo "⚠️  Escalation recommended"
                ;;
            "false")
                echo "❌ FAIL (code $code): $reason"
                ;;
            "error")
                echo "❌ ERROR: Invalid output format"
                ;;
        esac
    else
        echo "📄 Output: $output"
    fi
    
    echo
    echo "Press Enter to continue..."
    read -r
    echo
}

# Check if gate script exists
if [ ! -f "$SCRIPT_DIR/review-gates.ts" ]; then
    echo "❌ Gate script not found: $SCRIPT_DIR/review-gates.ts"
    exit 1
fi

# Check if fixtures exist
if [ ! -d "$FIXTURES_DIR" ]; then
    echo "❌ Fixtures directory not found: $FIXTURES_DIR"
    exit 1
fi

echo "🎯 This demo will run the MAF CI review gate against various scenarios."
echo "📊 Each scenario shows different gate behaviors and exit codes."
echo

# Demo scenarios
run_gate "Basic Approval" "$FIXTURES_DIR/basic-approval.json"
run_gate "Escalation Required" "$FIXTURES_DIR/escalation-required.json"
run_gate "High Risk (GPT-5 Required)" "$FIXTURES_DIR/high-risk-gpt5-required.json"
run_gate "Blocking Issues" "$FIXTURES_DIR/blocking-issues.json"

# Test error scenarios
echo "🔧 Error Scenarios"
echo "=================="
echo

run_gate "Missing Data" "$FIXTURES_DIR/missing-data.json"

echo "📝 Invalid JSON Test"
echo "Running gate with invalid JSON (expected to fail)..."
if npm run maf:ci:gate -- --input "$FIXTURES_DIR/invalid-json.json" 2>/dev/null; then
    echo "❌ Unexpected success with invalid JSON"
else
    echo "✅ Correctly rejected invalid JSON"
fi
echo

echo "🏁 Demo Complete!"
echo "=================="
echo
echo "📚 Next Steps:"
echo "1. Review the sample JSON files in $FIXTURES_DIR"
echo "2. Check the comprehensive README: $SCRIPT_DIR/README.md"
echo "3. Examine the GitHub Actions workflow: $SCRIPT_DIR/github-actions-workflow.yml"
echo "4. Run unit tests: npm test -- lib/maf/__tests__/ci-gate.test.ts"
echo
echo "🔍 Gate Implementation:"
echo "- CLI: $SCRIPT_DIR/review-gates.ts"
echo "- Tests: lib/maf/__tests__/ci-gate.test.ts (46 tests)"
echo "- Evidence: SQLite integration with fallback"
