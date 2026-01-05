---
description: "Create a proposal for strategic work (PMF, architecture, multi-epic). Routes through governance approval workflow instead of direct bead creation."
---

I'll help you create a proposal for this work. Let me first classify the work to determine if it requires approval.

## Step 1: Work Classification

I need to classify this work to determine the approval level:
- **Tactical** (< 2 hours, single file, bug fix) → No approval needed
- **Strategic** (2-8 hours, PMF/feature) → Supervisor approval required
- **Multi-epic** (> 8 hours, architecture) → Human approval required

Please provide the following details for classification:

1. **Title**: Brief title of the work
2. **Description**: Detailed description of what you want to build
3. **Labels**: Comma-separated labels (e.g., "pmf,backend,analytics")
4. **Type**: Issue type - task, bug, feature, or epic
5. **Proposed Beads**: Break down into specific beads (title, labels, description, type, assignee for each)

Once you provide these details, I'll:
1. Run the classifier to determine work category
2. Create a proposal if strategic/multi-epic
3. Guide you through the approval workflow

**Example format for proposed beads:**
```json
[
  {
    "title": "Create PMF metrics API endpoint",
    "labels": "backend,api,pmf",
    "description": "Implement /api/metrics/pmf endpoint returning activation and retention data",
    "type": "feature",
    "assignee": "FuchsiaCreek"
  }
]
```

What work would you like to propose?
