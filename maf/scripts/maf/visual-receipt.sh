#!/bin/bash
# MAF Visual Receipt Generator for UI-Related Beads
# Generates deterministic screenshots for visual verification
#
# Usage:
#   visual-receipt.sh <bead_id> [--mode <dark|light|both>] [--device <desktop|mobile|both>]
#
# Options:
#   --mode     Color mode: dark, light, or both (default: both)
#   --device   Device: desktop, mobile, or both (default: both)
#   --url      Custom URL to screenshot (default: from BEAD_URL env or localhost:3000)
#   --page     Specific page path (default: from bead context or root)
#
# Screenshots stored under: docs/screenshots/beads/<bead-id>/
#
# Device Viewports:
#   - Desktop: 1920x911 (standard desktop)
#   - Mobile: 375x667 (iPhone SE)
#
# Examples:
#   visual-receipt.sh roundtable-abc-123
#   visual-receipt.sh roundtable-abc-123 --mode dark --device desktop
#   visual-receipt.sh roundtable-abc-123 --url https://staging.example.com --page /app/circles

set -e

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
BEAD_ID=""
MODE="both"          # dark, light, or both
DEVICE="both"        # desktop, mobile, or both
BASE_URL="${BEAD_URL:-http://localhost:3000}"
PAGE_PATH="/"
SCREENSHOT_DIR="docs/screenshots/beads"
PLAYWRIGHT_NODE="${PLAYWRIGHT_NODE:-node}"

# Viewport configurations
DESKTOP_WIDTH=1920
DESKTOP_HEIGHT=911
MOBILE_WIDTH=375
MOBILE_HEIGHT=667

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --device)
            DEVICE="$2"
            shift 2
            ;;
        --url)
            BASE_URL="$2"
            shift 2
            ;;
        --page)
            PAGE_PATH="$2"
            shift 2
            ;;
        -*)
            echo -e "${RED}Error: Unknown option: $1${NC}" >&2
            echo "Usage: $0 <bead_id> [--mode dark|light|both] [--device desktop|mobile|both] [--url URL] [--page PATH]" >&2
            exit 1
            ;;
        *)
            if [ -z "$BEAD_ID" ]; then
                BEAD_ID="$1"
            else
                echo -e "${RED}Error: Multiple bead IDs provided${NC}" >&2
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate bead ID
if [ -z "$BEAD_ID" ]; then
    echo -e "${RED}Error: Bead ID required${NC}" >&2
    echo "Usage: $0 <bead_id> [--mode dark|light|both] [--device desktop|mobile|both] [--url URL] [--page PATH]" >&2
    exit 1
fi

# Validate mode
if [[ ! "$MODE" =~ ^(dark|light|both)$ ]]; then
    echo -e "${RED}Error: Invalid mode: $MODE (must be: dark, light, or both)${NC}" >&2
    exit 1
fi

# Validate device
if [[ ! "$DEVICE" =~ ^(desktop|mobile|both)$ ]]; then
    echo -e "${RED}Error: Invalid device: $DEVICE (must be: desktop, mobile, or both)${NC}" >&2
    exit 1
fi

# Check if bead touches UI paths (policy enforcement)
BeadsFile="${BEADS_FILE:-.beads/beads.jsonl}"
if [ -f "$BeadsFile" ]; then
    BEAD_DESC=$(jq -r "select(.id == \"$BEAD_ID\") | .description // empty" "$BeadsFile" 2>/dev/null || echo "")

    # Check if bead mentions UI paths
    if echo "$BEAD_DESC" | grep -qE "(apps/site/src|apps/backend/src/public|UI|frontend|screenshot)"; then
        echo -e "${BLUE}ℹ Bead touches UI paths - screenshots required per policy${NC}"
    else
        echo -e "${YELLOW}⚠ Bead may not require UI screenshots - verify with bead description${NC}"
    fi
fi

# Create screenshot directory
SCREENSHOT_OUTPUT_DIR="${SCREENSHOT_DIR}/${BEAD_ID}"
mkdir -p "$SCREENSHOT_OUTPUT_DIR"

echo -e "${BLUE}=== MAF Visual Receipt Generator ===${NC}"
echo -e "Bead ID: ${GREEN}${BEAD_ID}${NC}"
echo -e "Output Directory: ${GREEN}${SCREENSHOT_OUTPUT_DIR}${NC}"
echo -e "Base URL: ${GREEN}${BASE_URL}${NC}"
echo -e "Page Path: ${GREEN}${PAGE_PATH}${NC}"
echo ""

# Check if Node.js is available
if ! command -v node &>/dev/null; then
    echo -e "${RED}Error: Node.js not found. Install Node.js to use Playwright screenshot feature.${NC}" >&2
    exit 1
fi

# Check if Playwright is available (will install if needed)
check_playwright() {
    if ! node -e "require('playwright')" 2>/dev/null; then
        echo -e "${YELLOW}Playwright not found. Installing...${NC}"
        if [ -f "package.json" ] && grep -q "playwright" package.json; then
            pnpm install --filter playground playwright 2>/dev/null || npm install playwright
        else
            echo -e "${YELLOW}Installing Playwright globally...${NC}"
            npm install -g playwright
        fi

        # Install Playwright browsers
        echo -e "${YELLOW}Installing Playwright browsers...${NC}"
        npx playwright install chromium
    fi
}

