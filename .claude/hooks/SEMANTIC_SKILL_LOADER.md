# Semantic Skill Loader System

> **ChromaDB-Powered Dynamic Skill Discovery for Claude**
>
> Provides token-efficient skill discovery through semantic search, enabling Claude to access relevant domain expertise on-demand without context bloat.

---

## 📚 **Table of Contents**

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup Guide](#setup-guide)
4. [How Claude Uses This](#usage)
5. [Configuration](#configuration)
6. [Integration with Response-Awareness Framework](#integration)

---

## 🎯 **Overview**

The Semantic Skill Loader gives Claude intelligent, context-aware skill discovery using ChromaDB vector search. Instead of injecting all skills upfront (expensive in tokens), Claude:

1. **Receives semantic search results**: Developer prompts trigger ChromaDB vector similarity search
2. **Sees compact catalogs**: Gets ~50-token skill summaries instead of ~3,000-token full content
3. **Loads skills on-demand**: Can request full skill content when needed via simple command
4. **Tracks per session**: Each skill catalog shown once per session to avoid repetition
5. **Automatic reset**: Tracking clears when Claude's session/agent completes

### **Token Efficiency for Claude's Context**

- **Traditional approach**: All skills injected = N × 3,000 tokens consumed from Claude's context window
- **Semantic loader**: Catalog only = N × 50 tokens, preserving context for actual work
- **Savings**: 98% reduction per skill = more room for code, conversation, and reasoning
- **Scalability**: Claude can access unlimited skills without context window pressure

---

## 🏗️ **Architecture**

### **Component Overview**

```
┌─────────────────────────────────────────────────────────┐
│                   User Prompt                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
        ┌───────────────────────────┐
        │  semantic_loader.py       │◄──── UserPromptSubmit hook
        │  (ChromaDB semantic       │
        │   similarity search)      │
        └────────────┬──────────────┘
                     │
        ┌────────────▼──────────────┐
        │  High relevance (>85%)?   │
        └────────────┬──────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
        YES                      NO
         │                        │
         ▼                        ▼
    Auto-inject            Show catalog only
    full skill             (~50 tokens)
    content                      │
         │                        │
         └────────────┬───────────┘
                      │
         ┌────────────▼──────────────────┐
         │  User reads domain file        │
         └────────────┬──────────────────┘
                      │
                      ▼
         ┌────────────────────────────────┐
         │  skill_catalog_posttool.py     │◄──── PostToolUse:Read hook
         │  (Domain-aware catalog)        │
         └────────────┬──────────────────┘
                      │
         ┌────────────▼──────────────────┐
         │  Shown this skill already?     │
         └────────────┬──────────────────┘
                      │
          ┌───────────┴────────────┐
          │                        │
         YES                      NO
          │                        │
          ▼                        ▼
       Skip                  Show catalog
       (ALLOW)               (NOTIFY)
                                   │
                      ┌────────────▼──────────────┐
                      │ User runs query_skill.py  │
                      │ to load from ChromaDB     │
                      └────────────┬──────────────┘
                                   │
                                   ▼
                      ┌────────────────────────────┐
                      │ Full skill content loaded  │
                      └────────────────────────────┘
                                   │
                      ┌────────────▼──────────────┐
                      │ Session/Agent completes   │
                      └────────────┬──────────────┘
                                   │
                                   ▼
                      ┌────────────────────────────┐
                      │ reset_skill_tracking.py    │◄──── Stop/SubagentStop hooks
                      │ (Clear tracking for next)  │
                      └────────────────────────────┘
```

### **File Responsibilities**

| File | Hook Type | Purpose |
|------|-----------|---------|
| `semantic_loader.py` | UserPromptSubmit | Semantic search on user prompts, auto-inject high-relevance skills |
| `skill_catalog_posttool.py` | PostToolUse:Read | Domain-aware catalog after file reads |
| `query_skill.py` | Utility | Load skills from ChromaDB on demand |
| `reset_skill_tracking.py` | Stop/SubagentStop | Clear session tracking |
| `session_context.py` | Support | Agentic loop awareness and context tracking |
| `intent_parser.py` | Support | Parse user intent for skill relevance boosting |

---

## 🚀 **Setup Guide**

### **1. Install ChromaDB**

```bash
pip install chromadb
```

### **2. Create Skills Directory**

```bash
mkdir -p your-project/domain-skills
```

Skills should be organized as:
```
domain-skills/
├── skill-name-1/
│   └── SKILL.md          # Full skill content
├── skill-name-2/
│   └── SKILL.md
└── skill-name-3/
    └── SKILL.md
```

### **3. Populate ChromaDB**

Create a setup script to populate ChromaDB with your skills:

```python
#!/usr/bin/env python3
"""Setup ChromaDB with domain skills"""

import chromadb
from chromadb.config import Settings
from pathlib import Path

# Initialize ChromaDB
db_path = Path("your-project/skill_db")
client = chromadb.PersistentClient(
    path=str(db_path),
    settings=Settings(anonymized_telemetry=False)
)

# Create or get collection
collection = client.get_or_create_collection(
    name="game_skills",  # Or your collection name
    metadata={"description": "Domain-specific skills and tools"}
)

# Load skills from domain-skills directory
skills_dir = Path("your-project/domain-skills")

for skill_dir in skills_dir.iterdir():
    if not skill_dir.is_dir():
        continue

    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        continue

    # Read skill content
    with open(skill_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add to ChromaDB
    collection.add(
        documents=[content],
        metadatas=[{
            "name": skill_dir.name.replace('-', ' ').title() + " Expert",
            "type": "skill",
            "path": str(skill_file)
        }],
        ids=[skill_dir.name]
    )

    print(f"Added skill: {skill_dir.name}")

print(f"\n✅ Loaded {collection.count()} skills into ChromaDB")
```

### **4. Configure Paths**

Update paths in the semantic loader hooks to match your project structure:

**In `semantic_loader.py` (line ~306-308)**:
```python
script_dir = Path(__file__).parent.parent.parent  # Adjust to your project root
db_path = script_dir / "your-skill-db-path"       # e.g., "skill_db"
skills_dir = script_dir / "your-skills-path"      # e.g., "domain-skills"
```

**In `skill_catalog_posttool.py`**:
Update the `detect_skill_from_file()` function to match your domain patterns.

**In `query_skill.py` (line ~23)**:
```python
def load_skill_from_db(skill_name: str, db_path: str = "your-skill-db-path"):
```

### **5. Configure Hooks in `.claude/settings.json`**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/semantic_loader.py"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/skill_catalog_posttool.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/reset_skill_tracking.py"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/reset_skill_tracking.py"
          }
        ]
      }
    ]
  }
}
```

---

## 💡 **How Claude Uses This**

### **Automatic Skill Discovery (Claude's Experience)**

When a developer enters a prompt, Claude sees:

1. **Semantic search results** from ChromaDB for relevant skills
2. **Auto-injected skills** with >85% similarity (high confidence) - full content loaded automatically
3. **Catalog notifications** for skills with 30-85% similarity - Claude decides whether to load

**What Claude sees**:
```
Developer: "Help me fix the combat system targeting bug"

