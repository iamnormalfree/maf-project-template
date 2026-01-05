#!/bin/bash
# ABOUTME: RA Helper Script - Simple Pipeline for attaching Response Awareness summaries to beads.
# ABOUTME: Reads from .maf/state/ra-summary/{bead-id}.md and outputs with bead reference formatting.

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RA_SUMMARY_DIR="$PROJECT_ROOT/.maf/state/ra-summary"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Show usage information
show_usage() {
    cat << EOF
RA Helper Script - Attach Response Awareness Summary to Beads

Usage: $(basename "$0") <bead-id> [options]

Arguments:
  bead-id        The bead ID to attach RA summary for

Options:
  -h, --help     Show this help message
  -v, --verbose  Enable verbose output
  -n, --no-update  Show summary but don't update bead
  -f, --format   Output format: text (default), json, markdown

Examples:
  $(basename "$0") bead-123                    # Attach RA summary for bead-123
  $(basename "$0") bead-123 --format markdown  # Output as markdown
  $(basename "$0") bead-123 --no-update        # Show summary without updating

EOF
}

# Validate bead ID format
validate_bead_id() {
    local bead_id="$1"
    if [[ ! "$bead_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid bead ID format: '$bead_id'"
        log_error "Bead IDs must contain only letters, numbers, hyphens, and underscores"
        return 1
    fi
}

# Check if RA summary file exists
check_ra_summary_exists() {
    local bead_id="$1"
    local ra_file="$RA_SUMMARY_DIR/$bead_id.md"
    
    if [[ ! -f "$ra_file" ]]; then
        log_error "RA summary file not found: $ra_file"
        log_warn "Available RA summaries:"
        if [[ -d "$RA_SUMMARY_DIR" ]] && [[ -n "$(ls -A "$RA_SUMMARY_DIR" 2>/dev/null)" ]]; then
            ls -1 "$RA_SUMMARY_DIR"/*.md 2>/dev/null | sed 's/.*\///' | sed 's/\.md$//' | while read -r file; do
                echo "  - $file"
            done
        else
            echo "  (none found)"
        fi
        return 1
    fi
}

# Read and format RA summary
format_ra_summary() {
    local bead_id="$1"
    local format="${2:-text}"
    local ra_file="$RA_SUMMARY_DIR/$bead_id.md"
    
    case "$format" in
        "json")
            format_as_json "$bead_id" "$ra_file"
            ;;
        "markdown")
            format_as_markdown "$bead_id" "$ra_file"
            ;;
        *)
            format_as_text "$bead_id" "$ra_file"
            ;;
    esac
}

# Format as plain text
format_as_text() {
    local bead_id="$1"
    local ra_file="$2"
    
    echo "=== Response Awareness Summary for $bead_id ==="
    echo ""
    cat "$ra_file"
    echo ""
    echo "=== End RA Summary ==="
}

# Format as JSON
format_as_json() {
    local bead_id="$1"
    local ra_file="$2"
    
    # Simple JSON extraction (basic implementation)
    local complexity_score=$(grep -A1 "Complexity Score" "$ra_file" | tail -1 | sed 's/.*: \([0-9]*\).*/\1/' || echo "unknown")
    local tier=$(grep -A1 "Tier:" "$ra_file" | tail -1 | sed 's/.*: //' | sed 's/\*\*//g' || echo "unknown")
    local confidence=$(grep -A1 "Confidence:" "$ra_file" | tail -1 | sed 's/.*: //' | sed 's/\*\*//g' || echo "unknown")
    
    cat << EOF
{
  "bead_id": "$bead_id",
  "ra_summary": {
    "complexity_score": "$complexity_score",
    "tier": "$tier",
    "confidence": "$confidence",
    "file_path": "$ra_file",
    "attached_at": "$(date -Iseconds)"
  }
}
EOF
}

# Format as markdown
format_as_markdown() {
    local bead_id="$1"
    local ra_file="$2"
    
    echo "# Response Awareness Summary"
    echo ""
    echo "**Bead ID:** \`$bead_id\`"
    echo "**Attached:** $(date '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""
    cat "$ra_file"
}

# Update bead with RA summary reference
update_bead() {
    local bead_id="$1"
    local ra_file="$RA_SUMMARY_DIR/$bead_id.md"
    
    log_info "Updating bead $bead_id with RA summary reference..."
    
    # Check if beads CLI is available
    if ! command -v bd &> /dev/null; then
        log_warn "Beads CLI (bd) not found - skipping bead update"
        log_warn "To install beads: npm install -g beads"
        return 0
    fi
    
    # Create summary note
    local note="RA summary attached from $ra_file ($(date '+%Y-%m-%d %H:%M:%S'))"
    
    # Update bead with note
    if bd update "$bead_id" --notes "$note" 2>/dev/null; then
        log_success "Successfully updated bead $bead_id with RA summary reference"
    else
        log_warn "Failed to update bead $bead_id (bead may not exist or bd not configured)"
        log_warn "Bead update command: bd update $bead_id --notes \"$note\""
    fi
}

# Main function
main() {
    local bead_id=""
    local format="text"
    local no_update=false
    local verbose=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -n|--no-update)
                no_update=true
                shift
                ;;
            -f|--format)
                format="$2"
                if [[ ! "$format" =~ ^(text|json|markdown)$ ]]; then
                    log_error "Invalid format: $format. Valid formats: text, json, markdown"
                    exit 1
                fi
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [[ -z "$bead_id" ]]; then
                    bead_id="$1"
                else
                    log_error "Multiple bead IDs provided. Only one bead ID allowed."
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Validate required arguments
    if [[ -z "$bead_id" ]]; then
        log_error "Bead ID is required"
        show_usage
        exit 1
    fi
    
    # Enable verbose output
    if [[ "$verbose" == true ]]; then
        set -x
        log_info "Verbose mode enabled"
    fi
    
    # Validate inputs
    validate_bead_id "$bead_id"
    check_ra_summary_exists "$bead_id"
    
    # Ensure RA summary directory exists
    if [[ ! -d "$RA_SUMMARY_DIR" ]]; then
        log_error "RA summary directory does not exist: $RA_SUMMARY_DIR"
        exit 1
    fi
    
    # Format and output RA summary
    log_info "Formatting RA summary for bead $bead_id (format: $format)"
    format_ra_summary "$bead_id" "$format"
    
    # Update bead if requested
    if [[ "$no_update" != true ]]; then
        update_bead "$bead_id"
    else
        log_info "Skipping bead update (--no-update specified)"
    fi
    
    log_success "RA summary processing completed for bead $bead_id"
}

# Error handling
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main function
main "$@"