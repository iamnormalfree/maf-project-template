#!/bin/bash
# Create a work proposal for strategic or multi-epic work
# Usage: create-proposal.sh --title "Title" --description "Desc" --labels "label1,label2" --beads beads.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLASSIFIER="$PROJECT_ROOT/lib/maf/governance/work-classifier.mjs"
PROPOSAL_MGR="$PROJECT_ROOT/lib/maf/governance/proposal-manager.mjs"

# Default values
TITLE=""
DESCRIPTION=""
LABELS=""
TYPE=""
BEADS_FILE=""
AGENT_NAME="${AGENT_NAME:-Unknown}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --title)
      TITLE="$2"
      shift 2
      ;;
    --description)
      DESCRIPTION="$2"
      shift 2
      ;;
    --labels)
      LABELS="$2"
      shift 2
      ;;
    --type)
      TYPE="$2"
      shift 2
      ;;
    --beads)
      BEADS_FILE="$2"
      shift 2
      ;;
    --agent)
      AGENT_NAME="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: create-proposal.sh --title \"Title\" --description \"Desc\" --labels \"label1,label2\" --beads beads.json [--agent NAME]"
      echo ""
      echo "Creates a work proposal for strategic or multi-epic work."
      echo ""
      echo "Options:"
      echo "  --title       Proposal title (required)"
      echo "  --description Detailed description (required)"
      echo "  --labels      Comma-separated labels (required)"
      echo "  --type        Issue type: task|bug|feature|epic (optional)"
      echo "  --beads       JSON file with proposed_beads array (required)"
      echo "  --agent       Agent name creating proposal (default: \$AGENT_NAME)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$TITLE" ]]; then
  echo "Error: --title is required" >&2
  exit 1
fi

if [[ -z "$DESCRIPTION" ]]; then
  echo "Error: --description is required" >&2
  exit 1
fi

if [[ -z "$LABELS" ]]; then
  echo "Error: --labels is required" >&2
  exit 1
fi

if [[ -z "$BEADS_FILE" ]]; then
  echo "Error: --beads is required" >&2
  exit 1
fi

if [[ ! -f "$BEADS_FILE" ]]; then
  echo "Error: Beads file not found: $BEADS_FILE" >&2
  exit 1
fi

# Classify the work (capture exit code separately since 1 and 2 are valid classifications)
set +e  # Temporarily disable "exit on error" since exit codes 1,2 are valid classifications
CLASSIFICATION_OUTPUT=$(node "$CLASSIFIER" \
  --title "$TITLE" \
  --description "$DESCRIPTION" \
  --labels "$LABELS" \
  ${TYPE:+--type "$TYPE"} 2>&1)
CLASSIFICATION_EXIT=$?
set -e  # Re-enable "exit on error"

# Allow exit codes 0,1,2 (tactical,strategic,multi_epic are valid, not errors)
if [[ $CLASSIFICATION_EXIT -gt 2 ]]; then
  echo "Error: Classifier returned unexpected exit code: $CLASSIFICATION_EXIT" >&2
  exit 1
fi

# Determine classification from exit code
if [[ $CLASSIFICATION_EXIT -eq 0 ]]; then
  CLASSIFICATION="tactical"
elif [[ $CLASSIFICATION_EXIT -eq 1 ]]; then
  CLASSIFICATION="strategic"
else
  CLASSIFICATION="multi_epic"
fi

# Read proposed beads
PROPOSED_BEADS=$(cat "$BEADS_FILE")

# Escape classifier output for JSON (convert newlines to spaces)
RATIONALE_ESCAPED=$(echo "$CLASSIFICATION_OUTPUT" | tr '\n' ' ' | sed 's/"/\\"/g')

# Create proposal data
PROPOSAL_DATA=$(cat <<EOF
{
  "title": "$TITLE",
  "description": "$DESCRIPTION",
  "labels": "$LABELS",
  "type": "$TYPE",
  "classification": "$CLASSIFICATION",
  "created_by": "$AGENT_NAME",
  "proposed_beads": $PROPOSED_BEADS,
  "rationale": "Work classification: $RATIONALE_ESCAPED"
}
EOF
)

# Create proposal
PROPOSAL=$(echo "$PROPOSAL_DATA" | node "$PROPOSAL_MGR" create)

PROPOSAL_ID=$(echo "$PROPOSAL" | jq -r '.id')
REQUIRES_APPROVAL=$(echo "$PROPOSAL" | jq -r '.classification')

echo "✅ Proposal created: $PROPOSAL_ID"
echo "   Classification: $REQUIRES_APPROVAL"
echo ""
echo "Next steps:"
if [[ "$REQUIRES_APPROVAL" == "strategic" ]]; then
  echo "  → Supervisor approval required"
  echo "  → Waiting for GreenMountain to approve/reject"
  echo ""
  echo "Supervisor commands:"
  echo "  approve-proposal.sh $PROPOSAL_ID"
  echo "  reject-proposal.sh $PROPOSAL_ID --reason '...'"
elif [[ "$REQUIRES_APPROVAL" == "multi_epic" ]]; then
  echo "  → Human approval required"
  echo "  → Telegram alert sent to operator"
  echo ""
  echo "Human commands:"
  echo "  approve-proposal.sh $PROPOSAL_ID"
  echo "  reject-proposal.sh $PROPOSAL_ID --reason '...'"
else
  echo "  → Tactical work: No approval needed"
  echo "  → You can create beads directly"
fi

# For strategic/multi_epic, send notification
if [[ "$REQUIRES_APPROVAL" != "tactical" ]]; then
  # Send to Agent Mail if available
  if command -v mcp__mcp_agent_mail__send_message &>/dev/null; then
    # Would integrate with Agent Mail here
    echo "   (Agent Mail notification would be sent here)"
  fi
fi
