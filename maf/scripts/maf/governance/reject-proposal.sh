#!/bin/bash
# Reject a proposal
# Usage: reject-proposal.sh <proposal-id> --reason "Reason for rejection"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROPOSAL_MGR="$PROJECT_ROOT/lib/maf/governance/proposal-manager.mjs"

REASON=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --reason)
      REASON="$2"
      shift 2
      ;;
    *)
      if [[ -z "$REASON" ]]; then
        PROPOSAL_ID="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "${PROPOSAL_ID:-}" ]]; then
  echo "Usage: reject-proposal.sh <proposal-id> --reason 'Reason for rejection'"
  exit 1
fi

if [[ -z "$REASON" ]]; then
  echo "Error: --reason is required" >&2
  exit 1
fi

# Read proposal
PROPOSAL=$(node "$PROPOSAL_MGR" read "$PROPOSAL_ID")

if [[ -z "$PROPOSAL" ]]; then
  echo "Error: Proposal not found: $PROPOSAL_ID" >&2
  exit 1
fi

# Check current status
STATUS=$(echo "$PROPOSAL" | jq -r '.status')
if [[ "$STATUS" != "pending" ]]; then
  echo "Error: Proposal is not pending (current status: $STATUS)" >&2
  exit 1
fi

CREATED_BY=$(echo "$PROPOSAL" | jq -r '.created_by')

# Update proposal status to rejected
node "$PROPOSAL_MGR" update "$PROPOSAL_ID" '{
  "status": "rejected",
  "reviewed_by": "'"$APPROVER:-GreenMountain"'"",
  "reviewed_at": "'$(date -Iseconds)'"",
  "review_decision": "rejected",
  "review_notes": "'"$REASON"'""
}'

echo "❌ Proposal rejected: $PROPOSAL_ID"
echo "   Reason: $REASON"
echo "   Created by: $CREATED_BY"

# Log to coordination events
LOG_DIR="/root/projects/roundtable/.maf/logs/coordination"
mkdir -p "$LOG_DIR"

cat >> "$LOG_DIR/rejected_proposals.txt" << EOF
=== $(date -Iseconds) ===
Proposal ID: $PROPOSAL_ID
Rejected by: $APPROVER
Reason: $REASON
Created by: $CREATED_BY

EOF

echo "   Logged to: $LOG_DIR/rejected_proposals.txt"
