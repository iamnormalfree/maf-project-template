#!/bin/bash
# Create beads from an approved proposal
# Usage: create-beads-from-proposal.sh <proposal-id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROPOSAL_MGR="$PROJECT_ROOT/lib/maf/governance/proposal-manager.mjs"
BEADS_FILE="$PROJECT_ROOT/.beads/beads.jsonl"

if [[ $# -eq 0 ]]; then
  echo "Usage: create-beads-from-proposal.sh <proposal-id>"
  exit 1
fi

PROPOSAL_ID="$1"
CREATED_BY="${CREATED_BY:-Auto-proposal}"

# Read proposal
PROPOSAL=$(node "$PROPOSAL_MGR" read "$PROPOSAL_ID")

if [[ -z "$PROPOSAL" ]]; then
  echo "Error: Proposal not found: $PROPOSAL_ID" >&2
  exit 1
fi

# Check if approved
STATUS=$(echo "$PROPOSAL" | jq -r '.status')
if [[ "$STATUS" != "approved" ]]; then
  echo "Error: Proposal is not approved (current status: $STATUS)" >&2
  exit 1
fi

# Get proposed beads
PROPOSED_BEADS=$(echo "$PROPOSAL" | jq -r '.proposed_beads')
CREATED_COUNT=0
CREATED_IDS=()

# Create each bead
while IFS= read -r bead; do
  BEAD_TITLE=$(echo "$bead" | jq -r '.title')
  # Handle labels as either string or array
  BEAD_LABELS=$(echo "$bead" | jq -r 'if .labels | type == "array" then .labels | join(",") else .labels end')
  BEAD_DESC=$(echo "$bead" | jq -r '.description // .title')
  BEAD_TYPE=$(echo "$bead" | jq -r '.type // "task"')
  BEAD_ASSIGNEE=$(echo "$bead" | jq -r '.assignee // ""')

  # Generate bead ID
  BEAD_ID="roundtable-$(date +%s)_$(head -c 4 /dev/urandom | xxd -p)"

  # Create bead JSON (compact single-line format for JSONL)
  BEAD_JSON=$(jq -n -c \
    --arg id "$BEAD_ID" \
    --arg title "$BEAD_TITLE" \
    --arg description "$BEAD_DESC" \
    --arg labels "$BEAD_LABELS" \
    --arg type "$BEAD_TYPE" \
    --arg assignee "$BEAD_ASSIGNEE" \
    --arg created_at "$(date -Iseconds)" \
    --arg created_by "$CREATED_BY" \
    --arg proposal_id "$PROPOSAL_ID" \
    '{
      id: $id,
      title: $title,
      description: $description,
      labels: $labels,
      type: $type,
      assignee: $assignee,
      status: "open",
      created_at: $created_at,
      created_by: $created_by,
      proposal_id: $proposal_id
    }')

  # Append to beads.jsonl
  echo "$BEAD_JSON" >> "$BEADS_FILE"

  CREATED_IDS+=("$BEAD_ID")
  ((CREATED_COUNT++)) || true

  echo "  ✅ Created bead: $BEAD_ID - $BEAD_TITLE"

done < <(echo "$PROPOSAL" | jq -c '.proposed_beads[]')

echo ""
echo "✅ Created $CREATED_COUNT bead(s) from proposal $PROPOSAL_ID"

# Update proposal with created bead IDs
IDS_JSON=$(printf '%s\n' "${CREATED_IDS[@]}" | jq -R -s -c 'split("\n") | map(select(length > 0))')
node "$PROPOSAL_MGR" update "$PROPOSAL_ID" "{\"created_beads\": $IDS_JSON}"

echo "   Bead IDs: ${CREATED_IDS[*]}"
