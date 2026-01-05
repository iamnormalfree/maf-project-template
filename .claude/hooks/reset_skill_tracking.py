#!/usr/bin/env python3
"""
Reset Skill Tracking - Stop Hook

Clears the shown skills tracking when an agentic loop completes,
allowing fresh skill catalog display in the next loop.

Also generates a skill gap report before clearing if gaps were found.
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from hook_logger import log_hook_decision

# Tracking file location (same as skill_catalog_pretool.py)
TRACKING_FILE = Path(__file__).parent / ".shown_skills.json"
SKILL_GAPS_FILE = Path(__file__).parent / ".skill_gaps.json"


def generate_skill_gap_report():
    """Generate a report of skill gaps found during the session."""
    if not SKILL_GAPS_FILE.exists():
        return None

    try:
        with open(SKILL_GAPS_FILE, 'r') as f:
            gaps_data = json.load(f)
    except Exception:
        return None

    gaps = gaps_data.get('gaps', [])
    if not gaps:
        return None

    # Group gaps by domain
    domain_gaps = {}
    for gap in gaps:
        for domain in gap.get('domain_hints', ['general']):
            if domain not in domain_gaps:
                domain_gaps[domain] = []
            domain_gaps[domain].append(gap)

    # Generate report
    report_lines = [
        "",
        "=" * 60,
        "SKILL GAP REPORT - Potential New Skills to Add",
        "=" * 60,
        f"Session: {gaps_data.get('session_start', 'unknown')}",
        f"Total gaps identified: {len(gaps)}",
        "",
        "GAPS BY DOMAIN:",
        "-" * 40,
    ]

    for domain, domain_gap_list in sorted(domain_gaps.items()):
        report_lines.append(f"\n📁 {domain.upper()} ({len(domain_gap_list)} gaps):")
        for gap in domain_gap_list[:3]:  # Show top 3 per domain
            file_name = Path(gap['file_path']).name
            best = gap.get('best_match', 'none')
            rel = gap.get('best_relevance', 'N/A')
            report_lines.append(f"   • {file_name}")
            report_lines.append(f"     Closest skill: {best} ({rel})")
            if gap.get('content_preview'):
                preview = gap['content_preview'][:80].replace('\n', ' ')
                report_lines.append(f"     Context: \"{preview}...\"")

    report_lines.extend([
        "",
        "-" * 40,
        "SUGGESTED ACTIONS:",
        "  1. Review gaps to identify patterns",
        "  2. Create new skills for recurring domains",
        "  3. Add to ChromaDB with: python .claude/hooks/setup_chromadb_example.py",
        "=" * 60,
        ""
    ])

    return '\n'.join(report_lines)


def main():
    """Main hook entry point."""
    # Generate skill gap report before clearing (if gaps exist)
    gap_report = generate_skill_gap_report()

    # Clear the tracking file (write empty state instead of deleting)
    try:
        with open(TRACKING_FILE, 'w') as f:
            json.dump({
                'shown_skills': [],
                'last_reset': datetime.now().isoformat(),
                'session_count': 0
            }, f, indent=2)
        log_hook_decision("skill-tracking-reset", "RESET", "SUCCESS", "Stop", "Cleared tracking for next session")
    except Exception as e:
        log_hook_decision("skill-tracking-reset", "RESET", "ERROR", "Stop", f"Failed to clear tracking: {e}")

    # Clear skill gaps file
    try:
        with open(SKILL_GAPS_FILE, 'w') as f:
            json.dump({
                'gaps': [],
                'session_start': datetime.now().isoformat()
            }, f, indent=2)
        log_hook_decision("skill-tracking-reset", "GAPS", "CLEARED", "Stop", "Cleared skill gaps for next session")
    except Exception as e:
        log_hook_decision("skill-tracking-reset", "GAPS", "ERROR", "Stop", f"Failed to clear skill gaps: {e}")

    # Print gap report if there were gaps (this goes to stderr and is shown to user)
    if gap_report:
        print(gap_report, file=sys.stderr)
        log_hook_decision("skill-tracking-reset", "REPORT", "GENERATED", "Stop", "Skill gap report generated")

    # Exit successfully (allow the stop)
    sys.exit(0)


if __name__ == "__main__":
    main()
