#!/usr/bin/env python3
"""
Unified Memory Service for Agent Context Management
Automatically handles Memlayer vs fallback service selection
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path

# Add paths for imports
sys.path.insert(0, "/root/projects/roundtable/venv_memlayer/lib/python3.12/site-packages")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
ENV_FILE = os.path.join(SCRIPT_DIR, "..", "..", "apps", "backend", ".env")


def load_env_file(env_path):
    """Load simple KEY=VALUE pairs from a .env file into os.environ."""
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, "r") as handle:
            for line in handle:
                raw = line.strip()
                if not raw or raw.startswith("#") or "=" not in raw:
                    continue
                key, value = raw.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as exc:
        print(f"Warning: Failed to load env file {env_path}: {exc}")


load_env_file(os.path.abspath(ENV_FILE))

PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_STORAGE_PATH = os.getenv("MEMLAYER_STORAGE_PATH") or os.path.join(
    PROJECT_ROOT, ".maf", "state", "memory"
)

# Try to import Memlayer
try:
    from memlayer import Memory
    MEMLAYER_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Memlayer not available: {e}")
    MEMLAYER_AVAILABLE = False

# Import fallback service
import importlib.util
spec = importlib.util.spec_from_file_location("memory_service_fallback", os.path.join(SCRIPT_DIR, "memory-service-fallback.py"))
memory_service_fallback = importlib.util.module_from_spec(spec)
spec.loader.exec_module(memory_service_fallback)
SimpleMemoryService = memory_service_fallback.SimpleMemoryService


class UnifiedMemoryService:
    """
    Unified memory service that tries Memlayer first, falls back to simple service
    Provides same interface regardless of backend used
    """

    def __init__(self, storage_path=DEFAULT_STORAGE_PATH):
        """Initialize unified memory service"""
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

        # Try to initialize Memlayer service
        self.memlayer_service = None
        self.fallback_service = SimpleMemoryService(storage_path)
        self.using_memlayer = False

        if MEMLAYER_AVAILABLE:
            try:
                # Check if OpenAI API key is available
                if not os.getenv("OPENAI_API_KEY"):
                    print("Warning: OPENAI_API_KEY not set, using fallback memory service")
                    self.fallback_service = SimpleMemoryService(storage_path)
                else:
                    # Import memlayer service after checking dependencies
                    memlayer_spec = importlib.util.spec_from_file_location(
                        "memory_service",
                        os.path.join(SCRIPT_DIR, "memory-service.py")
                    )
                    memlayer_module = importlib.util.module_from_spec(memlayer_spec)
                    memlayer_spec.loader.exec_module(memlayer_module)
                    self.memlayer_service = memlayer_module.AgentMemoryService(storage_path)
                    self.using_memlayer = True
                    print("Using Memlayer for enhanced memory management")
            except Exception as e:
                print(f"Warning: Failed to initialize Memlayer service: {e}")
                print("Using fallback memory service")
                self.fallback_service = SimpleMemoryService(storage_path)
        else:
            print("Memlayer not available, using fallback memory service")

    def store_memories(self, content, agent_name="unknown", bead_id=None):
        """Store memories using available backend"""
        try:
            if self.using_memlayer and self.memlayer_service:
                # Try Memlayer first
                return self.memlayer_service.store_memories(content, agent_name, bead_id)
        except Exception as e:
            print(f"Memlayer store failed, falling back: {e}")
            self.using_memlayer = False

        # Use fallback
        return self.fallback_service.store_memories(content, agent_name, bead_id)

    def retrieve_relevant_memories(self, query, agent_name=None, bead_id=None, limit=5):
        """Retrieve memories using available backend"""
        if self.using_memlayer and self.memlayer_service:
            try:
                return self.memlayer_service.retrieve_relevant_memories(query, agent_name, bead_id, limit)
            except Exception as e:
                print(f"Memlayer retrieve failed, falling back: {e}")
                self.using_memlayer = False

        # Use fallback
        return self.fallback_service.retrieve_relevant_memories(query, agent_name, bead_id, limit)

    def get_agent_summary(self, agent_name, hours=24):
        """Get agent summary using available backend"""
        if self.using_memlayer and self.memlayer_service:
            try:
                return self.memlayer_service.get_agent_summary(agent_name, hours)
            except Exception as e:
                print(f"Memlayer summary failed, falling back: {e}")
                self.using_memlayer = False

        # Use fallback
        return self.fallback_service.get_agent_summary(agent_name, hours)

    def get_status(self):
        """Get current status of memory service"""
        return {
            "using_memlayer": self.using_memlayer,
            "memlayer_available": MEMLAYER_AVAILABLE,
            "openai_key_set": bool(os.getenv("OPENAI_API_KEY")),
            "storage_path": str(self.storage_path)
        }

    def clean_memories(self, agent_name=None, days=30, scope="age", dry_run=False, force=False):
        """Clean memories using available backend"""
        if self.using_memlayer and self.memlayer_service:
            try:
                # Try Memlayer service first if it has clean method
                if hasattr(self.memlayer_service, 'clean_memories'):
                    return self.memlayer_service.clean_memories(agent_name, days, scope, dry_run, force)
                else:
                    print("Memlayer service does not support cleanup, using fallback")
                    self.using_memlayer = False
            except Exception as e:
                print(f"Memlayer cleanup failed, falling back: {e}")
                self.using_memlayer = False

        # Use fallback service
        return self.fallback_service.clean_memories(agent_name, days, scope, dry_run, force)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Unified Agent Memory Service")
    parser.add_argument("action", choices=["store", "retrieve", "summary", "status", "clean"])
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
    service = UnifiedMemoryService()

    if args.action == "status":
        status = service.get_status()
        print("Memory Service Status:")
        for key, value in status.items():
            print(f"  {key}: {value}")
        return

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
