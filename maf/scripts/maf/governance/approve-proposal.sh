#!/bin/bash
# Approve a proposal and create beads
# Usage: approve-proposal.sh <proposal-id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROPOSAL_MGR="$PROJECT_ROOT/lib/maf/governance/proposal-manager.mjs"
CREATE_BEADS="$PROJECT_ROOT/scripts/maf/governance/create-beads-from-proposal.sh"

if [[ $# -eq 0 ]]; then
  echo "Usage: approve-proposal.sh <proposal-id>"
  exit 1
fi

PROPOSAL_ID="$1"
APPROVER="${APPROVER:-GreenMountain}"

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

CLASSIFICATION=$(echo "$PROPOSAL" | jq -r '.classification')

# Verify approval authority
if [[ "$CLASSIFICATION" == "strategic" ]]; then
  # Supervisor can approve strategic
  if [[ "$APPROVER" != "GreenMountain" ]] && [[ "$APPROVER" != "Supervisor" ]]; then
    echo "Error: Only Supervisor can approve strategic proposals" >&2
    exit 1
  fi
elif [[ "$CLASSIFICATION" == "multi_epic" ]]; then
  # Human approval required for multi_epic
  if [[ ! "$APPROVER" =~ (human|operator|$USER) ]]; then
    echo "Error: Multi-epic proposals require human approval" >&2
    exit 1
  fi
fi

# Update proposal status to approved
REVIEWED_AT=$(date -Iseconds)
UPDATED=$(node "$PROPOSAL_MGR" update "$PROPOSAL_ID" "{
  \"status\": \"approved\",
  \"reviewed_by\": \"$APPROVER\",
  \"reviewed_at\": \"$REVIEWED_AT\",
  \"review_decision\": \"approved\"
}")

echo "✅ Proposal approved: $PROPOSAL_ID"

# Create beads from proposal
echo "📝 Creating beads..."
"$CREATE_BEADS" "$PROPOSAL_ID"

# List created beads
echo ""
echo "Created beads:"
node "$PROPOSAL_MGR" read "$PROPOSAL_ID" | jq -r '.created_beads[] | "  - \(.id): \(.title)"'

echo ""
echo "Proposal status: approved"
