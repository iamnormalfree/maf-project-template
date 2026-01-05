# Semantic Skill Loader - Added to Response-Awareness Framework

**For**: Claude Code instances (AI agents)
**Date**: 2025-11-19
**Version**: 1.0
**Status**: Production-Ready

> This system enables Claude to access domain-specific expertise on-demand through semantic search, preserving context window for actual work.

---

## 📦 **Files Added**

### **Core Hook Files**

| File | Type | Purpose |
|------|------|---------|
| `semantic_loader.py` | UserPromptSubmit Hook | Semantic search on user prompts, auto-inject high-relevance skills |
| `skill_catalog_posttool.py` | PostToolUse:Read Hook | Domain-aware catalog after file reads |
| `query_skill.py` | Utility Script | Load skills from ChromaDB on demand |
| `reset_skill_tracking.py` | Stop/SubagentStop Hook | Clear session tracking when agents complete |
| `session_context.py` | Support Module | Agentic loop awareness and context tracking |
| `intent_parser.py` | Support Module | Parse user intent for skill relevance boosting |

### **Documentation**

| File | Purpose |
|------|---------|
| `SEMANTIC_SKILL_LOADER.md` | Complete setup and usage guide |
| `setup_chromadb_example.py` | Template script for populating ChromaDB |
| `SEMANTIC_LOADER_CHANGELOG.md` | This file - changelog and migration guide |

### **README Updates**

- Added "Semantic Skill Loader (NEW)" section with quick setup
- Linked to detailed documentation

---

## 🔧 **Developer Setup Required**

Before deploying the semantic loader to Claude in your project, configure these paths:

### **1. In `semantic_loader.py` (lines ~306-308)**

```python
# OLD (game-specific):
script_dir = Path(__file__).parent.parent.parent
db_path = script_dir / "skill-loader-test" / "skill_db"
skills_dir = script_dir / "domain-skills"

# NEW (customize for your project):
script_dir = Path(__file__).parent.parent.parent  # Adjust if needed
db_path = script_dir / "YOUR_DB_PATH"             # e.g., "skill_db"
skills_dir = script_dir / "YOUR_SKILLS_PATH"      # e.g., "domain-skills"
```

### **2. In `skill_catalog_posttool.py`**

Update the `detect_skill_from_file()` function (lines ~43-78) with your domain patterns:

```python
def detect_skill_from_file(file_path):
    """Detect which skill is relevant based on file path."""
    file_path_lower = file_path.lower()

    # CUSTOMIZE these patterns for your domains:
    if 'your-domain-1' in file_path_lower:
        return ('Domain 1 Expert', '75%')
    elif 'your-domain-2' in file_path_lower:
        return ('Domain 2 Expert', '65%')
    # ... add your domain patterns

    return None
```

### **3. In `query_skill.py` (line ~23)**

```python
# OLD:
def load_skill_from_db(skill_name: str, db_path: str = "skill-loader-test/skill_db"):

# NEW:
def load_skill_from_db(skill_name: str, db_path: str = "YOUR_DB_PATH"):
```

### **4. In `setup_chromadb_example.py` (lines ~18-26)**

```python
# CONFIGURATION - Customize these paths for your project
DB_PATH = "your_db_path"            # Change to your preferred location
SKILLS_DIR = "your_skills_path"     # Change to your skills directory
COLLECTION_NAME = "your_collection" # Change to your preferred name
```

---

## 📋 **Setup Checklist**

- [ ] **Install ChromaDB**: `pip install chromadb`
- [ ] **Create skills directory**: Organize as `domain-skills/skill-name/SKILL.md`
- [ ] **Customize paths** in all hook files (see above)
- [ ] **Run setup script**: `python .claude/hooks/setup_chromadb_example.py`
- [ ] **Configure hooks** in `.claude/settings.json`
- [ ] **Test semantic search**: Verify ChromaDB returns relevant skills
- [ ] **Test catalog hook**: Read a domain file and verify catalog appears
- [ ] **Test skill loading**: Run `python .claude/hooks/query_skill.py "Skill Name"`
- [ ] **Test tracking reset**: Verify tracking clears after session/agent ends

