#!/bin/bash

# ABOUTME: Helper script to read plan frontmatter and create/push the plan's branch automatically

set -euo pipefail

# Usage: create-plan-branch.sh <path-to-plan-file>
# Example: create-plan-branch.sh docs/plans/active/2025-11-12-my-feature-plan.md

PLAN_FILE="$1"

if [ -z "$PLAN_FILE" ]; then
  echo "❌ Usage: $0 <path-to-plan-file>"
  exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
  echo "❌ Plan file not found: $PLAN_FILE"
  exit 1
fi

echo "🌱 Creating plan branch from: $PLAN_FILE"

# Function to extract YAML frontmatter value
extract_frontmatter() {
  local file="$1"
  local key="$2"

  # Extract YAML between --- markers, then get the value
  sed -n '/^---$/,/^---$/p' "$file" | grep "^${key}:" | cut -d':' -f2- | sed 's/^ *//' | sed 's/ *$//' | tr -d '"'
}

# Extract branch from frontmatter
BRANCH=$(extract_frontmatter "$PLAN_FILE" "branch")

if [ -z "$BRANCH" ]; then
  echo "⚠️  No 'branch' field found in plan frontmatter"

  # Generate branch name from plan filename
  PLAN_BASENAME=$(basename "$PLAN_FILE" .md)
  PLAN_DATE=$(echo "$PLAN_BASENAME" | cut -d'-' -f1-3)
  PLAN_SLUG=$(echo "$PLAN_BASENAME" | sed "s/${PLAN_DATE}-//")

  # Convert slug to proper branch name (replace spaces and special chars)
  BRANCH="feature/${PLAN_SLUG}"
  BRANCH=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9\/-]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

  echo "🔧 Generated branch name: $BRANCH"
else
  echo "📋 Using branch from frontmatter: $BRANCH"
fi

# Validate branch name format
if [[ ! "$BRANCH" =~ ^(feature|fix|hotfix|docs|test|refactor)/.+ ]]; then
  echo "⚠️  Warning: Branch name should start with feature/, fix/, hotfix/, docs/, test/, or refactor/"
  echo "   Current branch: $BRANCH"
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Not in a git repository"
  exit 1
fi

# Check current working tree status
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  Working tree has uncommitted changes"
  echo "   Staging current changes before creating branch..."
  git add -A
  git commit -m "WIP: Auto-commit before creating plan branch $BRANCH"
fi

# Check if branch already exists locally
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "📂 Branch '$BRANCH' already exists locally"

  # Switch to existing branch
  git checkout "$BRANCH"

  # Pull latest changes if remote exists
  if git ls-remote --exit-code origin "$BRANCH" >/dev/null 2>&1; then
    echo "📥 Pulling latest changes for existing branch..."
    git pull origin "$BRANCH"
  fi
else
  echo "🆕 Creating new branch: $BRANCH"

  # Create and checkout new branch
  git checkout -b "$BRANCH"
fi

# Push to remote
echo "🚀 Pushing branch to remote..."
git push -u origin "$BRANCH"

if [ $? -eq 0 ]; then
  echo "✅ Plan branch '$BRANCH' created and pushed successfully"
  echo ""
  echo "📍 Next steps for agents:"
  echo "   - All beads for this plan should use branch: $BRANCH"
  echo "   - Agents can switch to this branch with: git checkout $BRANCH"
  echo "   - Work on this branch until the plan is complete"
else
  echo "❌ Failed to push branch to remote"
  echo "   Agents will need to create the branch manually"
  exit 1
fi