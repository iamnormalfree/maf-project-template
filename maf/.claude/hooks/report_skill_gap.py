#!/usr/bin/env python3
"""
Report Skill Gap - Manual Gap Reporting Utility

Allows agents and users to manually report skill gaps when they encounter
areas that could benefit from having a skill in the catalog.

Usage:
    python .claude/hooks/report_skill_gap.py "domain" "description" ["context"]

Example:
    python .claude/hooks/report_skill_gap.py "websocket-testing" "Need skill for WebSocket connection testing and message validation" "Working on real-time chat feature"
"""

import sys
import json
from pathlib import Path
from datetime import datetime

SKILL_GAPS_FILE = Path(__file__).parent / ".skill_gaps.json"


def load_skill_gaps():
    """Load existing skill gaps from this session."""
    if SKILL_GAPS_FILE.exists():
        try:
            with open(SKILL_GAPS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {'gaps': [], 'session_start': datetime.now().isoformat()}
    return {'gaps': [], 'session_start': datetime.now().isoformat()}


def report_gap(domain: str, description: str, context: str = ""):
    """Report a skill gap manually.

    Args:
        domain: The domain/category for the skill (e.g., 'websocket-testing', 'graphql-api')
        description: Description of what skill is needed
        context: Optional context about when/where this gap was encountered
    """
    gaps_data = load_skill_gaps()

    gap_entry = {
        'file_path': f'manual-report:{domain}',
        'domain_hints': [domain],
        'content_preview': description,
        'description': description,
        'context': context,
        'best_match': None,
        'best_relevance': None,
        'timestamp': datetime.now().isoformat(),
        'source': 'manual'
    }

    gaps_data['gaps'].append(gap_entry)

    try:
        with open(SKILL_GAPS_FILE, 'w') as f:
            json.dump(gaps_data, f, indent=2)
        print(f"✓ Skill gap recorded: [{domain}] {description[:50]}...")
        return True
    except Exception as e:
        print(f"✗ Failed to record skill gap: {e}", file=sys.stderr)
        return False


def list_gaps():
    """List all recorded skill gaps in current session."""
    gaps_data = load_skill_gaps()
    gaps = gaps_data.get('gaps', [])

    if not gaps:
        print("No skill gaps recorded in current session.")
        return

    print(f"\nRecorded Skill Gaps ({len(gaps)} total):")
    print("-" * 50)

    for i, gap in enumerate(gaps, 1):
        domain = gap.get('domain_hints', ['unknown'])[0]
        desc = gap.get('description') or gap.get('content_preview', '')[:60]
        source = gap.get('source', 'auto')
        print(f"{i}. [{domain}] ({source})")
        print(f"   {desc}")

    print("-" * 50)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == '--list':
        list_gaps()
        sys.exit(0)

    if len(sys.argv) < 3:
        print("Error: Need both domain and description")
        print("Usage: python report_skill_gap.py \"domain\" \"description\" [\"context\"]")
        sys.exit(1)

    domain = sys.argv[1]
    description = sys.argv[2]
    context = sys.argv[3] if len(sys.argv) > 3 else ""

    success = report_gap(domain, description, context)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
