#!/usr/bin/env python3
"""
ChromaDB Skill Database Setup

Add your own skills to the semantic skill catalog.

Usage:
    # Add a single skill
    python setup_chromadb_example.py add "Skill Name" "path/to/SKILL.md"

    # Add skills from a directory (looks for */SKILL.md)
    python setup_chromadb_example.py load "path/to/skills-dir"

    # List all skills
    python setup_chromadb_example.py list

    # Remove a skill
    python setup_chromadb_example.py remove "Skill Name"

    # Clear all skills
    python setup_chromadb_example.py clear

Skill File Format (SKILL.md):
    Your skill content goes here. The first paragraph is used as
    the description shown in skill suggestions.

    Include relevant keywords that help semantic matching.
    Structure doesn't matter - the embedding model understands context.

Examples:
    python setup_chromadb_example.py add "React Patterns" "./docs/react-patterns.md"
    python setup_chromadb_example.py load "./domain-skills"
"""

import sys
import os

# Suppress ONNX warnings
os.environ['ORT_DISABLE_ALL_LOGS'] = '1'
os.environ['CUDA_VISIBLE_DEVICES'] = ''

from pathlib import Path

try:
    import onnxruntime as ort
    ort.set_default_logger_severity(4)
except ImportError:
    pass

try:
    import chromadb
    from chromadb.config import Settings
    from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
except ImportError:
    print("ERROR: ChromaDB not installed. Run: pip install chromadb")
    sys.exit(1)

# Configuration
DB_PATH = Path(__file__).parent.parent.parent / "skill-loader-test" / "skill_db"
COLLECTION_NAME = "game_skills"


def get_collection():
    """Get or create the skills collection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    ef = ONNXMiniLM_L6_V2(preferred_providers=['CPUExecutionProvider'])
    client = chromadb.PersistentClient(
        path=str(DB_PATH),
        settings=Settings(anonymized_telemetry=False)
    )

    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=ef,
        metadata={'hnsw:space': 'cosine'}
    )


def add_skill(name: str, file_path: str):
    """Add a skill from a file."""
    path = Path(file_path)
    if not path.exists():
        print(f"ERROR: File not found: {file_path}")
        return False

    content = path.read_text(encoding='utf-8')
    collection = get_collection()

    # Check if skill already exists
    existing = collection.get(where={"name": name})
    if existing['ids']:
        print(f"Updating existing skill: {name}")
        collection.delete(ids=existing['ids'])

    # Generate ID from name
    skill_id = name.lower().replace(' ', '-')

    collection.add(
        ids=[skill_id],
        documents=[content],
        metadatas=[{
            "name": name,
            "type": "skill",
            "path": str(path.absolute()),
            "content": content  # Store full content for retrieval
        }]
    )

    print(f"Added: {name}")
    return True


def load_directory(dir_path: str):
    """Load all skills from a directory (looks for */SKILL.md)."""
    path = Path(dir_path)
    if not path.exists():
        print(f"ERROR: Directory not found: {dir_path}")
        return 0

    loaded = 0
    for skill_dir in path.iterdir():
        if not skill_dir.is_dir():
            continue

        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        # Generate name from directory
        name = skill_dir.name.replace('-', ' ').replace('_', ' ').title()

        if add_skill(name, str(skill_file)):
            loaded += 1

    print(f"\nLoaded {loaded} skills from {dir_path}")
    return loaded


def list_skills():
    """List all skills in the database."""
    collection = get_collection()
    results = collection.get(include=["metadatas", "documents"])

    if not results['ids']:
        print("No skills in database.")
        print("\nAdd skills with:")
        print('  python setup_chromadb_example.py add "Name" "path/to/file.md"')
        return

    print(f"Skills in database ({len(results['ids'])}):\n")

    for meta, doc in sorted(zip(results['metadatas'], results['documents']),
                            key=lambda x: x[0].get('name', '')):
        name = meta.get('name', 'Unknown')
        path = meta.get('path', '')
        # First non-empty line as preview
        preview = next((l.strip()[:60] for l in doc.split('\n') if l.strip()), '')

        print(f"  {name}")
        if path:
            print(f"    Path: {path}")
        if preview:
            print(f"    Preview: {preview}...")
        print()


def remove_skill(name: str):
    """Remove a skill by name."""
    collection = get_collection()
    existing = collection.get(where={"name": name})

    if not existing['ids']:
        print(f"Skill not found: {name}")
        return False

    collection.delete(ids=existing['ids'])
    print(f"Removed: {name}")
    return True


def clear_all():
    """Clear all skills from the database."""
    collection = get_collection()
    count = collection.count()

    if count == 0:
        print("Database is already empty.")
        return

    # Get all IDs and delete
    results = collection.get()
    if results['ids']:
        collection.delete(ids=results['ids'])

    print(f"Cleared {count} skills from database.")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == 'add':
        if len(sys.argv) < 4:
            print("Usage: python setup_chromadb_example.py add \"Skill Name\" \"path/to/file.md\"")
            sys.exit(1)
        add_skill(sys.argv[2], sys.argv[3])

    elif command == 'load':
        if len(sys.argv) < 3:
            print("Usage: python setup_chromadb_example.py load \"path/to/skills-dir\"")
            sys.exit(1)
        load_directory(sys.argv[2])

    elif command == 'list':
        list_skills()

    elif command == 'remove':
        if len(sys.argv) < 3:
            print("Usage: python setup_chromadb_example.py remove \"Skill Name\"")
            sys.exit(1)
        remove_skill(sys.argv[2])

    elif command == 'clear':
        response = input("Are you sure you want to clear all skills? (y/N): ")
        if response.lower() == 'y':
            clear_all()
        else:
            print("Cancelled.")

    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
