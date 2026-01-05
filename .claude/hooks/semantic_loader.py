#!/usr/bin/env python3
"""
Agentic-Aware Semantic Skill Loader Hook for Claude Code

Intercepts user prompts via UserPromptSubmit hook and enriches them with:
1. Compressed catalog of top 10 relevant skills/tools (~200 tokens)
2. Full content of top 2 high-confidence matches (similarity > 0.85)
3. **NEW: Agentic loop awareness** - Tracks Claude's working context and
   dynamically updates skills based on what Claude is actively working on

This reduces context window tax while maintaining discoverability and
reactively loads skills as Claude works through multi-step tasks.
"""

import sys
import json
import os
from pathlib import Path
import chromadb
from chromadb.config import Settings

# Import agentic components
try:
    from session_context import get_session_context
    from intent_parser import get_intent_parser, parse_text_for_skills
except ImportError:
    # Add current directory to path
    sys.path.insert(0, str(Path(__file__).parent))
    try:
        from session_context import get_session_context
        from intent_parser import get_intent_parser, parse_text_for_skills
    except ImportError:
        # Agentic features not available, continue without them
        get_session_context = None
        get_intent_parser = None
        parse_text_for_skills = None


# Configuration
HIGH_CONFIDENCE_THRESHOLD = 0.3  # Distance threshold (lower = more similar)
MEDIUM_CONFIDENCE_THRESHOLD = 0.7
TOP_N_RESULTS = 10
AUTO_INJECT_TOP_N = 2

# Agentic configuration
ENABLE_AGENTIC_AWARENESS = True  # Enable agentic loop tracking
AGENTIC_BOOST_FACTOR = 0.15      # Boost similarity for skills in working context


