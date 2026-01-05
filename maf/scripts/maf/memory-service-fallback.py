#!/usr/bin/env python3
"""
Fallback Memory Service for Agent Context Management
Uses simple file-based storage when Memlayer is not available
"""

import os
import sys
import json
import re
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STORAGE_PATH = os.getenv("MEMLAYER_STORAGE_PATH") or str(PROJECT_ROOT / ".maf" / "state" / "memory")
DEFAULT_MAX_MEMORIES = int(os.getenv("MAF_MEMORY_MAX_PER_AGENT", "200"))

class SimpleMemoryService:
    """
    Simple file-based memory service as fallback when Memlayer fails
    Provides similar interface but with basic functionality
    """

    def __init__(self, storage_path=DEFAULT_STORAGE_PATH):
        """Initialize simple memory service"""
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def extract_memories(self, content, agent_name="unknown", bead_id=None):
        """
        Extract salient memories from agent conversation/content
        """
        # Extract code changes
        code_changes = []
        lines = content.split('\n')
        for line in lines:
            if any(keyword in line.lower() for keyword in ['edit:', 'create:', 'modify:', 'file:', 'path:']):
                code_changes.append(line.strip())
            elif any(ext in line for ext in ['.ts', '.js', '.py', '.json', '.yaml', '.md']):
                if len(line.strip()) < 200:  # Avoid full file contents
                    code_changes.append(line.strip())

        # Extract decisions
        decisions = []
        decision_patterns = [
            r'decided to',
            r'will use',
            r'chose to',
            r'going to',
            r'plan to',
            r'architecture',
            r'design'
        ]

        for line in lines:
            for pattern in decision_patterns:
                if re.search(pattern, line, re.IGNORECASE):
                    decisions.append(line.strip())
                    break

        # Extract context
        context = []
        if bead_id:
            context.append(f"Current bead: {bead_id}")

        for line in lines:
            if 'working on' in line.lower() or 'task' in line.lower():
                context.append(line.strip())

        # Extract errors and fixes
        errors = []
        error_patterns = [r'error:', r'fix:', r'bug:', r'issue:', r'problem:', r'solution:']

        for line in lines:
            for pattern in error_patterns:
                if re.search(pattern, line, re.IGNORECASE):
                    errors.append(line.strip())
                    break

        # Package memories
        memories = {
            "agent": agent_name,
            "timestamp": datetime.now().isoformat(),
            "bead_id": bead_id,
            "categories": {
                "code_changes": code_changes[:10],  # Limit to prevent huge files
                "decisions": decisions[:5],
                "context": context[:5],
                "errors": errors[:5],
                "communication": []
            }
        }

        return memories

    def store_memories(self, content, agent_name="unknown", bead_id=None):
        """Store extracted memories"""
        memories = self.extract_memories(content, agent_name, bead_id)

        # Create agent-specific memory file
        agent_file = self.storage_path / f"{agent_name}_memories.jsonl"

        # Append new memories
        with open(agent_file, 'a') as f:
            json.dump(memories, f)
            f.write('\n')

        # Keep only recent memories
        self._cleanup_old_memories(agent_file, keep=DEFAULT_MAX_MEMORIES)

        return memories

    def retrieve_relevant_memories(self, query, agent_name=None, bead_id=None, limit=5):
        """Retrieve relevant memories"""
        if not agent_name:
            return self._empty_categories()

        agent_file = self.storage_path / f"{agent_name}_memories.jsonl"
        if not agent_file.exists():
            return self._empty_categories()

        # Read all memories for agent
        memories = []
        with open(agent_file, 'r') as f:
            for line in f:
                if line.strip():
                    memories.append(json.loads(line))

        # Filter by bead if specified
        if bead_id:
            memories = [m for m in memories if m.get('bead_id') == bead_id]

        # Get most recent memories
        memories = memories[-limit:] if limit else memories

        # Organize by category
        organized = self._empty_categories()

        for memory in memories:
            for category, items in memory.get('categories', {}).items():
                if category in organized and items:
                    for item in items:
                        organized[category].append({
                            "content": item,
                            "timestamp": memory.get('timestamp'),
                            "bead_id": memory.get('bead_id')
                        })

        return organized

    def get_agent_summary(self, agent_name, hours=24):
        """Get summary of agent's recent memories"""
        agent_file = self.storage_path / f"{agent_name}_memories.jsonl"
        if not agent_file.exists():
            return {"agent": agent_name, "total_memories": 0, "categories": {}, "recent_beads": []}

        # Read memories from last 24 hours
        memories = []
        cutoff_time = datetime.now().timestamp() - (hours * 3600)

        with open(agent_file, 'r') as f:
            for line in f:
                if line.strip():
                    memory = json.loads(line)
                    # Simple time check (in real implementation, parse ISO timestamp)
                    memories.append(memory)

        # Get most recent 20 memories
        memories = memories[-20:]

        summary = {
            "agent": agent_name,
            "total_memories": len(memories),
            "categories": {},
            "recent_beads": set()
        }

        for memory in memories:
            for category, items in memory.get('categories', {}).items():
                summary["categories"][category] = summary["categories"].get(category, 0) + len(items)

            bead_id = memory.get('bead_id')
            if bead_id:
                summary["recent_beads"].add(bead_id)

        summary["recent_beads"] = list(summary["recent_beads"])
        return summary

    def _empty_categories(self):
        """Return empty categories structure"""
        return {
            "code_changes": [],
            "decisions": [],
            "context": [],
            "errors": [],
            "communication": []
        }

    def _cleanup_old_memories(self, file_path, keep=50):
        """Keep only the most recent memories"""
        if not file_path.exists():
            return

        memories = []
        with open(file_path, 'r') as f:
            for line in f:
                if line.strip():
                    memories.append(json.loads(line))

        # Keep only the most recent
        memories = memories[-keep:]

        # Write back
        with open(file_path, 'w') as f:
            for memory in memories:
                json.dump(memory, f)
                f.write('\n')

    def clean_memories(self, agent_name=None, days=30, scope="age", dry_run=False, force=False):
        """
        Clean old memories with age-based and scope-based filtering.

        Args:
            agent_name: Filter by agent name (None = all agents)
            days: Delete memories older than this many days
            scope: "age" (by days), "agent" (by agent name), or "all" (all old memories)
            dry_run: Show what would be deleted without deleting
            force: Skip confirmation prompt

        Returns:
            dict: Cleanup results with counts and affected files
        """
        from datetime import timedelta

        results = {
            "scanned_files": 0,
            "memories_before": 0,
            "memories_deleted": 0,
            "memories_kept": 0,
            "affected_agents": [],
            "affected_files": [],
            "dry_run": dry_run
        }

        cutoff_time = datetime.now() - timedelta(days=days)
        cutoff_timestamp = cutoff_time.isoformat()

        # Find all memory files
        memory_files = list(self.storage_path.glob("*_memories.jsonl"))

        if not memory_files:
            return results

        # Filter by agent if specified
        if agent_name:
            target_file = self.storage_path / f"{agent_name}_memories.jsonl"
            if target_file.exists():
                memory_files = [target_file]
            else:
                return results

        for file_path in memory_files:
            try:
                memories = []
                with open(file_path, 'r') as f:
                    for line in f:
                        if line.strip():
                            try:
                                mem = json.loads(line)
                                memories.append(mem)
                            except json.JSONDecodeError:
                                continue

                if not memories:
                    continue

                results["scanned_files"] += 1
                memories_before = len(memories)
                results["memories_before"] += memories_before

                # Filter memories based on scope
                filtered_memories = []
                deleted_count = 0

                for memory in memories:
                    memory_timestamp = memory.get("timestamp", "")
                    should_delete = False

                    if scope == "age" or scope == "all":
                        # Delete memories older than cutoff
                        try:
                            memory_time = datetime.fromisoformat(memory_timestamp.replace("Z", "+00:00"))
                            if memory_time < cutoff_time:
                                should_delete = True
                        except (ValueError, AttributeError):
                            # If we can't parse timestamp, keep it
                            pass

                    if should_delete:
                        deleted_count += 1
                    else:
                        filtered_memories.append(memory)

                results["memories_deleted"] += deleted_count
                results["memories_kept"] += len(filtered_memories)

                # Extract agent name from filename
                file_agent = file_path.stem.replace("_memories", "")
                if deleted_count > 0 and file_agent not in results["affected_agents"]:
                    results["affected_agents"].append(file_agent)
                    results["affected_files"].append(str(file_path))

                # Write back if not dry run
                if not dry_run and deleted_count > 0:
                    with open(file_path, 'w') as f:
                        for memory in filtered_memories:
                            json.dump(memory, f)
                            f.write('\n')

            except Exception as e:
                print(f"Warning: Failed to process {file_path}: {e}")
                continue

        return results


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Simple Agent Memory Service")
    parser.add_argument("action", choices=["store", "retrieve", "summary", "clean"])
    parser.add_argument("--agent", default="unknown", help="Agent name")
    parser.add_argument("--bead", help="Bead ID")
    parser.add_argument("--content", help="Content to store")
    parser.add_argument("--query", default="current work", help="Search query")
    parser.add_argument("--file", help="Read content from file")
    parser.add_argument("--limit", type=int, default=10, help="Result limit")
    parser.add_argument("--days", type=int, default=30, help="Clean memories older than N days")
    parser.add_argument("--scope", default="age", choices=["age", "agent", "all"], help="Cleanup scope")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without deleting")
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")

    args = parser.parse_args()

    # Initialize service
    service = SimpleMemoryService()

    if args.action == "store":
        if args.file and args.file != '-':
            with open(args.file, 'r') as f:
                content = f.read()
        elif args.file == '-':
            # Read from stdin
            content = sys.stdin.read()
        else:
            content = args.content or ""

        if not content.strip():
            print("Error: No content to store")
            return

        memories = service.store_memories(content, args.agent, args.bead)
        print(f"Stored memories for {args.agent}:")
        for category, items in memories["categories"].items():
            if items:
                print(f"  {category}: {len(items)} items")

    elif args.action == "retrieve":
        results = service.retrieve_relevant_memories(
            args.query,
            args.agent,
            args.bead,
            args.limit
        )
        print(f"Retrieved memories for {args.agent}:")
        for category, items in results.items():
            if items:
                print(f"\n{category.upper()}:")
                for item in items:
                    print(f"  - {item['content'][:100]}...")
                    if item.get('bead_id'):
                        print(f"    (Bead: {item['bead_id']})")

    elif args.action == "summary":
        summary = service.get_agent_summary(args.agent)
        print(f"Agent {args.agent} summary:")
        print(f"  Total memories: {summary['total_memories']}")
        print(f"  By category: {json.dumps(summary['categories'], indent=2)}")
        print(f"  Recent beads: {summary['recent_beads']}")

    elif args.action == "clean":
        # Prompt for confirmation unless --force or --dry-run
        if not args.force and not args.dry_run:
            agent_filter = f" for agent '{args.agent}'" if args.agent != "unknown" else " for all agents"
            print(f"Memory cleanup{agent_filter}:")
            print(f"  Scope: {args.scope}")
            print(f"  Age threshold: Older than {args.days} days")
            print()
            response = input("Proceed with cleanup? [y/N]: ")
            if response.lower() != 'y':
                print("Cleanup cancelled.")
                return

        # Perform cleanup
        agent_to_clean = None if args.agent == "unknown" else args.agent
        results = service.clean_memories(
            agent_name=agent_to_clean,
            days=args.days,
            scope=args.scope,
            dry_run=args.dry_run,
            force=args.force
        )

        # Display results
        action = "Would delete" if args.dry_run else "Deleted"
        print(f"\nMemory cleanup {action}:")
        print(f"  Scanned files: {results['scanned_files']}")
        print(f"  Memories before: {results['memories_before']}")
        print(f"  Memories {action.lower()}: {results['memories_deleted']}")
        print(f"  Memories kept: {results['memories_kept']}")

        if results['affected_agents']:
            print(f"\n  Affected agents: {', '.join(results['affected_agents'])}")

        if results['dry_run']:
            print("\n  Dry run completed. Use --force to apply changes.")


if __name__ == "__main__":
    main()