---

## 🚀 **Migration from Game-Specific to Generic**

The hooks were originally developed for a game project with specific paths:

**Original Paths (Game Project)**:
- Database: `skill-loader-test/skill_db`
- Skills: `domain-skills/combat-systems/`, `domain-skills/shop-system/`, etc.
- Collection: `game_skills`

**Generic Paths (Framework)**:
- Database: `YOUR_DB_PATH` (customize)
- Skills: `YOUR_SKILLS_PATH/skill-name/SKILL.md` (customize)
- Collection: `YOUR_COLLECTION` (customize)

**Domain Patterns**:
- Game: `combat`, `shop`, `dialogue`, `ui`, `mcp`, `models`, `engine`
- Generic: Define your own domain keywords in `detect_skill_from_file()`

---

## 🎯 **Key Features**

1. **Token Efficiency**: 98% reduction (catalog ~50 tokens vs full skill ~3,000 tokens)
2. **Semantic Search**: ChromaDB vector similarity matching
3. **Progressive Disclosure**: Catalog first, full content on-demand
4. **Session Tracking**: One catalog per domain per session
5. **Automatic Reset**: Clears tracking when agents complete
6. **Agentic Awareness**: Context-aware relevance boosting
7. **Response-Awareness Integration**: Works with all framework tiers

---

## 📊 **Performance Metrics**

From production use in game development project:

| Metric | Value |
|--------|-------|
| Token savings per skill | 98% |
| Catalog display size | ~50 tokens |
| Full skill size | ~3,000 tokens |
| Skills supported | Unlimited (tested with 8+) |
| Semantic search latency | <100ms |
| Session tracking overhead | Minimal (~5ms) |
| ChromaDB storage per skill | ~500 bytes |

---

## 🔍 **Testing**

After setup, verify functionality:

```bash
# 1. Test ChromaDB population
python .claude/hooks/setup_chromadb_example.py

# 2. Test semantic search (via semantic_loader.py)
# Enter a prompt related to your domain - should show catalog

# 3. Test catalog hook
# Read a domain file - should show catalog after read

# 4. Test skill loading
python .claude/hooks/query_skill.py "Your Skill Name"

# 5. Test tracking
# Read same domain file twice - catalog should appear once only

# 6. Test reset
# Complete session/agent - tracking should clear
```

---

## 🐛 **Known Issues & Solutions**

### **ChromaDB Collection Not Found**

**Error**: `Collection [your_collection] does not exist`

**Solution**: Run `setup_chromadb_example.py` to populate the database

### **Catalog Not Appearing**

**Causes**:
1. File path doesn't match domain patterns in `detect_skill_from_file()`
2. Hook not configured in `.claude/settings.json`
3. PostToolUse hook not executing

**Debug**:
- Check `.claude/hooks/execution.log` for SKIPPED entries
- Verify hook configuration
- Add more domain patterns

### **Wrong Path Errors**

**Error**: `FileNotFoundError` or `Path does not exist`

**Solution**: Update paths in all hook files to match your project structure

---

## 📚 **Additional Resources**

- [SEMANTIC_SKILL_LOADER.md](SEMANTIC_SKILL_LOADER.md) - Complete documentation
- [setup_chromadb_example.py](setup_chromadb_example.py) - Setup script template
- [ChromaDB Documentation](https://docs.trychroma.com/) - Vector database docs
- [Response-Awareness Framework](../commands/response-awareness.md) - Main framework

---

## 🎉 **What's Next**

The semantic loader system is production-ready! To enhance it further:

1. **Add more skills**: Expand your domain expertise library
2. **Tune thresholds**: Adjust similarity thresholds for your use case
3. **Monitor usage**: Track which skills are most frequently loaded
4. **Optimize embeddings**: Fine-tune ChromaDB for your domain terminology
5. **Integrate with CI/CD**: Auto-populate skills from documentation

---

**Questions or Issues?**

See [SEMANTIC_SKILL_LOADER.md](SEMANTIC_SKILL_LOADER.md) for troubleshooting, or check execution logs in `.claude/hooks/execution.log`.
