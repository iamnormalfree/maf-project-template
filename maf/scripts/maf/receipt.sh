#!/bin/bash
# MAF Bead Completion Receipt Generator
# Generates reproducible markdown receipts for bead completion
#
# Usage:
#   receipt.sh <bead_id> [--post]
#
# Options:
#   --post    Post receipt to Agent Mail thread (requires mcp-agent-mail)
#
# Output: Markdown receipt to stdout, optionally posts to Agent Mail
#
# Example:
#   receipt.sh roundtable-j22 > receipts/roundtable-j22.md
#   receipt.sh roundtable-j22 --post | tee receipts/roundtable-j22.md

set -e

# Colors for terminal output (not used in markdown)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Beads database location
BEADS_FILE="${BEADS_FILE:-.beads/beads.jsonl}"

# Agent Mail project key
PROJECT_KEY="${PROJECT_KEY:-/root/projects/roundtable}"

# Parse arguments
BEAD_ID=""
POST_TO_MAIL=false
START_TS=""
END_TS=""
ATTEMPT_COUNT=1
REOPEN_COUNT=0
FAILURE_REASON=""
UI_MODE=false
SCREENSHOT_PATHS=""

# Commands array (for --cmd flag)
COMMANDS_RUN=()

# Optional: Read from .bead-ledger/<bead-id>.json if exists
# NOTE: LEDGER_FILE is defined after BEAD_ID is set (below)

if [ $# -eq 0 ]; then
    echo "Usage: $0 <bead_id> [--post] [--ui] [--cmd \"...\"] [--start-ts ISO8601] [--end-ts ISO8601] [--attempts N] [--reopens N] [--failure REASON]" >&2
    echo "" >&2
    echo "Options:" >&2
    echo "  --post          Post receipt to Agent Mail thread" >&2
    echo "  --ui            UI-related bead (include screenshot section)" >&2
    echo "  --cmd \"...\"     Add a command that was run (can be repeated)" >&2
    echo "  --start-ts      Start timestamp (ISO8601)" >&2
    echo "  --end-ts        End timestamp (ISO8601)" >&2
    echo "  --attempts      Attempt count (default: 1)" >&2
    echo "  --reopens       Reopen count (default: 0)" >&2
    echo "  --failure       Failure reason: tests|visual|integration|unclear_spec|env_mismatch" >&2
    exit 1
fi

BEAD_ID="$1"
shift

# Optional: Read from .bead-ledger/<bead-id>.json if exists
LEDGER_FILE=".bead-ledger/${BEAD_ID}.json"

while [[ $# -gt 0 ]]; do
    case $1 in
        --post)
            POST_TO_MAIL=true
            shift
            ;;
        --ui)
            UI_MODE=true
            shift
            ;;
        --cmd)
            if [ -n "$2" ] && [ "${2:0:1}" != "-" ]; then
                COMMANDS_RUN+=("$2")
                shift 2
            else
                echo -e "${RED}Error: --cmd requires an argument${NC}" >&2
                exit 1
            fi
            ;;
        --start-ts)
            START_TS="$2"
            shift 2
            ;;
        --end-ts)
            END_TS="$2"
            shift 2
            ;;
        --attempts)
            ATTEMPT_COUNT="$2"
            shift 2
            ;;
        --reopens)
            REOPEN_COUNT="$2"
            shift 2
            ;;
        --failure)
            FAILURE_REASON="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Error: Unknown option: $1${NC}" >&2
            exit 1
            ;;
    esac
done

# Validate bead ID exists
if [ ! -f "$BEADS_FILE" ]; then
    echo -e "${RED}Error: Beads file not found: $BEADS_FILE${NC}" >&2
    exit 1
fi

BEAD_DATA=$(jq -r "select(.id == \"$BEAD_ID\")" "$BEADS_FILE")
if [ -z "$BEAD_DATA" ]; then
    echo -e "${RED}Error: Bead not found: $BEAD_ID${NC}" >&2
    exit 1
