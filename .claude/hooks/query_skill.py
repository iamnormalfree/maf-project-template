#!/usr/bin/env python3
"""
Quick Skill Query Helper - Load skill from ChromaDB

Usage:
    python query_skill.py "skill-name"           # Load a specific skill by name
    python query_skill.py --search "query"       # Search for skills by semantic similarity
    python query_skill.py --list                 # List all available skills

Examples:
    python query_skill.py "Metacognitive Tag Reference"
    python query_skill.py --search "how to handle WebSocket testing"
    python query_skill.py --search "tier selection complexity scoring"

Uses shared chromadb_client module for cached embedding function.
"""

import sys
import io

# Fix Windows encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from pathlib import Path

try:
    from chromadb_client import get_skills_collection, search_skills, is_available
except ImportError:
    print("ERROR: chromadb_client module not found", file=sys.stderr)
    sys.exit(1)

# Configuration
MIN_RELEVANCE = 0.25  # 25% minimum for search results


def list_skills():
    """List all available skills with descriptions."""
    collection = get_skills_collection()
    if collection is None:
        print("ERROR: ChromaDB not available", file=sys.stderr)
        return False

    try:
        results = collection.get(include=["metadatas", "documents"])

        print("=" * 60)
        print("AVAILABLE SKILLS")
        print("=" * 60)

        skills = []
        for meta, doc in zip(results['metadatas'], results['documents']):
            name = meta.get('name', 'Unknown')
            path = meta.get('path', '')
            # Extract first line of content as description
            first_line = doc.split('\n')[0][:80] if doc else ''
            skills.append((name, path, first_line))

        for name, path, desc in sorted(skills):
            print(f"\n  {name}")
            if path:
                print(f"    Path: {path}")
            if desc:
                print(f"    Preview: {desc}...")

        print(f"\n{'=' * 60}")
        print(f"Total: {len(skills)} skills")
        return True

    except Exception as e:
        print(f"ERROR listing skills: {e}", file=sys.stderr)
        return False


def search_skills_cmd(query: str, top_n: int = 5):
    """Search for skills by semantic similarity."""
    result = search_skills(
        query=query,
        max_results=top_n,
        min_relevance=0  # Show all results, mark below threshold
    )

    if not result.get('skills') and not result.get('best_match'):
        print(f"No skills found for query: {query}")
        return False

    print("=" * 60)
    print(f"SEARCH RESULTS: \"{query}\"")
    print("=" * 60)

    # Get all results including below threshold
    collection = get_skills_collection()
    if collection is None:
        return False

    try:
        results = collection.query(
            query_texts=[query],
            n_results=top_n,
            include=["distances", "metadatas", "documents"]
        )

        found_relevant = False
        for i, (meta, dist, doc) in enumerate(zip(
            results['metadatas'][0],
            results['distances'][0],
            results['documents'][0]
        )):
            similarity = 1 - dist
            relevance_pct = int(similarity * 100)
            name = meta.get('name', 'Unknown')
            path = meta.get('path', '')

            # Get first meaningful line as description
            lines = [l.strip() for l in doc.split('\n') if l.strip() and not l.startswith('#')]
            desc = lines[0][:100] if lines else ''

            # Mark if above threshold
            marker = "[*]" if similarity >= MIN_RELEVANCE else "[ ]"
            if similarity >= MIN_RELEVANCE:
                found_relevant = True

            print(f"\n{marker} {i+1}. {name} ({relevance_pct}% relevance)")
            if path:
                print(f"    Path: {path}")
            if desc:
                print(f"    Description: {desc}...")
            print(f"    Load with: python .claude/hooks/query_skill.py \"{name}\"")

        print(f"\n{'=' * 60}")
        if not found_relevant:
            print(f"[!] No skills above {int(MIN_RELEVANCE*100)}% threshold - this may be a skill gap")
            print(f"    Consider: #SKILL_GAP: <domain> - \"{query}\"")

        return found_relevant

    except Exception as e:
        print(f"ERROR searching skills: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False


def load_skill(skill_name: str):
    """Load a skill from ChromaDB by exact name."""
    collection = get_skills_collection()
    if collection is None:
        print("ERROR: ChromaDB not available", file=sys.stderr)
        return False

    try:
        # Query for the skill by name
        results = collection.get(
            where={"name": skill_name},
            include=["documents", "metadatas"]
        )

        if not results['documents']:
            print(f"ERROR: Skill '{skill_name}' not found in database", file=sys.stderr)
            print(f"\nDid you mean one of these?", file=sys.stderr)

            # Search for similar skills
            search_results = collection.query(
                query_texts=[skill_name],
                n_results=3,
                include=["metadatas", "distances"]
            )

            for meta, dist in zip(search_results['metadatas'][0], search_results['distances'][0]):
                similarity = int((1 - dist) * 100)
                print(f"  - {meta.get('name', '?')} ({similarity}% match)", file=sys.stderr)

            return False

        # Return the skill content
        skill_metadata = results['metadatas'][0]
        skill_content = skill_metadata.get('content', results['documents'][0])

        print(f"# {skill_metadata.get('name', 'Unknown Skill')}")
        print(f"# Type: {skill_metadata.get('type', 'N/A')}")
        if skill_metadata.get('path'):
            print(f"# Path: {skill_metadata.get('path')}")
        print()
        print(skill_content)

        return True

    except Exception as e:
        print(f"ERROR loading skill: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    arg = sys.argv[1]

    if arg == '--list':
        success = list_skills()
    elif arg == '--search':
        if len(sys.argv) < 3:
            print("ERROR: --search requires a query argument", file=sys.stderr)
            print("Usage: python query_skill.py --search \"your query\"", file=sys.stderr)
            sys.exit(1)
        query = sys.argv[2]
        success = search_skills_cmd(query)
    elif arg.startswith('--'):
        print(f"ERROR: Unknown option '{arg}'", file=sys.stderr)
        print(__doc__)
        sys.exit(1)
    else:
        success = load_skill(arg)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