[Claude receives from semantic loader hook]
## Auto-Loaded High-Confidence Skills
### Combat Systems Expert (skill) - 92% match

[Full skill content injected here...]

## Available Skills and Tools (Top Matches)
  • UI Development Expert (skill) [67%]: Expert in UI screens, event handling...
  • Game Testing Expert (skill) [52%]: Expert in MCP-based testing...

Use `query_skill(skill_name)` MCP tool to load full content of any skill.
```

### **Domain File Reading (Claude's Catalog Experience)**

When Claude reads a domain file, a PostToolUse hook shows relevant expertise:

```
Claude: Read("systems/shop_manager.py")

[File content appears in Claude's context]

[SKILL CATALOG] Domain Expertise Available

After reading: systems/shop_manager.py

  Shop System Expert (56% relevance)

  To load this skill expertise from ChromaDB:
  Bash("python .claude/hooks/query_skill.py \"Shop System Expert\"")

  Or continue with current knowledge.

This catalog appears once per domain per session.
```

**Claude can then**:
- Continue working with current knowledge
- Run the Bash command to load full skill expertise if needed

### **Loading Skills On-Demand (Claude's Action)**

Claude can load skills by running:

```bash
Bash("python .claude/hooks/query_skill.py \"Combat Systems Expert\"")

# Claude receives:
# # Combat Systems Expert
# # Type: skill
# # Source: domain-skills/combat-systems/SKILL.md
#
# [Full skill content appears in Claude's context]
```

### **Session Tracking (Claude's Perspective)**

- **First domain file read**: Claude sees catalog notification
- **Subsequent reads of same domain**: Catalog silently skipped (Claude already knows it's available)
- **After Claude's session ends**: Tracking resets, fresh catalogs appear in next session
- **After spawned agents complete**: SubagentStop hook clears tracking for next agent

---

## ⚙️ **Configuration**

### **Tuning Similarity Thresholds**

In `semantic_loader.py`:

```python
# Configuration (lines 39-43)
HIGH_CONFIDENCE_THRESHOLD = 0.3   # Distance threshold (lower = more similar)
MEDIUM_CONFIDENCE_THRESHOLD = 0.7  # Catalog threshold
TOP_N_RESULTS = 10                 # Number of results to consider
AUTO_INJECT_TOP_N = 2              # Auto-inject this many high-confidence matches

# Agentic configuration
ENABLE_AGENTIC_AWARENESS = True   # Enable context-aware boosting
AGENTIC_BOOST_FACTOR = 0.15       # Boost similarity for working context skills
```

**Understanding Thresholds**:
- ChromaDB uses cosine distance [0, 2]
- Distance 0 = identical
- Distance 2 = completely different
- Similarity = 1 - (distance / 2)

### **Domain Detection Patterns**

In `skill_catalog_posttool.py`, customize `detect_skill_from_file()`:

```python
def detect_skill_from_file(file_path):
    """Detect which skill is relevant based on file path."""
    file_path_lower = file_path.lower()

    # Customize these patterns for your domains
    if 'your-domain-1' in file_path_lower:
        return ('Domain 1 Expert', '75%')
    elif 'your-domain-2' in file_path_lower:
        return ('Domain 2 Expert', '65%')
    # ... add your domains

    return None
```

### **Tracking File Location**

Tracking file: `.claude/hooks/.shown_skills.json`

Structure:
```json
{
  "shown_skills": ["Skill 1", "Skill 2"],
  "last_reset": "2025-11-19T21:30:00.000000",
  "session_count": 0
}
```

---

## 🔗 **Integration with Response-Awareness Framework**

### **Tiered Integration**

The semantic loader integrates seamlessly with response-awareness tiers:

| Tier | Semantic Loader Behavior |
|------|--------------------------|
| **LIGHT** | Catalog only, no auto-injection |
| **MEDIUM** | Catalog + auto-inject 1 skill |
| **HEAVY** | Catalog + auto-inject 2 skills |
| **FULL** | Catalog + auto-inject 3 skills + agentic boosting |

### **Agentic Awareness**

When enabled, the semantic loader tracks:
- **Working context**: Files recently read/edited
- **Recent intents**: User requests and task patterns
- **Skill usage**: Previously loaded skills

This provides **context-aware relevance boosting** - skills related to your current work get higher similarity scores.

### **Hook Coordination**

```
UserPromptSubmit
    ↓
Response-Awareness Tier Detection
    ↓
Semantic Loader (skill search + catalog)
    ↓
PreToolUse: Assumption Detector, Orchestrator Firewall
    ↓
[Tool Execution]
    ↓
PostToolUse: Skill Catalog (domain-aware)
    ↓
Stop/SubagentStop: Reset Tracking
```

---

## 📊 **Metrics and Monitoring**

### **Execution Logging**

All hook decisions logged to `.claude/hooks/execution.log`:

```
[2025-11-19 21:27:02] [skill-catalog] [CATALOG] [NOTIFY] [Read] Notifying Combat Systems Expert (56%)
[2025-11-19 21:27:29] [skill-catalog] [NONE] [ALLOW] [Read] Combat Systems Expert already shown this session
[2025-11-19 21:29:51] [skill-tracking-reset] [RESET] [SUCCESS] [Stop] Cleared tracking for next session
```

### **Session Analytics**

Track skill usage patterns:
- Most frequently shown catalogs
- Most loaded skills
- Average session duration
- Skills never loaded (consider removal/improvement)

---

## 🔍 **Troubleshooting**

### **ChromaDB Not Found**

```
ERROR: Collection [game_skills] does not exist
```

**Solution**: Run your setup script to populate ChromaDB.

### **Catalog Not Appearing**

1. Check hook is configured in `.claude/settings.json`
2. Verify file path matches domain patterns in `detect_skill_from_file()`
3. Check `execution.log` for SKIPPED entries

### **Wrong Skills Suggested**

1. Review ChromaDB embeddings - may need re-indexing
2. Adjust similarity thresholds
3. Add more descriptive content to skill files

### **Tracking Not Resetting**

1. Verify Stop/SubagentStop hooks configured
2. Check `execution.log` for reset entries
3. Manually delete `.shown_skills.json` to reset

---

## 🚀 **Next Steps**

1. **Populate ChromaDB** with your domain skills
2. **Customize domain patterns** in `skill_catalog_posttool.py`
3. **Tune thresholds** based on your skill relevance needs
4. **Monitor `execution.log`** to optimize patterns
5. **Integrate with response-awareness** tiers for optimal orchestration

---

## 📚 **Additional Resources**

- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Response-Awareness Framework](../commands/response-awareness.md)
- [Hook System Guide](HOOK_BEHAVIOR_MATRIX.md)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/claude-code)

---

**Last Updated**: 2025-11-19
**Version**: 1.0
**Status**: Production-Ready
