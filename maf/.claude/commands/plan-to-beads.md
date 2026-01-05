# Plan to Beads

**Purpose:** Convert an implementation plan with tasks into Beads issue tracker items for execution by agents.

**Usage:** `/plan-to-beads [path-to-plan-file] [optional-supporting-files...]`

**Examples:**
- `/plan-to-beads docs/plans/2026-01-05-my-feature-plan.md`
- `/plan-to-beads docs/plans/2026-01-05-my-feature-plan.md docs/operations/some-runbook.md`

---

## Superpower Workflow Integration

This command is part of the complete Roundtable agent workflow:

```
1. sp-brainstorming
   → Explores user intent, requirements, and design
   → Creates: docs/plans/YYYY-MM-DD-<topic>-design.md

2. sp-writing-plans
   → Creates detailed implementation plan with bite-sized tasks
   → Creates: docs/plans/YYYY-MM-DD-<feature-name>.md

3. /plan-to-beads (this command)
   → Converts plan to beads automatically
   → Creates epic, tasks, dependencies, feature branch

4. Supervisor assigns beads via Agent Mail
   → Routes tasks to implementors based on labels

5. Implementors use /response-awareness
   → Each bead implemented with metacognitive orchestration
   → File reservations, proper skill selection, verification

6. Reviewer validates and approves

7. Supervisor closes and commits epic work
```

**Key Skills Referenced:**
- `sp-brainstorming` - Initial design exploration (REQUIRED for new features)
- `sp-writing-plans` - Implementation plan creation (REQUIRED for this command)
- `sp-test-driven-development` - For test-first implementation
- `sp-verification-before-completion` - Final validation
- `response-awareness` - Bead implementation framework

---

## Instructions for Claude

When user runs this command, convert their plan into beads by following these steps:

### Step 1: Validate Input

```bash
# Parse command line arguments
PLAN_FILE="$1"
shift 1  # Remove plan file from args, leaving supporting files
SUPPORTING_FILES=("$@")  # Array of optional supporting files

# Check that beads is initialized
if [ ! -d ".beads" ]; then
  echo "❌ Beads not initialized. Run 'bd init' first."
  exit 1
fi

# Check that plan file exists and is readable
if [ ! -f "$PLAN_FILE" ]; then
  echo "❌ Plan file not found: $PLAN_FILE"
  exit 1
fi

# Validate supporting files exist
for file in "${SUPPORTING_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Supporting file not found: $file"
    exit 1
  fi
done

echo "📋 Processing plan: $PLAN_FILE"
if [ ${#SUPPORTING_FILES[@]} -gt 0 ]; then
  echo "📚 Including ${#SUPPORTING_FILES[@]} supporting files:"
  printf '  - %s\n' "${SUPPORTING_FILES[@]}"
fi
```

### Step 2: Parse Plan Frontmatter

Extract from the YAML frontmatter:

```yaml
---
epic: "governance-implementation"
branch: feature/agent-coordination-governance
complexity: medium
assignee: "FuchsiaCreek"
priority: 1
---
```

**Output variables:**
- `epic_name`: Extract epic name for labeling
- `branch_name`: Feature branch to use for every bead (fallback: generate from plan name)
- `priority`: P1 (high), P2 (medium), P3 (low)
- `assignee`: Default agent assignee
- `complexity`: Used for time estimates

### Step 3: Extract Tasks from Plan

Parse the plan body to identify concrete tasks:

**Task Pattern Recognition:**

```markdown
## Phase 1 – Core Classification System (2 hours)

**Step 1.1.1:** Create work classifier TypeScript module
- File: `lib/maf/governance/work-classifier.ts`
- Implement classification algorithm
- Add comprehensive tests

**Step 1.1.2:** Create classify-work.sh wrapper script
- File: `scripts/maf/governance/classify-work.sh`
- Accept bead metadata as CLI args
```

**Extraction Rules:**

1. **Phase headers** (`## Phase`, `### Phase`) → Use for task grouping/dependencies
2. **Step headers** (`**Step X.Y.Z:**`, `### Task N:`) → Each becomes a bead
3. **File paths** → Capture them for bead description
4. **Test files** → Mention in description or create separate test bead
5. **Time estimates** → Track for validation

**File Pattern Matching:**
```bash
# Common file patterns to extract:
- lib/**/*.ts (TypeScript modules)
- apps/**/*.ts (Backend apps)
- apps/site/**/*.{ts,11ty.js} (Site files)
- scripts/**/*.sh (Shell scripts)
- scripts/maf/**/*.ts (MAF scripts)
- tests/**/*.test.ts (Test files)
- docs/**/*.md (Documentation)
```

