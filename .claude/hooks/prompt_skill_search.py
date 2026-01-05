#!/usr/bin/env python3
"""
UserPromptSubmit Hook - Proactive Skill Search

Searches ChromaDB for skills relevant to the user's prompt and suggests
them before Claude starts working. Shows skills with path information
to help locate relevant codebase areas.

Uses shared chromadb_client module for cached embedding function (~1.8s savings).
"""

import sys
import json

try:
    from chromadb_client import search_skills, is_available
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False

# Configuration
MIN_RELEVANCE = 0.30  # 30% minimum for prompt-based suggestions (higher than file-based)
MAX_SKILLS = 3


def search_skills_for_prompt(prompt):
    """Search for skills relevant to the user's prompt."""
    if not CHROMADB_AVAILABLE or not is_available():
        return None

    result = search_skills(
        query=prompt,
        max_results=MAX_SKILLS,
        min_relevance=MIN_RELEVANCE
    )

    skills = result.get('skills', [])
    return skills if skills else None


def generate_suggestion(skills, prompt_preview):
    """Generate a skill suggestion message."""
    if not skills:
        return None

    lines = [
        "",
        "[SKILL SUGGESTIONS] Based on your request:",
        f'  "{prompt_preview}"',
        "",
    ]

    for i, skill in enumerate(skills, 1):
        lines.append(f"  {i}. {skill['name']} ({skill['relevance']}% match)")
        if skill.get('description'):
            lines.append(f"     {skill['description'][:60]}...")
        if skill.get('path'):
            lines.append(f"     Path: {skill['path']}")

    lines.extend([
        "",
        "  Load: python .claude/hooks/query_skill.py \"<skill_name>\"",
        "  Search: python .claude/hooks/query_skill.py --search \"query\"",
        ""
    ])

    return '\n'.join(lines)


def main():
    """Main hook entry point for UserPromptSubmit."""
    try:
        # Read the hook input
        input_data = sys.stdin.read()

        # Parse as JSON (Claude Code sends prompt data as JSON)
        try:
            data = json.loads(input_data)
            prompt = data.get('prompt', '') or data.get('message', '') or input_data
        except json.JSONDecodeError:
            prompt = input_data

        if not prompt or len(prompt) < 10:
            # Too short to search meaningfully
            sys.exit(0)

        # Search for relevant skills
        skills = search_skills_for_prompt(prompt)

        if skills:
            # Generate and output suggestion
            prompt_preview = prompt[:50] + "..." if len(prompt) > 50 else prompt
            suggestion = generate_suggestion(skills, prompt_preview)

            if suggestion:
                print(suggestion, file=sys.stderr)
                sys.exit(2)  # Inject to Claude

        # No relevant skills found - exit silently
        sys.exit(0)

    except Exception as e:
        # On any error, fail silently
        sys.exit(0)


if __name__ == "__main__":
    main()
