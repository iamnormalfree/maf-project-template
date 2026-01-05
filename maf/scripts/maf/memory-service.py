#!/usr/bin/env python3
"""
Memory Service for Agent Context Management
Uses Memlayer for intelligent memory extraction and retrieval
"""

import os
import sys
import json
import argparse
import time
from datetime import datetime
from pathlib import Path

# Add memlayer venv to path
sys.path.insert(0, "/root/projects/roundtable/venv_memlayer/lib/python3.12/site-packages")

from memlayer import Memory

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STORAGE_PATH = os.getenv("MEMLAYER_STORAGE_PATH") or str(PROJECT_ROOT / ".maf" / "state" / "memory")
DEFAULT_MAX_MEMORIES = int(os.getenv("MAF_MEMORY_MAX_PER_AGENT", "500"))
DEFAULT_TTL_DAYS = int(os.getenv("MAF_MEMORY_TTL_DAYS", "45"))

class AgentMemoryService:
    def __init__(self, storage_path=DEFAULT_STORAGE_PATH):
        """Initialize memory service in LOCAL mode for privacy"""
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.max_memories_per_agent = DEFAULT_MAX_MEMORIES
        self.memory_ttl_seconds = DEFAULT_TTL_DAYS * 24 * 60 * 60

        # Initialize Memlayer in embedded mode with local storage for privacy
        # User ID will be set per operation to allow multi-agent use
        self.memory = None  # Will be initialized per agent

        # Cache for agent-specific memory instances
        self.agent_memories = {}

        # Define memory categories for agents
        self.categories = {
            "code_changes": "Code modifications, files edited, implementations",
            "decisions": "Architectural decisions, design choices, problem solutions",
            "context": "Current task context, bead IDs, agent state",
            "errors": "Bugs found, errors fixed, issues resolved",
            "communication": "Important agent communications, decisions made"
        }

    def _get_agent_memory(self, agent_name):
        """Get or create agent-specific memory instance"""
        if agent_name not in self.agent_memories:
            try:
                # Initialize Memlayer for this specific agent
                self.agent_memories[agent_name] = Memory(
                    mode="embedded",
                    storage_path=str(self.storage_path),
                    user_id=f"agent_{agent_name}"
                )
            except Exception as e:
                print(f"Warning: Failed to initialize Memlayer for agent {agent_name}: {e}")
                # Return None to trigger fallback
                return None

        return self.agent_memories[agent_name]

    def _store_memory_item(self, agent_memory, content, metadata):
        """Store a single memory item in vector storage with metadata."""
        embedding = agent_memory.embedding_model.get_embeddings([content])[0]
        agent_memory.vector_storage.add_memory(
            content=content,
            embedding=embedding,
            user_id=agent_memory.user_id,
            metadata=metadata
        )

    def _list_agent_memories(self, agent_memory):
        """Return all memories for the agent user_id from vector storage."""
        if not agent_memory.vector_storage:
            return []
        memories = agent_memory.vector_storage.get_all_memories_for_curation()
        return [mem for mem in memories if mem.get("user_id") == agent_memory.user_id]

    def _delete_memory(self, agent_memory, memory_id):
        if agent_memory.vector_storage:
            agent_memory.vector_storage.delete_memory(memory_id)
        if agent_memory.graph_storage:
            agent_memory.graph_storage.delete_memory(memory_id)

    def _prune_agent_memories(self, agent_memory):
        """Remove expired memories and enforce max-per-agent retention."""
        now = time.time()
        memories = self._list_agent_memories(agent_memory)
        if not memories:
            return

        expired = [
            mem for mem in memories
            if mem.get("expiration_timestamp") and mem["expiration_timestamp"] < now
        ]
        for mem in expired:
            self._delete_memory(agent_memory, mem.get("id"))

        remaining = [
            mem for mem in memories
            if mem not in expired
        ]
        if len(remaining) <= self.max_memories_per_agent:
            return

        remaining.sort(key=lambda mem: mem.get("created_timestamp", mem.get("timestamp", 0)))
        to_delete = remaining[:-self.max_memories_per_agent]
        for mem in to_delete:
            self._delete_memory(agent_memory, mem.get("id"))

    def extract_memories(self, content, agent_name="unknown", bead_id=None):
        """
        Extract salient memories from agent conversation/content
        Returns structured memories with categories
        """
        # Extract code changes (look for file modifications, git patterns)
        code_changes = []
        if "edit" in content.lower() or "modify" in content.lower() or "create" in content.lower():
            # Simple pattern matching for code changes
            lines = content.split('\n')
            for line in lines:
                if any(keyword in line.lower() for keyword in ['file:', 'path:', '.js', '.ts', '.py', '.json']):
                    code_changes.append(line.strip())

        # Extract decisions (look for decision keywords)
        decisions = []
        decision_keywords = ['decided to', 'will use', 'chose to', 'going to', 'plan to']
        lines = content.split('\n')
        for i, line in enumerate(lines):
            for keyword in decision_keywords:
                if keyword in line.lower():
                    decisions.append(line.strip())
                    break

        # Extract context (current task, bead ID, etc.)
        context = []
        if bead_id:
            context.append(f"Current bead: {bead_id}")

        # Look for "working on" patterns
        for line in lines:
            if "working on" in line.lower() or "task" in line.lower():
                context.append(line.strip())

        # Extract errors and fixes
        errors = []
        error_patterns = ['error:', 'fix:', 'bug:', 'issue:', 'problem:']
        for line in lines:
            for pattern in error_patterns:
                if pattern in line.lower():
                    errors.append(line.strip())

        # Package memories
        memories = {
            "agent": agent_name,
            "timestamp": datetime.now().isoformat(),
            "bead_id": bead_id,
            "categories": {
                "code_changes": code_changes,
                "decisions": decisions,
                "context": context,
                "errors": errors,
                "communication": []  # To be filled with important messages
            }
        }

        return memories

    def store_memories(self, content, agent_name="unknown", bead_id=None):
        """Store extracted memories in Memlayer"""
        memories = self.extract_memories(content, agent_name, bead_id)

        # Get agent-specific memory instance
        agent_memory = self._get_agent_memory(agent_name)
        if not agent_memory:
            # Memlayer initialization failed, signal fallback needed
            raise Exception(f"Could not initialize memory service for agent {agent_name}")

        now = time.time()
        expiration_timestamp = now + self.memory_ttl_seconds

        # Store each category with appropriate metadata
        for category, items in memories["categories"].items():
            if items:  # Only store if there are items
                for item in items:
                    self._store_memory_item(
                        agent_memory,
                        item,
                        {
                            "agent": agent_name,
                            "category": category,
                            "bead_id": bead_id,
                            "timestamp": memories["timestamp"],
                            "created_timestamp": now,
                            "expiration_timestamp": expiration_timestamp,
                            "source": "agent_context"
                        }
                    )

        self._prune_agent_memories(agent_memory)

        return memories

    def retrieve_relevant_memories(self, query, agent_name=None, bead_id=None, limit=5):
        """
        Retrieve memories relevant to current context
        Used when restoring agent after restart
        """
        if not agent_name:
            return {
                "code_changes": [],
                "decisions": [],
                "context": [],
                "errors": [],
                "communication": []
            }

        # Get agent-specific memory instance
        agent_memory = self._get_agent_memory(agent_name)
        if not agent_memory:
            # Memlayer initialization failed, signal fallback needed
            raise Exception(f"Could not initialize memory service for agent {agent_name}")

        filters = {"agent": agent_name}
        if bead_id:
            filters["bead_id"] = bead_id

        query_embedding = agent_memory.embedding_model.get_embeddings([query])[0]
        results = agent_memory.vector_storage.search_memories(
            query_embedding=query_embedding,
            user_id=agent_memory.user_id,
            top_k=limit
        )

        # Organize by category
        organized = {
            "code_changes": [],
            "decisions": [],
            "context": [],
            "errors": [],
            "communication": []
        }

        for result in results:
            meta = result.get("metadata", {})
            if any(meta.get(key) != value for key, value in filters.items()):
                continue

            category = meta.get("category", "context")
            if category in organized:
                organized[category].append({
                    "content": result.get("content", ""),
                    "timestamp": meta.get("timestamp"),
                    "bead_id": meta.get("bead_id")
                })

        return organized

    def get_agent_summary(self, agent_name, hours=24):
        """Get summary of agent's recent memories"""
        # Get agent-specific memory instance
        agent_memory = self._get_agent_memory(agent_name)
        if not agent_memory:
            # Memlayer initialization failed, signal fallback needed
            raise Exception(f"Could not initialize memory service for agent {agent_name}")

        all_memories = self._list_agent_memories(agent_memory)
        all_memories.sort(key=lambda mem: mem.get("created_timestamp", mem.get("timestamp", 0)))
        recent_memories = all_memories[-20:]

        summary = {
            "agent": agent_name,
            "total_memories": len(recent_memories),
            "categories": {},
            "recent_beads": set()
        }

        for memory in recent_memories:
            category = memory.get("category", "context")
            summary["categories"][category] = summary["categories"].get(category, 0) + 1

            bead_id = memory.get("bead_id")
            if bead_id:
                summary["recent_beads"].add(bead_id)

        summary["recent_beads"] = list(summary["recent_beads"])
        return summary

    def cleanup_old_memories(self, days=7):
        """Remove memories older than specified days (for storage management)"""
        # This would need implementation in Memlayer or manual filtering
        pass

def main():
    parser = argparse.ArgumentParser(description="Agent Memory Service")
    parser.add_argument("action", choices=["store", "retrieve", "summary"])
    parser.add_argument("--agent", default="unknown", help="Agent name")
    parser.add_argument("--bead", help="Bead ID")
    parser.add_argument("--content", help="Content to store (for store action)")
    parser.add_argument("--query", default="current work", help="Search query (for retrieve action)")
    parser.add_argument("--file", help="Read content from file")
    parser.add_argument("--limit", type=int, default=10, help="Result limit")

    args = parser.parse_args()

    # Initialize service
    service = AgentMemoryService()

    if args.action == "store":
        if args.file:
            with open(args.file, 'r') as f:
                content = f.read()
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

if __name__ == "__main__":
    main()