def load_skill_content(skill_name: str, skills_dir: Path) -> str:
    """Load full content of a skill from its SKILL.md file."""
    skill_path = skills_dir / skill_name / "SKILL.md"

    if not skill_path.exists():
        return f"[Skill content not found at {skill_path}]"

    try:
        with open(skill_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"[Error loading skill: {e}]"


def create_compressed_catalog(results, distances):
    """Create a compressed catalog entry for medium-confidence matches."""
    catalog_lines = []

    for metadata, distance in zip(results, distances):
        name = metadata['name']
        item_type = metadata['type']
        description = metadata['description']

        # Create one-line entry with similarity score
        similarity = 1 - distance
        similarity_pct = int(similarity * 100)

        # Truncate description to first sentence or 100 chars
        desc_short = description.split('.')[0][:100]

        # Format: name (type) [similarity%]: description
        catalog_line = f"  • {name} ({item_type}) [{similarity_pct}%]: {desc_short}"
        catalog_lines.append(catalog_line)

    return "\n".join(catalog_lines)


def query_chromadb(prompt: str, db_path: Path):
    """Query ChromaDB for relevant skills and tools."""
    try:
        # Initialize client
        client = chromadb.PersistentClient(
            path=str(db_path),
            settings=Settings(
                anonymized_telemetry=False
            )
        )

        # Get collection
        collection = client.get_collection("game_skills")

        # Query
        results = collection.query(
            query_texts=[prompt],
            n_results=TOP_N_RESULTS
        )

        return results

    except Exception as e:
        print(f"Warning: ChromaDB query failed: {e}", file=sys.stderr)
        return None


def get_agentic_context_boost(session):
    """
    Get skills that should be boosted based on working context.

    Returns dict of {skill_name: boost_amount}
    """
    if not ENABLE_AGENTIC_AWARENESS or session is None:
        return {}

    boosts = {}

    # Get recent working context
    working_contexts = session.get_working_context()

    # Get recent intents
    recent_intents = session.get_recent_intents(n=3)

    # Parse working context for skills
    for context in working_contexts:
        if parse_text_for_skills:
            skills = parse_text_for_skills(context)
            for skill in skills:
                boosts[skill] = boosts.get(skill, 0) + AGENTIC_BOOST_FACTOR

    # Add skills from recent intents
    for intent_data in recent_intents:
        for skill in intent_data.get('skills', []):
            boosts[skill] = boosts.get(skill, 0) + AGENTIC_BOOST_FACTOR

    return boosts


def apply_agentic_boosts(results, distances, agentic_boosts):
    """Apply agentic context boosts to similarity scores."""
    if not agentic_boosts or not results or not distances:
        return results, distances

    metadatas = results['metadatas'][0] if results.get('metadatas') else []
    original_distances = distances.copy()

    boosted_distances = []
    for i, metadata in enumerate(metadatas):
        skill_name = metadata.get('name', '')
        distance = original_distances[i]

        # Apply boost (reduce distance = increase similarity)
        if skill_name in agentic_boosts:
            boost = agentic_boosts[skill_name]
            distance = max(0, distance - boost)  # Don't go below 0

        boosted_distances.append(distance)

    # Update results with boosted distances
    results['distances'][0] = boosted_distances

    return results, boosted_distances


def enrich_prompt(prompt: str, db_path: Path, skills_dir: Path):
    """
    Enrich prompt with relevant skills based on semantic similarity
    and agentic working context.
    """

    # Get session context (if available)
    session = None
    if get_session_context:
        try:
            session = get_session_context()
        except:
            pass

    # Parse prompt for action intent
    if parse_text_for_skills:
        prompt_skills = parse_text_for_skills(prompt)
        if session and prompt_skills:
            session.add_intent("User prompt", prompt_skills)
            session.add_working_context(f"User request: {prompt[:100]}")

    # Query database
    results = query_chromadb(prompt, db_path)

    if not results or not results['metadatas'] or not results['metadatas'][0]:
        # No results, return original prompt
        print("No ChromaDB results found", file=sys.stderr)
        return {
            "prompt": prompt,
            "dynamic_skills": None
        }

    metadatas = results['metadatas'][0]
    distances = results['distances'][0]

    # **AGENTIC AWARENESS**: Apply boosts based on working context
    agentic_boosts = get_agentic_context_boost(session)

    if agentic_boosts:
        print(f"Agentic boosts: {agentic_boosts}", file=sys.stderr)
        results, distances = apply_agentic_boosts(results, distances, agentic_boosts)
        metadatas = results['metadatas'][0]

    # Separate into high and medium confidence
    high_confidence = []
    medium_confidence = []

    for metadata, distance in zip(metadatas, distances):
        if distance < HIGH_CONFIDENCE_THRESHOLD:
            high_confidence.append((metadata, distance))
        elif distance < MEDIUM_CONFIDENCE_THRESHOLD:
            medium_confidence.append((metadata, distance))

    # Build enriched content
    enrichment_parts = []

    # **AGENTIC CONTEXT**: Show working context if available
    if session and agentic_boosts:
        enrichment_parts.append("## 🤖 Agentic Working Context\n")
        enrichment_parts.append("Skills boosted based on recent activity:\n")
        for skill, boost in sorted(agentic_boosts.items(), key=lambda x: x[1], reverse=True):
            enrichment_parts.append(f"  • {skill} (+{boost:.0%} relevance boost)\n")
        enrichment_parts.append("\n")

    # Add compressed catalog (always)
    enrichment_parts.append("## Available Skills and Tools (Top Matches)\n")
    enrichment_parts.append("The following skills and tools are available and semantically relevant to your query:\n")

    # Catalog of all top results
    catalog = create_compressed_catalog(metadatas, distances)
    enrichment_parts.append(catalog)

    enrichment_parts.append("\nUse `query_skill(skill_name)` MCP tool to load full content of any skill.\n")

    # Auto-inject high-confidence matches (top 2)
    auto_inject_count = min(AUTO_INJECT_TOP_N, len(high_confidence))

    if auto_inject_count > 0:
        enrichment_parts.append("\n---\n")
        enrichment_parts.append("## Auto-Loaded High-Confidence Skills\n")
        enrichment_parts.append("The following skills are highly relevant (loaded automatically):\n\n")

        for metadata, distance in high_confidence[:auto_inject_count]:
            name = metadata['name']
            item_type = metadata['type']
            similarity = 1 - distance

            enrichment_parts.append(f"### {name} ({item_type}) - {similarity:.1%} match\n\n")

            # Load full content for skills
            if item_type == 'skill':
                content = load_skill_content(name, skills_dir)
                enrichment_parts.append(content)
                enrichment_parts.append("\n\n---\n\n")
            else:
                # For tools, just show description
                enrichment_parts.append(metadata['description'])
                enrichment_parts.append("\n\n")

    # Combine enrichment
    enrichment_text = "".join(enrichment_parts)

    # Calculate approximate token count (rough estimate: 4 chars = 1 token)
    approx_tokens = len(enrichment_text) // 4

    # **AGENTIC TRACKING**: Record loaded skills in session
    loaded_skills = [metadata['name'] for metadata, _ in high_confidence[:auto_inject_count]]
    if session and loaded_skills:
        session.update_loaded_skills(loaded_skills)

    print(f"Enriched prompt with {len(metadatas)} matches, {auto_inject_count} auto-injected (~{approx_tokens} tokens)", file=sys.stderr)
    if agentic_boosts:
        print(f"Agentic boosts applied: {list(agentic_boosts.keys())}", file=sys.stderr)

    # Return enriched prompt
    return {
        "prompt": prompt,
        "dynamic_skills": enrichment_text
    }


def main():
    """Main hook entry point."""
    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)
        prompt = input_data.get('prompt', '')

        if not prompt:
            print("Warning: Empty prompt received", file=sys.stderr)
            json.dump({"prompt": prompt}, sys.stdout)
            return

        # Get paths
        script_dir = Path(__file__).parent.parent.parent  # Go up from .claude/hooks/
        db_path = script_dir / "skill-loader-test" / "skill_db"
        skills_dir = script_dir / "domain-skills"

        # Check if database exists
        if not db_path.exists():
            print(f"Warning: ChromaDB not initialized at {db_path}. Run setup_db.py first.", file=sys.stderr)
            json.dump({"prompt": prompt}, sys.stdout)
            return

        # Enrich prompt
        result = enrich_prompt(prompt, db_path, skills_dir)

        # Output enriched prompt
        json.dump(result, sys.stdout, indent=2)

    except Exception as e:
        print(f"Error in semantic loader hook: {e}", file=sys.stderr)
        # Return original prompt on error
        try:
            input_data = json.load(sys.stdin)
            json.dump({"prompt": input_data.get('prompt', '')}, sys.stdout)
        except:
            json.dump({"prompt": ""}, sys.stdout)


if __name__ == "__main__":
    main()
