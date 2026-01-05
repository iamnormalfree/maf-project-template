#!/usr/bin/env python3
"""
Skill Catalog PostToolUse Hook - Semantic Tool Discovery

After reading a file, queries ChromaDB for semantically relevant tools/resources
and notifies Claude once per tool per session.

Also tracks skill gaps - areas where no relevant skill was found - for later
compilation into improvement suggestions.

Uses shared chromadb_client module for cached embedding function (~1.8s savings).
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime

try:
    from hook_logger import log_hook_decision
except ImportError:
    def log_hook_decision(*args, **kwargs):
        pass

try:
    from chromadb_client import search_skills, is_available
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    def search_skills(*args, **kwargs):
        return {'skills': [], 'best_match': None, 'best_relevance': '0%', 'is_gap': True}
    def is_available():
        return False

# Tracking file location
TRACKING_FILE = Path(__file__).parent / ".shown_skills.json"
# Skill gaps tracking - areas with no relevant skills found
SKILL_GAPS_FILE = Path(__file__).parent / ".skill_gaps.json"

# Multi-result configuration
MAX_SKILLS_TO_SHOW = 3  # Show up to 3 relevant skills
MIN_RELEVANCE = 0.25    # 25% minimum relevance to show a skill (below this = skill gap)
RENOTIFY_THRESHOLD = 0.20  # Re-notify if new relevance exceeds previous by this much


def load_shown_skills():
    """Load skill tracking data including relevance scores.

    Returns: dict mapping skill_name -> highest_relevance_seen
    """
    if TRACKING_FILE.exists():
        try:
            with open(TRACKING_FILE, 'r') as f:
                data = json.load(f)
                # Support both old format (list) and new format (dict with relevances)
                shown = data.get('shown_skills', [])
                if isinstance(shown, list):
                    # Old format - convert to dict with 0 relevance
                    return {name: 0 for name in shown}
                return shown
        except Exception:
            return {}
    return {}


def mark_skill_shown(skill_name, relevance):
    """Mark a tool as shown with its relevance score."""
    shown = load_shown_skills()

    # Update with max relevance seen
    current = shown.get(skill_name, 0)
    shown[skill_name] = max(current, relevance)

    try:
        existing_data = {}
        if TRACKING_FILE.exists():
            with open(TRACKING_FILE, 'r') as f:
                existing_data = json.load(f)

        existing_data['shown_skills'] = shown

        with open(TRACKING_FILE, 'w') as f:
            json.dump(existing_data, f, indent=2)
    except Exception as e:
        print(f"Warning: Could not save tracking: {e}", file=sys.stderr)


def should_renotify(skill_name, new_relevance, shown_skills):
    """Check if we should re-notify about a skill due to significantly higher relevance."""
    if skill_name not in shown_skills:
        return True

    previous_relevance = shown_skills.get(skill_name, 0)
    # Re-notify if new relevance exceeds previous by threshold
    return (new_relevance - previous_relevance) >= RENOTIFY_THRESHOLD


def load_skill_gaps():
    """Load existing skill gaps from this session."""
    if SKILL_GAPS_FILE.exists():
        try:
            with open(SKILL_GAPS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {'gaps': [], 'session_start': datetime.now().isoformat()}
    return {'gaps': [], 'session_start': datetime.now().isoformat()}


def record_skill_gap(file_path, content_sample, best_match=None, best_relevance=None):
    """Record a skill gap - an area where no relevant skill was found.

    Args:
        file_path: The file being worked on
        content_sample: Sample of content for context
        best_match: The closest skill found (if any)
        best_relevance: The relevance of that match (if any)
    """
    gaps_data = load_skill_gaps()

    # Extract domain hints from file path and content
    domain_hints = extract_domain_hints(file_path, content_sample)

    gap_entry = {
        'file_path': file_path,
        'domain_hints': domain_hints,
        'content_preview': content_sample[:200] if content_sample else '',
        'best_match': best_match,
        'best_relevance': best_relevance,
        'timestamp': datetime.now().isoformat()
    }

    # Avoid duplicate entries for same file
    existing_files = {g.get('file_path') for g in gaps_data['gaps']}
    if file_path not in existing_files:
        gaps_data['gaps'].append(gap_entry)

        try:
            with open(SKILL_GAPS_FILE, 'w') as f:
                json.dump(gaps_data, f, indent=2)
            log_hook_decision("skill-catalog", "GAP", "RECORDED", "Read",
                            f"Gap recorded for {file_path} (domain: {domain_hints})")
        except Exception as e:
            print(f"Warning: Could not save skill gap: {e}", file=sys.stderr)


def extract_domain_hints(file_path, content_sample):
    """Extract domain hints from file path and content to help categorize gaps."""
    hints = []

    path_lower = file_path.lower()
    content_lower = (content_sample or '').lower()

    # File extension hints
    if path_lower.endswith('.py'):
        hints.append('python')
    elif path_lower.endswith(('.ts', '.tsx')):
        hints.append('typescript')
    elif path_lower.endswith(('.js', '.jsx')):
        hints.append('javascript')
    elif path_lower.endswith('.md'):
        hints.append('documentation')
    elif path_lower.endswith('.json'):
        hints.append('configuration')
    elif path_lower.endswith(('.yaml', '.yml')):
        hints.append('configuration')

    # Path-based domain hints
    domain_keywords = {
        'test': 'testing',
        'spec': 'testing',
        'auth': 'authentication',
        'api': 'api-design',
        'hook': 'hooks',
        'agent': 'agents',
        'skill': 'skills',
        'ui': 'user-interface',
        'component': 'components',
        'model': 'data-modeling',
        'schema': 'data-modeling',
        'migrat': 'migrations',
        'deploy': 'deployment',
        'docker': 'containerization',
        'ci': 'ci-cd',
        'workflow': 'automation',
        'game': 'game-development',
        'combat': 'game-mechanics',
        'quest': 'game-mechanics',
        'dialogue': 'game-narrative',
        'inventory': 'game-systems',
        'character': 'game-systems',
    }

    for keyword, domain in domain_keywords.items():
        if keyword in path_lower or keyword in content_lower:
            if domain not in hints:
                hints.append(domain)

    return hints if hints else ['general']


def get_skill_gaps_summary():
    """Get a summary of skill gaps for reporting."""
    gaps_data = load_skill_gaps()

    if not gaps_data.get('gaps'):
        return None

    # Group gaps by domain
    domain_gaps = {}
    for gap in gaps_data['gaps']:
        for domain in gap.get('domain_hints', ['general']):
            if domain not in domain_gaps:
                domain_gaps[domain] = []
            domain_gaps[domain].append(gap)

    return {
        'total_gaps': len(gaps_data['gaps']),
        'by_domain': domain_gaps,
        'session_start': gaps_data.get('session_start')
    }


def query_chromadb_for_file(file_path, content_sample=""):
    """Query ChromaDB to find relevant tools based on file content/path.

    Uses shared chromadb_client module for cached embedding function.

    Returns: dict with:
        - 'skills': list of {tool_name, relevance_pct, similarity, description, path} for relevant skills
        - 'best_match': the top result (even if low relevance)
        - 'is_gap': True if top result is below gap threshold
    Or None if DB unavailable
    """
    if not CHROMADB_AVAILABLE or not is_available():
        return None

    # Create search query - prefer content over filename
    if content_sample and len(content_sample) > 50:
        search_query = content_sample[:500]  # First 500 chars
    else:
        file_name = Path(file_path).name
        search_query = file_name

    # Use shared search function
    result = search_skills(
        query=search_query,
        max_results=MAX_SKILLS_TO_SHOW,
        min_relevance=MIN_RELEVANCE
    )

    # Convert to expected format (skill -> tool_name for compatibility)
    skills = []
    for skill in result.get('skills', []):
        skills.append({
            'tool_name': skill['name'],
            'relevance_pct': skill['relevance_pct'],
            'similarity': skill['similarity'],
            'description': skill.get('description', ''),
            'path': skill.get('path', '')
        })

    return {
        'skills': skills,
        'best_match': result.get('best_match'),
        'best_relevance': result.get('best_relevance', '0%'),
        'is_gap': result.get('is_gap', True)
    }


def generate_catalog(skills, file_path):
    """Generate friendly catalog message for multiple skills with descriptions.

    Args:
        skills: list of {tool_name, relevance_pct, similarity, description, path} dicts
        file_path: the file that was read
    """
    if not skills:
        return None

    # Build skill list with descriptions
    skill_lines = []
    for i, skill in enumerate(skills, 1):
        name = skill['tool_name']
        relevance = skill['relevance_pct']
        desc = skill.get('description', '')

        skill_lines.append(f"  {i}. {name} ({relevance})")
        if desc:
            # Truncate description to fit nicely
            desc_truncated = desc[:70] + "..." if len(desc) > 70 else desc
            skill_lines.append(f"     {desc_truncated}")

    skills_text = '\n'.join(skill_lines)

    # Show load command
    if len(skills) == 1:
        top_skill = skills[0]['tool_name']
        return f"""
