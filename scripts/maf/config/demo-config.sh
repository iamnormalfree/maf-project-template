#!/bin/bash
# ABOUTME: Demo script to showcase MAF agent configuration usage

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/default-agent-config.json"
SCHEMA_FILE="$SCRIPT_DIR/agent-config-schema.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}MAF Agent Configuration Demo${NC}"
echo "==============================="

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required for this demo${NC}"
    echo "Install with: sudo apt-get install jq (Ubuntu/Debian)"
    echo "Or: brew install jq (macOS)"
    exit 1
fi

# Validate configuration
echo -e "${YELLOW}1. Validating configuration...${NC}"
if python3 -m json.tool "$CONFIG_FILE" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Configuration JSON is valid${NC}"
else
    echo -e "${RED}❌ Configuration JSON is invalid${NC}"
    exit 1
fi

echo -e "${YELLOW}2. Configuration overview:${NC}"
echo "   Version: $(jq -r '.version' "$CONFIG_FILE")"
echo "   Description: $(jq -r '.metadata.description' "$CONFIG_FILE")"
echo "   NextNest Version: $(jq -r '.metadata.nextnest_version' "$CONFIG_FILE")"

echo -e "${YELLOW}3. Available agent types:${NC}"
jq -r '.agent_types | keys[]' "$CONFIG_FILE" | while read -r agent_type; do
    description=$(jq -r ".agent_types[\"$agent_type\"].description" "$CONFIG_FILE")
    capabilities=$(jq -r ".agent_types[\"$agent_type\"].capabilities | join(\", \")" "$CONFIG_FILE")
    echo "   - $agent_type: $description"
    echo "     Capabilities: $capabilities"
    echo ""
done

echo -e "${YELLOW}4. Available session layouts:${NC}"
jq -r '.session_layouts | keys[]' "$CONFIG_FILE" | while read -r layout; do
    description=$(jq -r ".session_layouts[\"$layout\"].description" "$CONFIG_FILE")
    pane_count=$(jq -r ".session_layouts[\"$layout\"].panes | length" "$CONFIG_FILE")
    echo "   - $layout: $description ($pane_count panes)"
done

echo -e "${YELLOW}5. Integration settings:${NC}"
echo "   Agent Mail: $(jq -r '.integration_settings.agent_mail.enabled' "$CONFIG_FILE")"
echo "   Beads Workflow: $(jq -r '.integration_settings.beads_workflow.enabled' "$CONFIG_FILE")"
echo "   Git Workflow: $(jq -r '.integration_settings.git_workflow.auto_branch_creation' "$CONFIG_FILE")"

echo -e "${YELLOW}6. Monitoring settings:${NC}"
echo "   Health Checks: $(jq -r '.monitoring.health_checks.enabled' "$CONFIG_FILE")"
echo "   Resource Monitoring: $(jq -r '.monitoring.resource_monitoring.enabled' "$CONFIG_FILE")"
echo "   Log Aggregation: $(jq -r '.monitoring.log_aggregation.enabled' "$CONFIG_FILE")"

echo -e "${YELLOW}7. Default settings:${NC}"
jq -r '.defaults | to_entries[] | "   \(.key): \(.value)"' "$CONFIG_FILE"

echo -e "${GREEN}8. Configuration is ready for use!${NC}"
echo ""
echo "To use this configuration with MAF:"
echo "   maf start --config $CONFIG_FILE --layout default_4_pane"
echo ""
echo "To modify configuration:"
echo "   cp $CONFIG_FILE my-config.json"
echo "   # Edit my-config.json as needed"
echo "   maf start --config my-config.json"
