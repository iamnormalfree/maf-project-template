#!/usr/bin/env python3
"""
Hook Log Viewer - Simple utility to view and analyze hook execution logs

Usage:
    python view_hook_logs.py              # Show last 50 entries
    python view_hook_logs.py 100          # Show last 100 entries
    python view_hook_logs.py --filter BLOCK  # Show only BLOCK decisions
    python view_hook_logs.py --clear      # Clear all logs
"""

import sys
from pathlib import Path

# Add hooks directory to path to import hook_logger
HOOKS_DIR = Path(__file__).parent
sys.path.insert(0, str(HOOKS_DIR))

from hook_logger import get_recent_logs, clear_logs, LOG_FILE

def main():
    args = sys.argv[1:]

    # Handle --clear flag
    if '--clear' in args:
        confirm = input("Clear all hook logs? (y/n): ")
        if confirm.lower() == 'y':
            clear_logs()
            print("✓ Logs cleared")
        return

    # Handle --filter flag
    filter_term = None
    if '--filter' in args:
        idx = args.index('--filter')
        if idx + 1 < len(args):
            filter_term = args[idx + 1]
            args = [a for a in args if a not in ['--filter', filter_term]]

    # Get limit (default 50)
    limit = 50
    if args and args[0].isdigit():
        limit = int(args[0])

    # Get logs
    logs = get_recent_logs(limit=limit)

    # Apply filter if specified
    if filter_term:
        lines = logs.split('\n')
        filtered = [line for line in lines if filter_term in line]
        logs = '\n'.join(filtered)

    # Display
    print("=" * 80)
    print(f"HOOK EXECUTION LOGS (last {limit} entries)")
    if filter_term:
        print(f"Filtered by: {filter_term}")
    print("=" * 80)
    print(logs)
    print("=" * 80)
    print(f"\nLog file: {LOG_FILE}")
    print(f"Total lines shown: {len(logs.split(chr(10)))}")

    # Show statistics
    if logs and logs.strip():
        lines = [l for l in logs.split('\n') if l.strip()]
        blocks = len([l for l in lines if '[BLOCK  ]' in l])
        warns = len([l for l in lines if '[WARN   ]' in l])
        allows = len([l for l in lines if '[ALLOW  ]' in l])
        skipped = len([l for l in lines if '[SKIPPED]' in l])

        print(f"\nStatistics:")
        print(f"  ALLOW:   {allows}")
        print(f"  WARN:    {warns}")
        print(f"  BLOCK:   {blocks}")
        print(f"  SKIPPED: {skipped}")

if __name__ == '__main__':
    main()
