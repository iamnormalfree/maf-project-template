#!/usr/bin/env python3
"""
Shared ChromaDB Client Module

Provides a singleton ChromaDB client with CPU-only embedding function.
This avoids the ~1.8s initialization overhead on every hook invocation.

Usage:
    from chromadb_client import get_skills_collection, search_skills

    # Get collection for direct queries
    collection = get_skills_collection()
    results = collection.query(query_texts=["your query"], n_results=3)

    # Or use the convenience function
    skills = search_skills("your query", max_results=3, min_relevance=0.25)
"""

import os
import sys

# Suppress ONNX warnings
os.environ['ORT_DISABLE_ALL_LOGS'] = '1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['CUDA_VISIBLE_DEVICES'] = ''

from pathlib import Path
from typing import Optional, List, Dict, Any

# Set ONNX logger severity before any imports
try:
    import onnxruntime as ort
    ort.set_default_logger_severity(4)  # FATAL only
except ImportError:
    pass

# Lazy-loaded singletons
_client = None
_embedding_function = None
_collection = None

# Configuration
DB_PATH = Path(__file__).parent.parent.parent / "skill-loader-test" / "skill_db"
COLLECTION_NAME = "game_skills"


def _get_embedding_function():
    """Get or create the CPU-only embedding function (singleton)."""
    global _embedding_function
    if _embedding_function is None:
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
        _embedding_function = ONNXMiniLM_L6_V2(preferred_providers=['CPUExecutionProvider'])
    return _embedding_function


def _get_client():
    """Get or create the ChromaDB client (singleton)."""
    global _client
    if _client is None:
        import chromadb
        from chromadb.config import Settings
        _client = chromadb.PersistentClient(
            path=str(DB_PATH),
            settings=Settings(anonymized_telemetry=False)
        )
    return _client


def get_skills_collection():
    """Get the skills collection with cached embedding function.

    Returns:
        ChromaDB collection or None if unavailable
    """
    global _collection
    if _collection is None:
        if not DB_PATH.exists():
            return None
        try:
            client = _get_client()
            ef = _get_embedding_function()
            _collection = client.get_collection(
                name=COLLECTION_NAME,
                embedding_function=ef
            )
        except Exception:
            return None
    return _collection


def search_skills(
    query: str,
    max_results: int = 3,
    min_relevance: float = 0.25,
    include_below_threshold: bool = False
) -> Dict[str, Any]:
    """Search for skills matching a query.

    Args:
        query: Search query text
        max_results: Maximum number of results to return
        min_relevance: Minimum relevance threshold (0-1)
        include_below_threshold: If True, include best match even if below threshold

    Returns:
        Dict with:
            - 'skills': List of matching skills above threshold
            - 'best_match': Best match name (even if below threshold)
            - 'best_relevance': Best match relevance as percentage string
            - 'is_gap': True if no skills meet threshold
    """
    collection = get_skills_collection()
    if collection is None:
        return {
            'skills': [],
            'best_match': None,
            'best_relevance': '0%',
            'is_gap': True
        }

    try:
        results = collection.query(
            query_texts=[query],
            n_results=max_results + 2,  # Get extra to filter
            include=["distances", "metadatas", "documents"]
        )

        if not results['ids'] or not results['ids'][0]:
            return {
                'skills': [],
                'best_match': None,
                'best_relevance': '0%',
                'is_gap': True
            }

        relevant_skills = []
        best_match = None
        best_similarity = 0

        for i, (meta, distance, doc) in enumerate(zip(
            results['metadatas'][0],
            results['distances'][0],
            results['documents'][0]
        )):
            similarity = 1 - distance
            name = meta.get('name', 'Unknown')
            path = meta.get('path', '')

            # Extract description from document
            lines = [l.strip() for l in doc.split('\n') if l.strip() and not l.startswith('#')]
            description = lines[0][:80] if lines else ''

            # Track best match
            if i == 0:
                best_match = name
                best_similarity = similarity

            # Filter by threshold
            if similarity >= min_relevance and len(relevant_skills) < max_results:
                relevant_skills.append({
                    'name': name,
                    'relevance': int(similarity * 100),
                    'relevance_pct': f"{int(similarity * 100)}%",
                    'similarity': similarity,
                    'description': description,
                    'path': path
                })

        return {
            'skills': relevant_skills,
            'best_match': best_match,
            'best_relevance': f"{int(best_similarity * 100)}%",
            'is_gap': len(relevant_skills) == 0
        }

    except Exception as e:
        return {
            'skills': [],
            'best_match': None,
            'best_relevance': '0%',
            'is_gap': True,
            'error': str(e)
        }


def is_available() -> bool:
    """Check if ChromaDB is available and configured."""
    return DB_PATH.exists() and get_skills_collection() is not None
