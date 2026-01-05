#!/usr/bin/env python3
"""
Intent Parser for Agentic Loop Detection

Parses Claude's responses to detect action intents and predict
which skills will be needed next.
"""

import re
from typing import List, Dict, Tuple


class IntentParser:
    """Parses text for action intents and skill requirements."""

    # Intent patterns mapped to skills
    INTENT_PATTERNS = {
        'docx': [
            r'\b(create|generate|make|write|build)\s+(a\s+)?(word|document|doc|report|docx)\b',
            r'\b(format|style|edit)\s+(word|document)\b',
            r'\btable\s+in\s+(word|document)\b',
            r'\b(professional|business)\s+document\b',
        ],
        'pptx': [
            r'\b(create|make|build|generate)\s+(a\s+)?(presentation|slides?|ppt|pptx|deck)\b',
            r'\b(pitch|powerpoint)\s+(deck|presentation)\b',
            r'\bslides?\s+about\b',
        ],
        'web_scraping': [
            r'\b(scrape|extract|crawl|parse)\s+(data|content|information)?\s*(from)?\s*(website|page|site|web)\b',
            r'\bcollect\s+data\s+from\b',
            r'\b(extract|get|fetch)\s+(prices|product|listings|data)\s+from\b',
            r'\bbeautifulsoup|selenium\b',
        ],
        'data_analysis': [
            r'\b(analyze|analysis|examine|study)\s+(the\s+)?(data|dataset|sales|metrics)\b',
            r'\b(create|generate|make)\s+(chart|graph|visualization|plot)\b',
            r'\bcalculate\s+(statistics|metrics|trends)\b',
            r'\bpandas|numpy|matplotlib\b',
            r'\bdata\s+(trend|pattern|insight)\b',
        ],
        'pdf': [
            r'\b(extract|read|parse)\s+(text|data|content)?\s*(from)?\s*pdf\b',
            r'\b(create|generate|make)\s+pdf\b',
            r'\bpdf\s+(form|invoice|document)\b',
            r'\bmerge|split|combine\s+pdf\b',
        ],
        'email_send': [
            r'\b(send|email|mail)\s+(notification|message|email)\b',
            r'\bsmtp\s+server\b',
            r'\bautomat(e|ed)\s+email\b',
        ],
        'web_search': [
            r'\b(search|find|look\s+up|google)\s+(for|about)?\b',
            r'\blatest\s+(news|information)\b',
            r'\bweb\s+search\b',
        ],
        'slack_post': [
            r'\b(post|send|message)\s+(to|on)?\s*slack\b',
            r'\bslack\s+(channel|message|notification)\b',
        ],
        'database_query': [
            r'\b(query|search)\s+(the\s+)?database\b',
            r'\bsql\s+(query|statement)\b',
            r'\bmysql|postgresql|sqlite\b',
        ],
    }

    # Action verbs that indicate Claude is about to do something
    ACTION_VERBS = [
        r"\bI'?ll\s+(now\s+)?(create|make|build|generate|write|analyze)\b",
        r"\bLet me\s+(now\s+)?(create|make|build|generate|write|analyze)\b",
        r"\bI'm\s+going\s+to\s+(create|make|build|generate|write|analyze)\b",
        r"\bNow\s+I'?ll\s+(create|make|build|generate|write|analyze)\b",
        r"\bNext,?\s+I'?ll\s+(create|make|build|generate|write|analyze)\b",
        r"\bI\s+will\s+(now\s+)?(create|make|build|generate|write|analyze)\b",
    ]

    def __init__(self):
        """Initialize intent parser."""
        # Compile patterns for efficiency
        self.compiled_patterns = {
            skill: [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
            for skill, patterns in self.INTENT_PATTERNS.items()
        }

        self.compiled_actions = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.ACTION_VERBS
        ]

    def detect_action_intent(self, text: str) -> bool:
        """Check if text contains action intent (Claude is about to do something)."""
        for pattern in self.compiled_actions:
            if pattern.search(text):
                return True
        return False

    def extract_skills(self, text: str) -> List[Tuple[str, float]]:
        """
        Extract skills mentioned in text with confidence scores.

        Returns:
            List of (skill_name, confidence) tuples
        """
        skill_matches = {}

        for skill, patterns in self.compiled_patterns.items():
            matches = 0
            for pattern in patterns:
                if pattern.search(text):
                    matches += 1

            if matches > 0:
                # Confidence based on number of pattern matches
                confidence = min(0.5 + (matches * 0.2), 1.0)
                skill_matches[skill] = confidence

        # Sort by confidence descending
        return sorted(skill_matches.items(), key=lambda x: x[1], reverse=True)

    def parse_context(self, text: str) -> Dict:
        """
        Parse text for full context including action intent and skills.

        Returns:
            Dict with 'has_action_intent', 'skills', and 'raw_text'
        """
        has_action = self.detect_action_intent(text)
        skills = self.extract_skills(text)

        return {
            'has_action_intent': has_action,
            'skills': skills,
            'skill_names': [skill for skill, _ in skills],
            'raw_text': text[:200]  # Keep snippet for debugging
        }

    def combine_contexts(self, contexts: List[str]) -> Dict:
        """
        Combine multiple context strings (e.g., recent conversation history).

        Returns aggregate analysis.
        """
        combined_text = ' '.join(contexts)
        return self.parse_context(combined_text)


# Singleton instance
_intent_parser = None


def get_intent_parser() -> IntentParser:
    """Get or create intent parser singleton."""
    global _intent_parser

    if _intent_parser is None:
        _intent_parser = IntentParser()

    return _intent_parser


def parse_text_for_skills(text: str) -> List[str]:
    """Quick function to extract skill names from text."""
    parser = get_intent_parser()
    result = parser.parse_context(text)
    return result['skill_names']


def has_action_intent(text: str) -> bool:
    """Quick function to check if text has action intent."""
    parser = get_intent_parser()
    return parser.detect_action_intent(text)