# Generate Playwright script
generate_playwright_script() {
    local url="$1"
    local width="$2"
    local height="$3"
    local theme="$4"  # dark, light, or null
    local output="$5"

    cat <<EOF > /tmp/screenshot-$$.js
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-gpu', '--no-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: ${width}, height: ${height} },
        $(if [ "$theme" != "null" ]; then
            echo "colorScheme: '${theme}',"
        fi)
        deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    // Set up console logging for debugging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    try {
        console.log('Navigating to: ${url}');
        await page.goto('${url}', {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Wait for any animations to complete
        await page.waitForTimeout(1000);

        console.log('Taking screenshot: ${output}');
        await page.screenshot({
            path: '${output}',
            fullPage: false
        });

        console.log('Screenshot saved successfully');
    } catch (error) {
        console.error('Screenshot failed:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
EOF
}

# Take a single screenshot
take_screenshot() {
    local device="$1"
    local theme="$2"
    local width="$3"
    local height="$4"

    local theme_suffix=""
    if [ "$theme" != "null" ]; then
        theme_suffix="_${theme}"
    fi

    local filename="${BEAD_ID}_${device}_${width}x${height}${theme_suffix}.png"
    local output_path="${SCREENSHOT_OUTPUT_DIR}/${filename}"
    local full_url="${BASE_URL}${PAGE_PATH}"

    echo -e "  ${BLUE}→${NC} Screenshot: ${GREEN}${filename}${NC}"
    echo -e "     Device: ${device} (${width}x${height}), Theme: ${theme:-default}"

    generate_playwright_script "$full_url" "$width" "$height" "$theme" "$output_path"

    # Run the Playwright script from project directory to find playwright module
    local project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    if (cd "$project_root" && NODE_PATH="$project_root/node_modules" node /tmp/screenshot-$$.js); then
        echo -e "     ${GREEN}✓${NC} Saved: ${output_path}"
        rm -f /tmp/screenshot-$$.js
        return 0
    else
        echo -e "     ${RED}✗${NC} Failed to capture screenshot"
        rm -f /tmp/screenshot-$$.js
        return 1
    fi
}

# Main screenshot logic
echo -e "${BLUE}Checking Playwright installation...${NC}"
check_playwright
echo ""

FAILED=0
TOTAL=0

# Desktop screenshots
if [ "$DEVICE" = "desktop" ] || [ "$DEVICE" = "both" ]; then
    echo -e "${BLUE}=== Desktop Screenshots (${DESKTOP_WIDTH}x${DESKTOP_HEIGHT}) ===${NC}"

    if [ "$MODE" = "dark" ] || [ "$MODE" = "both" ]; then
        TOTAL=$((TOTAL + 1))
        take_screenshot "desktop" "dark" "$DESKTOP_WIDTH" "$DESKTOP_HEIGHT" || FAILED=$((FAILED + 1))
        echo ""
    fi

    if [ "$MODE" = "light" ] || [ "$MODE" = "both" ]; then
        TOTAL=$((TOTAL + 1))
        take_screenshot "desktop" "light" "$DESKTOP_WIDTH" "$DESKTOP_HEIGHT" || FAILED=$((FAILED + 1))
        echo ""
    fi
fi

# Mobile screenshots
if [ "$DEVICE" = "mobile" ] || [ "$DEVICE" = "both" ]; then
    echo -e "${BLUE}=== Mobile Screenshots (${MOBILE_WIDTH}x${MOBILE_HEIGHT}) ===${NC}"

    if [ "$MODE" = "dark" ] || [ "$MODE" = "both" ]; then
        TOTAL=$((TOTAL + 1))
        take_screenshot "mobile" "dark" "$MOBILE_WIDTH" "$MOBILE_HEIGHT" || FAILED=$((FAILED + 1))
        echo ""
    fi

    if [ "$MODE" = "light" ] || [ "$MODE" = "both" ]; then
        TOTAL=$((TOTAL + 1))
        take_screenshot "mobile" "light" "$MOBILE_WIDTH" "$MOBILE_HEIGHT" || FAILED=$((FAILED + 1))
        echo ""
    fi
fi

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Total screenshots: ${GREEN}${TOTAL}${NC}"
echo -e "Successful: ${GREEN}$((TOTAL - FAILED))${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "Failed: ${RED}${FAILED}${NC}"
    exit 1
else
    echo -e "${GREEN}All screenshots captured successfully!${NC}"
    echo -e ""
    echo -e "Screenshots saved to: ${GREEN}${SCREENSHOT_OUTPUT_DIR}${NC}"
    echo -e ""
    echo -e "To include in receipt.md, add:"
    echo -e "${BLUE}## Screenshots${NC}"
    echo -e ""
    for file in "${SCREENSHOT_OUTPUT_DIR}"/*.png; do
        if [ -f "$file" ]; then
            basename_file=$(basename "$file")
            echo -e "![${basename_file}](../../../${file})"
        fi
    done
fi

exit 0