### Step 4: Normalize Task Data

For each extracted task, create a normalized structure:

```json
{
  "title": "Create work classifier module",
  "description": "Implement work-classifier.ts with classification algorithm",
  "labels": ["governance", "backend", "typescript"],
  "files": ["lib/maf/governance/work-classifier.ts"],
  "tests": ["lib/maf/__tests__/work-classifier.test.ts"],
  "estimated_hours": 1.5,
  "phase": 1,
  "step": "1.1.1",
  "dependencies": []
}
```

**Label Mapping:**
- **Epic**: From frontmatter `epic` field
- **Domain**: `backend`, `frontend`, `site`, `tests`, `docs`, `infra`, `governance`, `maf`
- **Type**: `api`, `component`, `util`, `integration`, `e2e`, `script`, `migration`
- **Agent**: From frontmatter `assignee` or auto-detect based on domain

### Step 5: Handle Supplementary Documentation

**Process Supporting Files:**
```bash
# Add supporting files to all beads for context
for support_file in "${SUPPORTING_FILES[@]}"; do
  echo "📚 Processing supporting file: $support_file"

  # Add to bead description as reference
  bead_description+="\n\nRefer to: $support_file"

  # Extract additional context from supporting files
  if [[ "$support_file" == *.md ]]; then
    echo "ℹ️  Supporting doc detected - will be referenced in bead description"
  fi
done
```

**Extract Plan-Referenced Docs:**
```bash
# Find all referenced documents in the plan
plan_references=$(grep -oE '\`([^`]+\.(md|yaml|json))`' "$PLAN_FILE" | sed 's/`//g' | sort -u)

for ref in $plan_references; do
  if [ -f "$ref" ]; then
    echo "📖 Plan references: $ref"
    bead_description+="\nReference: $ref"
  fi
done
```

### Step 6: Create Beads Programmatically

For each normalized task, execute:

```bash
# Build labels array
LABELS=("${epic_label}")

# Add domain label based on file paths
if [[ "$task_files" =~ apps/backend ]]; then
  LABELS+=("backend")
elif [[ "$task_files" =~ apps/site ]]; then
  LABELS+=("site" "frontend")
elif [[ "$task_files" =~ scripts/maf ]]; then
  LABELS+=("maf" "scripts")
fi

# Add type label
if [[ "$task_title" =~ [Tt]est ]]; then
  LABELS+=("test")
elif [[ "$task_title" =~ [Aa]pi ]]; then
  LABELS+=("api")
fi

# Create description with all context
DESCRIPTION="$task_description

Files:
$(printf '%s\n' "${task_files[@]}")

Tests:
$(printf '%s\n' "${task_tests[@]}")

Source: $PLAN_FILE#${phase}.${step}
Branch: ${branch_name}
"

# Add supporting file references
if [ -n "${SUPPORTING_FILES[*]}" ]; then
  DESCRIPTION+="

Supporting Docs:
$(printf '%s\n' "${SUPPORTING_FILES[@]}")
"
fi

# Create bead using bd CLI
bd create "$task_title" \
  --label "$(IFS=,; echo "${LABELS[*]}")" \
  --description "$DESCRIPTION" \
  --priority "$PRIORITY" \
  --assignee "$ASSIGNEE"

# Capture bead ID
BEAD_ID=$(bd create ... | grep "Created issue" | cut -d' ' -f3)
echo "roundtable-${phase}_${step}:${BEAD_ID}" >> bead_mapping.txt
```

### Step 7: Add Dependencies

**Phase Dependencies:**
```bash
# Phase 2 tasks depend on Phase 1 completion
for phase2_bead in "${phase2_beads[@]}"; do
  for phase1_bead in "${phase1_beads[@]}"; do
    # Syntax: bd dep add <dependent-issue-id> <depends-on-issue-id>
    bd dep add "$phase2_bead" "$phase1_bead"
  done
done
```

**Sequential Dependencies:**
```bash
# If Step 1.1.2 depends on 1.1.1
if [[ "$step" =~ 1\.1\.2 ]] && [[ -n "${step_1_1_1_bead}" ]]; then
  bd dep add "$BEAD_ID" "$step_1_1_1_bead"
fi
```

### Step 8: Create Plan Branch (Automatic)

**Create and push the plan's branch automatically:**

```bash
# Extract plan information for branch creation
PLAN_BASENAME=$(basename "$PLAN_FILE" .md)
PLAN_DATE=$(echo "$PLAN_BASENAME" | cut -d'-' -f1-3)
PLAN_SLUG=$(echo "$PLAN_BASENAME" | sed "s/${PLAN_DATE}-//")

