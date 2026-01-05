"""Top-level package for the MCP Agent Mail server."""

from __future__ import annotations

import asyncio
import inspect
from typing import Any

# Python 3.14 warns when third-party code calls asyncio.iscoroutinefunction.
# Patch it globally to the inspect implementation before importing submodules.
asyncio.iscoroutinefunction = inspect.iscoroutinefunction  # type: ignore[attr-defined,assignment]

def build_mcp_server(*args: Any, **kwargs: Any) -> Any:
    """
    Lazily import and build the FastMCP server.

    This module is imported by lightweight local scripts that may not have the full
    server dependency stack installed (e.g. fastmcp). Keeping this import lazy
    allows those scripts to use HTTP-only helpers (like AgentMailClient) without
    requiring server-only dependencies.
    """

    try:
        from .app import build_mcp_server as _build_mcp_server
    except Exception as e:
        raise ModuleNotFoundError(f"Cannot import server dependencies (fastmcp): {e}") from e
    return _build_mcp_server(*args, **kwargs)

__all__ = ["build_mcp_server"]
