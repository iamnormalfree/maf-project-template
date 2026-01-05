---
name: autonomous-work-proposal
description: "Use when attempting to create strategic work beads (PMF, architecture, multi-epic). Routes to proposal workflow for Supervisor approval instead of direct bead creation."
---

# Autonomous Work Proposal

## Overview

This skill governs the creation of strategic work in the multi-agent system. When an agent attempts to create beads that would significantly impact the system (PMF validation, architecture changes, multi-epic work), this skill intercepts and routes through the proposal workflow instead of allowing direct bead creation.

## When to Use This Skill

**Automatic Detection:**
You MUST use this skill when:
- Creating work labeled "pmf", "architecture", "multi-epic", "strategic"
- Work estimated > 2 hours or touching multiple files
- Features that affect core system behavior
- Work requiring Supervisor or human approval

**Manual Invocation:**
Use the `/propose-autonomous-work` slash command when you want to:
- Proactively propose work before creating beads
- Get Supervisor approval for complex changes
- Formally document strategic work intent

## Detection Criteria

The work classifier automatically categorizes work based on:
- **Labels** (35% weight): pmf/architecture→strategic, bug→tactical
- **Type** (20% weight): epic→multi_epic, feature→strategic, task/bug→tactical
- **Description length** (15% weight): >600 chars→multi_epic, <100→tactical
- **Title keywords** (15% weight): "implement"→strategic, "fix"→tactical
- **Dependencies** (15% weight): 6+→multi_epic, 0→tactical

**Exit Codes:**
- `0` = tactical (no approval needed)
- `1` = strategic (Supervisor approval required)
- `2` = multi_epic (human approval required)

## The Proposal Workflow

### Step 1: Classify the Work

Run the classifier to determine work category:

```bash
./scripts/maf/governance/classify-work.sh \
  --title "Work Title" \
  --description "Work description" \
  --labels "label1,label2" \
  --type "feature"
```

Check the exit code:
- If `0` → Tactical, you can create beads directly
- If `1` → Strategic, continue to proposal workflow
- If `2` → Multi-epic, continue to proposal workflow

### Step 2: Create Proposed Beads JSON

Create a JSON file with the beads you want to create:

```json
[
  {
    "title": "Bead title",
    "labels": "label1,label2",
    "description": "Bead description",
    "type": "task|bug|feature",
    "assignee": "AgentName"
  }
]
```

### Step 3: Create Proposal

```bash
AGENT_NAME=YourAgentName ./scripts/maf/governance/create-proposal.sh \
  --title "Proposal Title" \
  --description "Detailed description of the proposed work" \
  --labels "label1,label2,strategic" \
  --beads proposed_beads.json
```

This creates a proposal in `.beads/proposals.jsonl` with status "pending".

### Step 4: Wait for Approval

The proposal will be reviewed by:
- **Strategic work** → GreenMountain (Supervisor)
- **Multi-epic work** → Human operator

Check proposal status:
```bash
./scripts/maf/governance/list-proposals.sh
```

### Step 5: Implementation After Approval

Once approved:
1. Beads are automatically created in `.beads/beads.jsonl`
2. Each bead has `proposal_id` linking to the original proposal
3. Proceed with implementation using the created beads

## Supervisor Commands

If you are GreenMountain (Supervisor), you can approve proposals:

```bash
# Approve a proposal
APPROVER=GreenMountain ./scripts/maf/governance/approve-proposal.sh prop-XXXXXXXX-XXXX

# Reject a proposal
APPROVER=GreenMountain ./scripts/maf/governance/reject-proposal.sh prop-XXXXXXXX-XXXX --reason "Reason for rejection"
```

## Examples

### Example 1: PMF Validation Work (Strategic)

```
Agent: I want to add PMF validation metrics.
Skill: Work classified as strategic (exit code 1)
Agent creates proposal → Supervisor approves → Beads created → Implementation proceeds
```

### Example 2: Bug Fix (Tactical)

```
Agent: Fix typo in button label
Skill: Work classified as tactical (exit code 0)
Agent creates bead directly → No proposal needed
```

### Example 3: Architecture Refactor (Multi-Epic)

```
Agent: Refactor entire service layer architecture
Skill: Work classified as multi_epic (exit code 2)
Agent creates proposal → Human approval → Beads created → Implementation proceeds
```

## Key Principles

- **Strategic work requires approval** → PMF, architecture, multi-epic
- **Tactical work is autonomous** → Bug fixes, small features, single-file changes
- **Proposals are traceable** → Every bead from approved proposal links back
- **Supervisor can override** → GreenMountain can approve or reject
- **Humans control big changes** → Multi-epic requires human approval

## After Proposal Approval

Once your proposal is approved and beads are created:

1. **Verify beads exist:**
   ```bash
   grep "proposal_id" .beads/beads.jsonl | grep "prop-XXXXXXXX-XXXX"
   ```

2. **Update your Agent Mail:**
   - Mark the proposal discussion as resolved
   - Claim the created beads for implementation

3. **Implement using /response-awareness:**
   - Each bead is now a standard work item
   - Use Response Awareness Framework for implementation

## Troubleshooting

**Proposal stuck in pending:**
- Check with GreenMountain: `mcp__mcp_agent_mail__send_message` to GreenMountain
- List proposals: `./scripts/maf/governance/list-proposals.sh --status pending`

**Wrong classification:**
- Re-run classifier with more specific labels/description
- If still wrong, contact Supervisor for manual review

**Beads not created after approval:**
- Check proposal status: should be "approved"
- Verify `create-beads-from-proposal.sh` ran successfully
- Manual bead creation is allowed if automation fails