# Call helper script to create and push the branch
HELPER_SCRIPT="scripts/maf/helpers/create-plan-branch.sh"
if [ -f "$HELPER_SCRIPT" ]; then
  echo "🌱 Creating plan branch..."
  bash "$HELPER_SCRIPT" "$PLAN_FILE"

  if [ $? -eq 0 ]; then
    echo "✅ Plan branch created and pushed successfully"
  else
    echo "⚠️  Warning: Branch creation failed, agents will need to create manually"
  fi
else
  echo "⚠️  Helper script not found: $HELPER_SCRIPT"
  echo "   Agents will need to create plan branch manually"
fi
```

### Step 9: Validate and Report

**Validation Checks:**
```bash
# Verify all tasks have beads
task_count=$(grep -cE "^(## Phase|### Phase|\*\*Step|\*\*Task)" "$PLAN_FILE" || echo "0")
bead_count=${#created_beads[@]}
echo "Tasks in plan: $task_count, Beads created: $bead_count"

# Verify file paths are valid
for file in "${all_files[@]}"; do
  if [ ! -f "$file" ] && [ ! -d "$file" ]; then
    echo "⚠️  File not found: $file"
  fi
done
```

**Output Report:**
```markdown
## Plan → Beads Conversion Summary

**Source Plan:** docs/plans/2026-01-05-my-feature-plan.md
**Epic:** governance-implementation
**Branch:** feature/agent-coordination-governance

### Supporting Documentation
**Provided Files:** ${#SUPPORTING_FILES[@]} supporting docs included
$(printf '- %s\n' "${SUPPORTING_FILES[@]}")

**Plan References:** X docs referenced from plan
$(printf '- %s\n' "${plan_references[@]}")

### Tasks Converted
| Phase | Step | Plan Task | Bead ID | Labels | Files |
|-------|------|-----------|---------|--------|-------|
$(for bead in "${created_beads[@]}"; do
  echo "| $phase | $step | $title | $bead_id | ${labels[*]} | ${#files[@]} files |"
done)

### Dependencies Created
- Phase 1 → Phase 2 blocking relationships
- Sequential step dependencies where applicable

### Agent Instructions
Each bead includes:
- Source plan reference (phase and step number)
- All file paths mentioned in task
- Test file references
- Supporting documentation links

### Next Steps
1. ✅ **Plan branch created**: All agents work on same branch
2. Run: `bd ready --label $epic_label` to see available work
3. Assign agents: `bd assign $bead_id --agent $agent_name`
4. Verify on correct branch: `git checkout $branch_name`
5. Commit beads state: `git add .beads/beads.jsonl && git commit -m "feat: encode plan tasks into beads"`

**Conversion:** ✅ Complete ($bead_count/$task_count tasks converted)
```

### Step 10: Commit Artifacts

```bash
# Stage the plan file (if conversion added bead references)
git add "$PLAN_FILE"

# Stage beads state
git add .beads/beads.jsonl

# Commit with structured message
git commit -m "$(cat <<'EOF'
feat: encode $(basename "$PLAN_FILE" .md) tasks into beads

- Extracted $bead_count concrete tasks from plan phases
- Created beads with proper epic/domain labels
- Added phase dependencies
- Created and pushed plan branch: $branch_name
- Source plan: $PLAN_FILE

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Key Adaptations for Roundtable

### Removed (Not Used in Roundtable)

| Nextnest Feature | Roundtable Adaptation |
|-----------------|----------------------|
| `constraint` labels | Use `epic` frontmatter field instead |
| `can_tasks` tracking | Use roundtable's epic system |
| Codex profile labels | Removed (not applicable) |
| `claude-pair-1` agent labels | Use agent names directly (GreenMountain, etc.) |

### Added (Roundtable-Specific)

| Feature | Description |
|---------|-------------|
| `epic` frontmatter | Epic name for grouping related work |
| `assignee` frontmatter | Default agent assignee from plan |
| Domain labels | `maf`, `governance`, `site`, `backend` |
| Helper script | Uses existing `create-plan-branch.sh` |

### Frontmatter Template for Roundtable Plans

```yaml
---
epic: "governance-implementation"
branch: feature/agent-coordination-governance
complexity: medium
assignee: "FuchsiaCreek"
priority: 1
estimated_hours: 8
---

# Feature Implementation Plan

**Goal:** [One sentence description]

**Architecture:** [2-3 sentence approach]

**Tech Stack:** [Key technologies]

---
```

---

*Command adapted from nextnest for roundtable: 2026-01-05*
