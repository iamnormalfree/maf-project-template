#!/bin/bash
# List proposals with optional filtering
# Usage: list-proposals.sh [--status pending] [--creator Agent] [--classification strategic]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROPOSAL_MGR="$PROJECT_ROOT/lib/maf/governance/proposal-manager.mjs"

# Build filter arguments
FILTER_ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --status|--creator|--classification)
      FILTER_ARGS+=("$1" "$2")
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: list-proposals.sh [--status STATUS] [--creator CREATOR] [--classification CLASSIFICATION]" >&2
      exit 1
      ;;
  esac
done

# Get proposals
PROPOSALS=$(node "$PROPOSAL_MGR" list "${FILTER_ARGS[@]}")

# Count by status
TOTAL=$(echo "$PROPOSALS" | jq 'length')
PENDING=$(echo "$PROPOSALS" | jq '[.[] | select(.status == "pending")] | length')
APPROVED=$(echo "$PROPOSALS" | jq '[.[] | select(.status == "approved")] | length')
REJECTED=$(echo "$PROPOSALS" | jq '[.[] | select(.status == "rejected")] | length')

echo "📋 Proposals (Total: $TOTAL | Pending: $PENDING | Approved: $APPROVED | Rejected: $REJECTED)"
echo ""

# Format as table
echo "$PROPOSALS" | jq -r '.[] | [
  "\(.id)",
  "\(.status)",
  "\(.classification)",
  "\(.created_by)",
  "\(.title[:40])"
] | @tsv' | column -t -s $'\t'

echo ""
echo "Filtering: ${FILTER_ARGS[*]:-none}"

# Show pending proposals first if no filter
if [[ ${#FILTER_ARGS[@]} -eq 0 && $PENDING -gt 0 ]]; then
  echo ""
  echo "🔔 Pending Proposals:"
  echo "$PROPOSALS" | jq -r '.[] | select(.status == "pending") | [
    "\(.id)",
    "\(.classification)",
    "\(.created_by)",
    "\(.title)"
  ] | @tsv' | column -t -s $'\t' | head -10
fi