[SKILL CATALOG] Relevant Resource Available

After reading: {file_path}

{skills_text}

  Load: python .claude/hooks/query_skill.py "{top_skill}"
  Search: python .claude/hooks/query_skill.py --search "your query"
"""
    else:
        return f"""
[SKILL CATALOG] {len(skills)} Relevant Resources Available

After reading: {file_path}

{skills_text}

  Load: python .claude/hooks/query_skill.py "<skill_name>"
  Search: python .claude/hooks/query_skill.py --search "your query"
"""


def generate_gap_notification(file_path, best_match, best_relevance, domain_hints):
    """Generate an active notification when a skill gap is detected."""
    domains = ', '.join(domain_hints[:3]) if domain_hints else 'general'

    return f"""
[SKILL GAP] No relevant skills found (best match: {best_match} @ {best_relevance})

For file: {file_path}
Domain hints: {domains}

Consider documenting: #SKILL_GAP: {domain_hints[0] if domain_hints else 'unknown'}
Or search: python .claude/hooks/query_skill.py --search "your specific need"
"""


def main():
    """Main hook entry point."""
    tool_name = os.environ.get('TOOL_NAME', 'Read')

    # Get tool result to extract file path and content
    tool_result = sys.stdin.read()

    # Try to extract file path from tool result or environment
    file_path = os.environ.get('TOOL_INPUT_file_path', '')

    if not file_path:
        # Try to parse from tool_result if available
        import re
        match = re.search(r'file_path["\s:=]+["\']?([^"\']+)', tool_result)
        if match:
            file_path = match.group(1)

    if not file_path:
        log_hook_decision("skill-catalog", "NONE", "SKIPPED", tool_name, "No file path detected")
        sys.exit(0)

    # Read file content for semantic search
    content_sample = ""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content_sample = f.read(500)  # First 500 chars
    except Exception:
        # If we can't read the file, just use filename
        pass

    # Query ChromaDB for relevant tools
    query_result = query_chromadb_for_file(file_path, content_sample)

    if not query_result:
        # ChromaDB not available - can't track gaps or show catalogs
        log_hook_decision("skill-catalog", "NONE", "SKIPPED", tool_name, f"ChromaDB unavailable for {file_path}")
        sys.exit(0)

    skills = query_result.get('skills', [])

    # If no skills meet threshold, it's a skill gap - record it and NOTIFY
    if query_result.get('is_gap') or not skills:
        domain_hints = extract_domain_hints(file_path, content_sample)
        record_skill_gap(
            file_path,
            content_sample,
            best_match=query_result.get('best_match'),
            best_relevance=query_result.get('best_relevance')
        )

        # Generate active gap notification
        gap_notification = generate_gap_notification(
            file_path,
            query_result.get('best_match', 'none'),
            query_result.get('best_relevance', '0%'),
            domain_hints
        )

        log_hook_decision("skill-catalog", "GAP", "NOTIFY", tool_name,
                        f"Skill gap for {file_path} (best: {query_result.get('best_match')} @ {query_result.get('best_relevance')})")
        print(gap_notification, file=sys.stderr)
        sys.exit(2)  # Inject gap notification to Claude

    # Check which skills should be shown (new or significantly higher relevance)
    shown_skills = load_shown_skills()
    skills_to_show = []

    for skill in skills:
        skill_name = skill['tool_name']
        similarity = skill['similarity']

        if should_renotify(skill_name, similarity, shown_skills):
            skills_to_show.append(skill)

    if not skills_to_show:
        # All relevant skills already shown at similar or higher relevance
        skill_names = [s['tool_name'] for s in skills]
        log_hook_decision("skill-catalog", "NONE", "ALLOW", tool_name,
                        f"All skills already shown at sufficient relevance: {skill_names}")
        sys.exit(0)

    # Mark all shown skills with their relevance
    for skill in skills_to_show:
        mark_skill_shown(skill['tool_name'], skill['similarity'])

    # Generate catalog and show (exit 2 to inject)
    catalog = generate_catalog(skills_to_show, file_path)

    skill_names = [f"{s['tool_name']} ({s['relevance_pct']})" for s in skills_to_show]
    log_hook_decision("skill-catalog", "CATALOG", "NOTIFY", tool_name,
                    f"Notifying {len(skills_to_show)} skills: {skill_names}")
    print(catalog, file=sys.stderr)
    sys.exit(2)  # Inject to Claude


if __name__ == "__main__":
    main()
