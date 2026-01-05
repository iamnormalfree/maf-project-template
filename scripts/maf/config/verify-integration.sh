#!/bin/bash
# ABOUTME: Comprehensive verification of MAF agent configuration integration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Project root and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
CONFIG_FILE="${CONFIG_FILE:-$PROJECT_ROOT/.maf/config/default-agent-config.json}"
SCHEMA_FILE="${SCHEMA_FILE:-$PROJECT_ROOT/.maf/config/agent-config-schema.json}"

echo -e "${BLUE}MAF Agent Configuration Integration Verification${NC}"
echo "================================================="
echo ""

# Track success/failure
SUCCESS_COUNT=0
TOTAL_COUNT=0

# Helper function to report status
report() {
    local test_name="$1"
    local status="$2"
    local message="${3:-}"
    
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    
    if [[ "$status" == "success" ]]; then
        echo -e "  ${GREEN}✅${NC} $test_name"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "  ${RED}❌${NC} $test_name"
        if [[ -n "$message" ]]; then
            echo -e "     ${RED}$message${NC}"
        fi
    fi
}

echo -e "${YELLOW}1. Configuration Files${NC}"
echo "========================"

# Check configuration file exists
if [[ -f "$CONFIG_FILE" ]]; then
    report "Configuration file exists" "success"
else
    report "Configuration file exists" "failure" "File not found: $CONFIG_FILE"
fi

# Check schema file exists
if [[ -f "$SCHEMA_FILE" ]]; then
    report "Schema file exists" "success"
else
    report "Schema file exists" "failure" "File not found: $SCHEMA_FILE"
fi

# Validate JSON syntax
if python3 -m json.tool "$CONFIG_FILE" > /dev/null 2>&1; then
    report "Configuration JSON valid" "success"
else
    report "Configuration JSON valid" "failure" "Invalid JSON syntax"
fi

if python3 -m json.tool "$SCHEMA_FILE" > /dev/null 2>&1; then
    report "Schema JSON valid" "success"
else
    report "Schema JSON valid" "failure" "Invalid JSON syntax"
fi

# Check configuration structure
if command -v jq &> /dev/null; then
    # Check required sections
    required_sections=("version" "metadata" "agent_types" "session_layouts" "integration_settings" "defaults")
    for section in "${required_sections[@]}"; do
        if jq -e ".\"$section\"" "$CONFIG_FILE" > /dev/null 2>&1; then
            report "Configuration has $section section" "success"
        else
            report "Configuration has $section section" "failure" "Missing required section"
        fi
    done
    
    # Check agent types
    agent_types=$(jq -r '.agent_types | keys[]' "$CONFIG_FILE" 2>/dev/null || echo "")
    expected_types=("claude-worker" "claude-committer" "codex-reviewer" "coordinator")
    for agent_type in "${expected_types[@]}"; do
        if echo "$agent_types" | grep -q "^$agent_type$"; then
            report "Agent type $agent_type defined" "success"
        else
            report "Agent type $agent_type defined" "failure" "Missing agent type"
        fi
    done
    
    # Check session layouts
    layouts=$(jq -r '.session_layouts | keys[]' "$CONFIG_FILE" 2>/dev/null || echo "")
    expected_layouts=("default_4_pane" "focused_3_pane" "minimal_2_pane")
    for layout in "${expected_layouts[@]}"; do
        if echo "$layouts" | grep -q "^$layout$"; then
            report "Layout $layout defined" "success"
        else
            report "Layout $layout defined" "failure" "Missing layout"
        fi
    done
else
    report "jq available for validation" "failure" "Install jq for detailed validation"
fi

echo ""
echo -e "${YELLOW}2. Integration Scripts${NC}"
echo "=========================="

# Check utility scripts
scripts=("demo-config.sh" "load-config-example.sh" "start-maf-with-config.sh")
for script in "${scripts[@]}"; do
    if [[ -f "$SCRIPT_DIR/$script" ]]; then
        report "Script $script exists" "success"
        if [[ -x "$SCRIPT_DIR/$script" ]]; then
            report "Script $script executable" "success"
        else
            report "Script $script executable" "failure" "Script not executable"
        fi
    else
        report "Script $script exists" "failure" "Script not found"
    fi
done

