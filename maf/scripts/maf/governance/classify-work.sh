#!/bin/bash
# Work classification wrapper script
# Classifies work into tactical/strategic/multi_epic
# Exit codes: 0=tactical, 1=strategic, 2=multi_epic

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLASSIFIER="$PROJECT_ROOT/lib/maf/governance/work-classifier.mjs"

# Parse arguments
TITLE=""
DESCRIPTION=""
LABELS=""
TYPE=""

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
    -h|--help)
      echo "Usage: classify-work.sh --title \"Title\" --description \"Desc\" --labels \"label1,label2\" [--type TYPE]"
      echo ""
      echo "Classifies work into three categories:"
      echo "  - tactical:    < 2 hours, single file, bug fix (exit 0)"
      echo "  - strategic:   2-8 hours, PMF/feature, Supervisor approval (exit 1)"
      echo "  - multi_epic:  > 8 hours, architecture, Human approval (exit 2)"
      echo ""
      echo "Output: JSON with classification result"
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
  LABELS="unclassified"
fi

# Build command
CMD="node $CLASSIFIER --title \"$TITLE\" --description \"$DESCRIPTION\" --labels \"$LABELS\""

if [[ -n "$TYPE" ]]; then
  CMD="$CMD --type \"$TYPE\""
fi

# Run classifier
eval "$CMD"
EXIT_CODE=$?

# Output result already printed by node command
# Exit with appropriate code
exit $EXIT_CODE