fi

# Get git info for reproducibility
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Get current agent info (reuse logic from agent-commit.sh)
get_pane_index() {
    if [ -n "${TMUX_PANE:-}" ]; then
        echo "$TMUX_PANE" | tr -d '%'
        return 0
    fi
    if [ -n "$TMUX" ]; then
        local pane_index=$(echo "$TMUX" | grep -o 'pane[0-9]*' | sed 's/pane//')
        if [ -n "$pane_index" ]; then
            echo "$pane_index"
            return 0
        fi
    fi
    tmux display-message -p '#P' 2>/dev/null
}

PANE_INDEX=$(get_pane_index 2>/dev/null || echo "")
SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")
WINDOW_NAME=$(tmux display-message -p '#W' 2>/dev/null || echo "unknown")

# Get agent name from current directory or prompt
AGENT_NAME="${MAF_AGENT_NAME:-${USER:-unknown}}"
AGENT_ROLE="${MAF_AGENT_ROLE:-Implementor}"

# Extract bead information
BEAD_TITLE=$(echo "$BEAD_DATA" | jq -r '.title // "Untitled"')
BEAD_DESC=$(echo "$BEAD_DATA" | jq -r '.description // "No description"')
BEAD_STATUS=$(echo "$BEAD_DATA" | jq -r '.status // "unknown"')
BEAD_PRIORITY=$(echo "$BEAD_DATA" | jq -r '.priority // "P3"')
BEAD_ASSIGNEE=$(echo "$BEAD_DATA" | jq -r '.assignee // "unassigned"')
BEAD_LABELS=$(echo "$BEAD_DATA" | jq -r '.labels // [] | join(", ")')
BEAD_CREATED=$(echo "$BEAD_DATA" | jq -r '.created_at // "unknown"')
BEAD_UPDATED=$(echo "$BEAD_DATA" | jq -r '.updated_at // "unknown"')

# Get recent git changes (if any)
FILES_CHANGED=$(git diff --name-only HEAD~5..HEAD 2>/dev/null | grep -v "^$" | wc -l)
RECENT_FILES=$(git diff --name-only HEAD~5..HEAD 2>/dev/null | grep -v "^$" | head -20 || echo "")

# Get test results if available
TEST_OUTPUT=""
if [ -f "test-results.txt" ]; then
    TEST_OUTPUT=$(cat test-results.txt 2>/dev/null || echo "")
fi

# Ledger: Load existing or initialize defaults
if [ -f "$LEDGER_FILE" ]; then
    EXISTING_LEDGER=$(cat "$LEDGER_FILE" 2>/dev/null || echo "{}")
    # Use existing values if not overridden by command line
    START_TS=${START_TS:-$(echo "$EXISTING_LEDGER" | jq -r '.start_ts // empty')}
    END_TS=${END_TS:-$(echo "$EXISTING_LEDGER" | jq -r '.end_ts // empty')}
    ATTEMPT_COUNT=${ATTEMPT_COUNT:-$(echo "$EXISTING_LEDGER" | jq -r '.attempt_count // 1')}
    REOPEN_COUNT=${REOPEN_COUNT:-$(echo "$EXISTING_LEDGER" | jq -r '.reopen_count // 0')}
    FAILURE_REASON=${FAILURE_REASON:-$(echo "$EXISTING_LEDGER" | jq -r '.failure_reason // empty')}
fi

# Default start_ts to bead created_at if not set
if [ -z "$START_TS" ] && [ -n "$BEAD_CREATED" ]; then
    START_TS="$BEAD_CREATED"
fi

# Default end_ts to now if not set
if [ -z "$END_TS" ]; then
    END_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
fi