echo ""
echo -e "${YELLOW}3. Integration Tests${NC}"
echo "===================="

# Test configuration loading
if [[ -x "$SCRIPT_DIR/load-config-example.sh" ]]; then
    if output=$("$SCRIPT_DIR/load-config-example.sh" claude-worker 2>&1); then
        if echo "$output" | grep -q "Configuration loaded successfully"; then
            report "Configuration loading works" "success"
        else
            report "Configuration loading works" "failure" "Configuration loading failed"
        fi
    else
        report "Configuration loading works" "failure" "Script execution failed"
    fi
fi

# Test demo script
if [[ -x "$SCRIPT_DIR/demo-config.sh" ]]; then
    if output=$("$SCRIPT_DIR/demo-config.sh" 2>&1); then
        if echo "$output" | grep -q "Configuration is ready for use"; then
            report "Demo script works" "success"
        else
            report "Demo script works" "failure" "Demo script failed"
        fi
    else
        report "Demo script works" "failure" "Demo script execution failed"
    fi
fi

# Test session starter
if [[ -x "$SCRIPT_DIR/start-maf-with-config.sh" ]]; then
    if output=$("$SCRIPT_DIR/start-maf-with-config.sh" layouts 2>&1); then
        if echo "$output" | grep -q "Available layouts"; then
            report "Session starter works" "success"
        else
            report "Session starter works" "failure" "Session starter failed"
        fi
    else
        report "Session starter works" "failure" "Session starter execution failed"
    fi
fi

echo ""
echo -e "${YELLOW}4. Path Integration${NC}"
echo "===================="

# Check integration with agent-utils.sh paths
if [[ -f "$PROJECT_ROOT/scripts/maf/lib/agent-utils.sh" ]]; then
    agent_config_dir=$(grep "AGENT_CONFIG_DIR=" "$PROJECT_ROOT/scripts/maf/lib/agent-utils.sh" | cut -d'=' -f2 | tr -d '"')
    if [[ "$agent_config_dir" == "\$PROJECT_ROOT/.maf/config" ]]; then
        report "agent-utils.sh config path matches" "success"
    else
        report "agent-utils.sh config path matches" "failure" "Path mismatch: $agent_config_dir"
    fi
else
    report "agent-utils.sh exists" "failure" "File not found"
fi

# Check .maf directory structure
if [[ -d "$PROJECT_ROOT/.maf" ]]; then
    report ".maf directory exists" "success"
    if [[ -d "$PROJECT_ROOT/.maf/config" ]]; then
        report ".maf/config directory exists" "success"
    else
        report ".maf/config directory exists" "failure" "Config directory missing"
    fi
else
    report ".maf directory exists" "failure" "MAF directory missing"
fi

echo ""
echo -e "${YELLOW}5. Documentation${NC}"
echo "==============="

# Check documentation files
docs=("README.md" "INTEGRATION_SUMMARY.md")
for doc in "${docs[@]}"; do
    if [[ -f "$SCRIPT_DIR/$doc" ]]; then
        report "Documentation $doc exists" "success"
    else
        report "Documentation $doc exists" "failure" "Documentation missing"
    fi
done

echo ""
echo -e "${YELLOW}6. Verification Summary${NC}"
echo "========================"

echo "Tests passed: $SUCCESS_COUNT / $TOTAL_COUNT"
echo ""

if [[ $SUCCESS_COUNT -eq $TOTAL_COUNT ]]; then
    echo -e "${GREEN}🎉 All verification tests passed!${NC}"
    echo -e "${GREEN}   MAF agent configuration is fully integrated and ready for use.${NC}"
else
    echo -e "${RED}⚠️  Some verification tests failed.${NC}"
    echo -e "${RED}   Please review the failures above before using the configuration system.${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Fix any failed tests above"
    echo "2. Run the verification again"
    echo "3. Test with: ./scripts/maf/config/demo-config.sh"
    echo "4. Start a session: ./scripts/maf/config/start-maf-with-config.sh"
fi

echo ""
echo -e "${BLUE}Configuration System Status: ${NC}$([ $SUCCESS_COUNT -eq $TOTAL_COUNT ] && echo "${GREEN}READY${NC}" || echo "${RED}NEEDS ATTENTION${NC}")"
