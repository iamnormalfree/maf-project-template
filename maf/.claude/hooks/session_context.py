#!/usr/bin/env python3
"""
Session Context Tracker for Agentic Loop Awareness

Tracks conversation history and Claude's working context to enable
dynamic skill loading based on what Claude is actively working on.
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional


class SessionContext:
    """Manages session context and conversation history."""

    def __init__(self, session_file: Optional[Path] = None):
        """Initialize session context."""
        if session_file is None:
            # Use temp directory for session storage
            session_dir = Path("/tmp/skill_loader_sessions")
            session_dir.mkdir(exist_ok=True)

            # Create unique session file (or reuse if exists)
            session_file = session_dir / "current_session.json"

        self.session_file = session_file
        self.context = self._load_session()

    def _load_session(self) -> Dict:
        """Load existing session or create new one."""
        if self.session_file.exists():
            try:
                with open(self.session_file, 'r') as f:
                    return json.load(f)
            except:
                pass

        # Initialize new session
        return {
            'session_id': datetime.now().isoformat(),
            'loaded_skills': [],
            'working_context': [],
            'intent_history': [],
            'tool_usage': [],
            'last_update': datetime.now().isoformat()
        }

    def _save_session(self):
        """Persist session to disk."""
        self.context['last_update'] = datetime.now().isoformat()

        try:
            with open(self.session_file, 'w') as f:
                json.dump(self.context, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save session: {e}", file=sys.stderr)

    def add_intent(self, intent: str, detected_skills: List[str]):
        """Record detected intent and associated skills."""
        self.context['intent_history'].append({
            'timestamp': datetime.now().isoformat(),
            'intent': intent,
            'skills': detected_skills
        })

        # Keep only last 20 intents
        if len(self.context['intent_history']) > 20:
            self.context['intent_history'] = self.context['intent_history'][-20:]

        self._save_session()

    def add_tool_usage(self, tool_name: str):
        """Record tool usage."""
        self.context['tool_usage'].append({
            'timestamp': datetime.now().isoformat(),
            'tool': tool_name
        })

        # Keep only last 50 tool uses
        if len(self.context['tool_usage']) > 50:
            self.context['tool_usage'] = self.context['tool_usage'][-50:]

        self._save_session()

    def update_loaded_skills(self, skills: List[str]):
        """Update currently loaded skills."""
        self.context['loaded_skills'] = skills
        self._save_session()

    def get_loaded_skills(self) -> List[str]:
        """Get currently loaded skills."""
        return self.context.get('loaded_skills', [])

    def add_working_context(self, context: str):
        """Add to working context (Claude's current task)."""
        self.context['working_context'].append({
            'timestamp': datetime.now().isoformat(),
            'context': context
        })

        # Keep only last 10 context items
        if len(self.context['working_context']) > 10:
            self.context['working_context'] = self.context['working_context'][-10:]

        self._save_session()

    def get_working_context(self) -> List[str]:
        """Get recent working context."""
        return [item['context'] for item in self.context.get('working_context', [])]

    def get_recent_intents(self, n: int = 5) -> List[Dict]:
        """Get N most recent intents."""
        intents = self.context.get('intent_history', [])
        return intents[-n:] if intents else []

    def should_refresh_skills(self, new_skills: List[str]) -> bool:
        """Determine if skills should be refreshed based on working context."""
        current_skills = set(self.get_loaded_skills())
        proposed_skills = set(new_skills)

        # Refresh if there's a significant change (>50% different)
        if not current_skills:
            return True

        overlap = len(current_skills.intersection(proposed_skills))
        total = len(current_skills.union(proposed_skills))

        similarity = overlap / total if total > 0 else 0

        # Refresh if less than 50% similarity
        return similarity < 0.5

    def clear_session(self):
        """Clear session data."""
        self.context = {
            'session_id': datetime.now().isoformat(),
            'loaded_skills': [],
            'working_context': [],
            'intent_history': [],
            'tool_usage': [],
            'last_update': datetime.now().isoformat()
        }
        self._save_session()


# Singleton instance for session management
_session_context = None


def get_session_context() -> SessionContext:
    """Get or create session context singleton."""
    global _session_context

    if _session_context is None:
        _session_context = SessionContext()

    return _session_context
