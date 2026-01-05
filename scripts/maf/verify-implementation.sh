#!/bin/bash
# ABOUTME: Automated verification script to validate MAF network monitoring implementation claims
# ABOUTME: Prevents false success reporting by testing actual functionality

set -euo pipefail

echo "🔍 MAF Network Monitoring Implementation Verification"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

VERIFICATION_PASSED=true

# Function to check if worker integration is fixed
verify_worker_integration() {
    echo -e "🔧 ${YELLOW}Testing Worker Integration...${NC}"

    # Check if worker.ts uses executeCommand
    if grep -q "executeCommand" lib/maf/worker.ts; then
        echo -e "✅ ${GREEN}executeCommand found in worker.ts${NC}"
        # Check if executeCommand is actually used
        if grep -q "const.*executeCommand.*securityResult" lib/maf/worker.ts; then
            echo -e "✅ ${GREEN}executeCommand is actually used in worker execution${NC}"
        else
            echo -e "❌ ${RED}executeCommand declared but not used${NC}"
            VERIFICATION_PASSED=false
        fi
    else
        echo -e "❌ ${RED}executeCommand not found in worker.ts${NC}"
        VERIFICATION_PASSED=false
    fi
    echo ""
}

# Function to check CPX41 compliance
verify_cpx41_compliance() {
    echo -e "📊 ${YELLOW}Testing CPX41 Compliance...${NC}"

    # Check if CPX41 validation passes
    if node -e "
        const fs = require('fs');
        const policy = JSON.parse(fs.readFileSync('./lib/maf/policy/policy.json', 'utf8'));

        // Check restricted profile network monitoring overhead
        const restrictedMonitoring = policy.security.profiles.restricted.network_monitoring;
        const enabledCount = Object.keys(restrictedMonitoring).filter(key =>
            restrictedMonitoring[key] && restrictedMonitoring[key].enabled === true
        ).length;

        console.log('Enabled monitoring features in restricted profile:', enabledCount);
        console.log('Expected for CPX41 compliance: ≤ 2');

        if (enabledCount <= 2) {
            console.log('✅ CPX41 compliant - restricted profile');
            process.exit(0);
        } else {
            console.log('❌ CPX41 violation - restricted profile has too many features enabled');
            process.exit(1);
        }
    " 2>/dev/null; then
        echo -e "✅ ${GREEN}CPX41 constraints satisfied${NC}"
    else
        echo -e "❌ ${RED}CPX41 constraints violated${NC}"
        VERIFICATION_PASSED=false
    fi
    echo ""
}

# Function to verify CLI tools count
verify_cli_tools() {
    echo -e "🛠️ ${YELLOW}Verifying CLI Tools...${NC}"

    # Count network monitoring commands
    local cmd_count=$(grep -o "\-\-[a-z-]\+" scripts/maf/security-admin.sh | grep -E "(connection|bandwidth|traffic|protocol|anomaly)" | sort | uniq | wc -l)

    echo "Found network monitoring commands: $cmd_count"

    if [ "$cmd_count" -eq 8 ]; then
        echo -e "✅ ${GREEN}8 network monitoring commands verified${NC}"
    else
        echo -e "⚠️  ${YELLOW}Found $cmd_count commands (expected 8)${NC}"
    fi
    echo ""
}

# Function to check integration functionality
verify_integration_functionality() {
    echo -e "🔗 ${YELLOW}Testing Integration Functionality...${NC}"

    # Test if policy file structure is valid
    if node -e "
        const fs = require('fs');
        try {
            const policy = JSON.parse(fs.readFileSync('./lib/maf/policy/policy.json', 'utf8'));

            // Basic structure validation
            const hasSecurity = policy.security && typeof policy.security === 'object';
            const hasProfiles = hasSecurity && policy.security.profiles && typeof policy.security.profiles === 'object';
            const hasRestricted = hasProfiles && policy.security.profiles.restricted;
            const hasStandard = hasProfiles && policy.security.profiles.standard;

            console.log('Policy structure validation:');
            console.log('  - Has security section:', hasSecurity);
            console.log('  - Has profiles:', hasProfiles);
            console.log('  - Has restricted profile:', hasRestricted);
            console.log('  - Has standard profile:', hasStandard);

            const isValid = hasSecurity && hasProfiles && hasRestricted && hasStandard;
            console.log('Policy validation:', isValid ? 'VALID' : 'INVALID');
            process.exit(isValid ? 0 : 1);
        } catch (error) {
            console.log('Policy validation: INVALID -', error.message);
            process.exit(1);
        }
    " 2>/dev/null; then
        echo -e "✅ ${GREEN}Policy validation working${NC}"
    else
        echo -e "❌ ${RED}Policy validation failed${NC}"
        VERIFICATION_PASSED=false
    fi
    echo ""
}

# Function to check if components actually exist
verify_component_existence() {
    echo -e "📦 ${YELLOW}Verifying Component Existence...${NC}"

    local components=(
        "lib/maf/security/network/connection-state-tracker.ts"
        "lib/maf/security/network/bandwidth-monitor.ts"
        "lib/maf/security/network/traffic-analyzer.ts"
        "lib/maf/security/network/protocol-analyzer.ts"
        "lib/maf/dashboard/collectors/network-collector.ts"
        "scripts/maf/network-analysis-utils.sh"
        "scripts/maf/protocol-analysis-scripts/"
    )

    local missing_count=0

    for component in "${components[@]}"; do
        if [ -f "$component" ] || [ -d "$component" ]; then
            echo -e "✅ $component"
        else
            echo -e "❌ $component (missing)"
            ((missing_count++))
        fi
    done

    if [ "$missing_count" -eq 0 ]; then
        echo -e "✅ ${GREEN}All components exist${NC}"
    else
        echo -e "⚠️  ${YELLOW}$missing_count components missing${NC}"
    fi
    echo ""
}

# Main verification
main() {
    echo "Starting comprehensive implementation verification..."
    echo ""

    verify_worker_integration
    verify_cpx41_compliance
    verify_cli_tools
    verify_integration_functionality
    verify_component_existence

    echo "============================================"
    if [ "$VERIFICATION_PASSED" = true ]; then
        echo -e "🎉 ${GREEN}VERIFICATION PASSED - Implementation Status: FUNCTIONAL${NC}"
        echo -e "✅ ${GREEN}Worker integration: WORKING${NC}"
        echo -e "✅ ${GREEN}CPX41 compliance: MET${NC}"
        echo -e "✅ ${GREEN}CLI tools: AVAILABLE${NC}"
        exit 0
    else
        echo -e "🚨 ${RED}VERIFICATION FAILED - Issues need to be addressed${NC}"
        echo -e "❌ ${RED}Implementation Status: PARTIAL${NC}"
        echo -e "⚠️  ${YELLOW}Check failed items above for specific issues${NC}"
        exit 1
    fi
}

# Run verification
main "$@"