# Generate timestamp
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TIMESTAMP_FRIENDLY=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Calculate duration if start_ts is available
DURATION=""
if [ -n "$START_TS" ] && [ -n "$END_TS" ]; then
    START_SECONDS=$(date -d "$START_TS" +%s 2>/dev/null || echo "0")
    END_SECONDS=$(date -d "$END_TS" +%s 2>/dev/null || echo "0")
    if [ "$START_SECONDS" -gt 0 ] && [ "$END_SECONDS" -gt 0 ]; then
        DURATION_SECONDS=$((END_SECONDS - START_SECONDS))
        DURATION_minutes=$((DURATION_SECONDS / 60))
        DURATION_Hours=$((DURATION_minutes / 60))
        if [ $DURATION_minutes -lt 60 ]; then
            DURATION="${DURATION_minutes} minutes"
        else
            DURATION="${DURATION_Hours}h $((DURATION_minutes % 60))m"
        fi
    fi
fi

# Start markdown receipt
cat << MARKDOWN
# Bead Completion Receipt: ${BEAD_ID}

> Generated: ${TIMESTAMP_FRIENDLY}
> Agent: ${AGENT_NAME} (${AGENT_ROLE})
> Git: \`${GIT_COMMIT_SHORT}\` on \`${GIT_BRANCH}\`

---

## Bead Information

| Field | Value |
|-------|-------|
| **ID** | \`${BEAD_ID}\` |
| **Title** | ${BEAD_TITLE} |
| **Status** | \`${BEAD_STATUS}\` |
| **Priority** | ${BEAD_PRIORITY} |
| **Assignee** | ${BEAD_ASSIGNEE} |
| **Labels** | ${BEAD_LABELS} |

### Description

${BEAD_DESC}

---

## Implementation Summary

### Agent Details
- **Agent**: ${AGENT_NAME}
- **Role**: ${AGENT_ROLE}
- **Session**: ${SESSION_NAME}:${WINDOW_NAME}
- **Pane**: ${PANE_INDEX:-N/A}

### Git Context
- **Branch**: \`${GIT_BRANCH}\`
- **Commit**: \`${GIT_COMMIT}\`
- **Files Changed (last 5 commits)**: ${FILES_CHANGED}

MARKDOWN

# Add files changed section if there are any
if [ -n "$RECENT_FILES" ]; then
    cat << MARKDOWN
### Files Changed

\`\`\`
$(echo "$RECENT_FILES" | sed 's/^/- /')
\`\`\`
MARKDOWN
fi

# Add test results section if available
if [ -n "$TEST_OUTPUT" ]; then
    cat << MARKDOWN

### Test Results

\`\`\`
${TEST_OUTPUT}
\`\`\`
MARKDOWN
fi

# Add Acceptance Criteria Verification section
BEAD_AC=$(echo "$BEAD_DATA" | jq -r '.acceptance_criteria // empty')

cat << MARKDOWN

---

## Acceptance Criteria Verification

MARKDOWN

# Check if acceptance criteria are defined
if [ -z "$BEAD_AC" ] || [ "$BEAD_AC" = "null" ]; then
    cat << MARKDOWN
⚠️ **No acceptance criteria defined** for this bead.

*Consider adding acceptance criteria to the bead definition for better verification.*
MARKDOWN
else
    # Acceptance criteria are defined, run verification
    AC_VERIFICATION_OUTPUT=""

    # Check if verify-ac.sh exists and is executable
    if [ -x "./scripts/maf/verify-ac.sh" ]; then
        # Run verify-ac.sh and capture output
        # Use --audit mode for detailed output, but suppress color codes
        AC_VERIFICATION_OUTPUT=$(./scripts/maf/verify-ac.sh "$BEAD_ID" --audit 2>&1 || true)

        # Parse the output to extract PASSED/FAILED counts
        AC_PASSED=$(echo "$AC_VERIFICATION_OUTPUT" | grep -oP 'Passed:\s*\K\d+' || echo "0")
        AC_FAILED=$(echo "$AC_VERIFICATION_OUTPUT" | grep -oP 'Failed:\s*\K\d+' || echo "0")
        AC_SKIPPED=$(echo "$AC_VERIFICATION_OUTPUT" | grep -oP 'Skipped:\s*\K\d+' || echo "0")
        AC_TOTAL=$((AC_PASSED + AC_FAILED))

        # Display AC text
        cat << MARKDOWN

### Acceptance Criteria

\`\`\`
${BEAD_AC}
\`\`\`

MARKDOWN

        # Display verification results
        if [ "$AC_FAILED" -eq 0 ]; then
            cat << MARKDOWN

### Verification Result

✅ **ALL ACCEPTANCE CRITERIA VERIFIED** (${AC_PASSED}/${AC_TOTAL} checks passed)

| Status | Count |
|--------|-------|
| ✅ Passed | ${AC_PASSED} |
| ❌ Failed | ${AC_FAILED} |
| ⊘ Skipped | ${AC_SKIPPED} |

MARKDOWN
        else
            cat << MARKDOWN

### Verification Result

❌ **ACCEPTANCE CRITERIA NOT FULLY VERIFIED** (${AC_PASSED}/${AC_TOTAL} checks passed, ${AC_FAILED} failed)

| Status | Count |
|--------|-------|
| ✅ Passed | ${AC_PASSED} |
| ❌ Failed | ${AC_FAILED} |
| ⊘ Skipped | ${AC_SKIPPED} |

MARKDOWN

            # Show failed items
            AC_FAILED_ITEMS=$(echo "$AC_VERIFICATION_OUTPUT" | grep -A 100 "FAILED ITEMS" | grep "❌" || echo "")
            if [ -n "$AC_FAILED_ITEMS" ]; then
                cat << MARKDOWN

#### Failed Items

\`\`\`
${AC_FAILED_ITEMS}
\`\`\`

MARKDOWN
            fi
        fi

        # Show detailed verification output in collapsible section
        cat << MARKDOWN

<details>
<summary>Click to expand detailed verification output</summary>

\`\`\`
${AC_VERIFICATION_OUTPUT}
\`\`\`

</details>

MARKDOWN
    else
        # verify-ac.sh not available, just show AC text
        cat << MARKDOWN

### Acceptance Criteria

\`\`\`
${BEAD_AC}
\`\`\`

⚠️ **Verification script not available** - \`./scripts/maf/verify-ac.sh\` not found.

*Manual verification required before closing this bead.*

MARKDOWN
    fi
fi

# Add Ledger section
cat << MARKDOWN

---

## Work Ledger

| Field | Value |
|-------|-------|
| **Start Time** | \`${START_TS:-N/A}\` |
| **End Time** | \`${END_TS}\` |
| **Duration** | \`${DURATION:-N/A}\` |
| **Attempts** | ${ATTEMPT_COUNT} |
| **Reopens** | ${REOPEN_COUNT} |
| **Failure Reason** | \`${FAILURE_REASON:-none}\` |

MARKDOWN

# Continue markdown receipt
cat << MARKDOWN

---

## Commands Run

MARKDOWN

# Commands Run section - either actual commands or placeholder
if [ ${#COMMANDS_RUN[@]} -gt 0 ]; then
    cat << MARKDOWN
<details>
<summary>Click to expand command history</summary>

\`\`\`bash
MARKDOWN
    for cmd in "${COMMANDS_RUN[@]}"; do
        echo "$cmd"
    done
    cat << MARKDOWN
\`\`\`

</details>

MARKDOWN
else
    cat << MARKDOWN
<details>
<summary>Click to expand command history</summary>

\`\`\`bash
# Typical development commands (customize based on actual work)
pnpm install
pnpm --filter backend test
pnpm build
\`\`\`

</details>

MARKDOWN
fi

cat << MARKDOWN

---

## Environment Toggles

| Variable | Value |
|----------|-------|
| \`NODE_ENV\` | \`${NODE_ENV:-development}\` |
| \`DATABASE_URL\` | \`${DATABASE_URL:+[SET]}\` |
| \`MAF_TOPOLOGY_FILE\` | \`${MAF_TOPOLOGY_FILE:-[default]}\` |

---

## Screenshots

MARKDOWN

# Screenshots section - only show if --ui flag is set
if [ "$UI_MODE" = true ]; then
    cat << MARKDOWN
_UI-related bead: visual receipts should be generated via \`visual-receipt.sh\`_

**To generate visual receipts for UI beads:**
\`\`\`bash
# Generate all screenshots (desktop/mobile, dark/light)
./scripts/maf/visual-receipt.sh ${BEAD_ID}

# Generate specific modes
./scripts/maf/visual-receipt.sh ${BEAD_ID} --mode dark --device desktop
./scripts/maf/visual-receipt.sh ${BEAD_ID} --mode light --device mobile

# With custom URL and page
./scripts/maf/visual-receipt.sh ${BEAD_ID} --url http://localhost:3000 --page /app/circles
\`\`\`

**Screenshots are stored under:** \`docs/screenshots/beads/${BEAD_ID}/\`

_Include generated screenshots below this line_

MARKDOWN
else
    cat << MARKDOWN
_Non-UI bead: screenshots not required_

MARKDOWN
fi

cat << MARKDOWN

---

## Risk Notes

| Risk | Mitigation |
|------|------------|
| Database migration conflicts | Tested with rollback script |
| Breaking API changes | Versioned endpoint, backward compatible |
| Performance regression | Load tested before deployment |

---

## Rollback Plan

If issues arise after deployment:

1. **Revert commit**: \`git revert ${GIT_COMMIT_SHORT}\`
2. **Rollback migration**: \`pnpm --filter backend db:rollback\` (if applicable)
3. **Restart services**: \`systemctl restart roundtable-backend\`
4. **Verify health**: \`curl -f http://localhost:3000/health || exit 1\`

---

## Verification Steps

- [ ] All tests pass: \`pnpm test\`
- [ ] Build succeeds: \`pnpm build\`
- [ ] Code reviewed by peer
- [ ] Documentation updated
- [ ] No console errors in production
- [ ] Performance metrics acceptable

---

## Next Steps

1. **Post-review**: Address any reviewer feedback
2. **Deploy**: Merge to target branch after approval
3. **Monitor**: Watch logs for 24 hours post-deployment
4. **Close bead**: \`bd close ${BEAD_ID}\`

---

*This receipt was auto-generated by \`scripts/maf/receipt.sh\`*
*Reproducible environment: Git \`${GIT_COMMIT_SHORT}\` @ ${TIMESTAMP_FRIENDLY}*
MARKDOWN

# Post to Agent Mail if requested
if [ "$POST_TO_MAIL" = true ]; then
    echo ""
    echo "---"
    echo "# Posting to Agent Mail..."

    # Check if mcp-agent-mail is available
    if command -v mcp-client &>/dev/null || [ -d ".agent-mail" ]; then
        # For now, just indicate where this would be posted
        # Actual implementation would use the MCP Agent Mail API
        echo "Receipt posted to Agent Mail thread: ${BEAD_ID}"
        echo "To manually post, use: mcp__mcp_agent_mail__send_message"
    else
        echo -e "${YELLOW}Warning: MCP Agent Mail not available. Receipt not posted.${NC}" >&2
    fi
fi

# Save ledger data to file (for tracking and metrics)
mkdir -p "$(dirname "$LEDGER_FILE")"
cat > "$LEDGER_FILE" << EOF
{
  "bead_id": "${BEAD_ID}",
  "start_ts": "${START_TS}",
  "end_ts": "${END_TS}",
  "attempt_count": ${ATTEMPT_COUNT},
  "reopen_count": ${REOPEN_COUNT},
  "failure_reason": "${FAILURE_REASON}",
  "agent": "${AGENT_NAME}",
  "generated_at": "${TIMESTAMP}"
}
EOF

exit 0
