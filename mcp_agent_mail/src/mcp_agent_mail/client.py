"""Lightweight HTTP client for local scripts.

This module intentionally avoids importing the server/CLI stack (FastMCP, SQLAlchemy,
Typer, Rich, etc.) so that shell scripts can talk to a running Agent Mail server from
minimal Python environments (e.g. a Memlayer venv).
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any, Optional

DEFAULT_MCP_URL = "http://127.0.0.1:8765/mcp/"


class AgentMailClient:
    def __init__(
        self,
        *,
        server_url: str = DEFAULT_MCP_URL,
        bearer_token: str = "",
        timeout_seconds: float = 5.0,
    ) -> None:
        self._server_url = server_url
        self._bearer_token = bearer_token
        self._timeout_seconds = float(timeout_seconds)

    def _is_valid_agent_name(self, name: str) -> bool:
        return bool(re.match(r"^[A-Z][a-z]+[A-Z][a-z]+$", name))

    def _infer_to_agents(self, thread_id: Optional[str]) -> list[str]:
        if not thread_id:
            return []
        if thread_id.startswith("CONTEXT-"):
            parts = thread_id.split("-")
            if len(parts) >= 3 and parts[1]:
                return [parts[1]]
        return []

    def _request(self, payload: dict[str, Any]) -> Any:
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self._bearer_token:
            headers["Authorization"] = f"Bearer {self._bearer_token}"
        req = urllib.request.Request(self._server_url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}") from e
        except Exception as e:
            raise RuntimeError(f"HTTP request failed: {e}") from e

        try:
            return json.loads(raw)
        except Exception as e:
            raise RuntimeError(f"Invalid JSON response: {raw[:2000]}") from e

    def _extract_tool_result(self, response: Any) -> Any:
        if not isinstance(response, dict):
            raise RuntimeError("Invalid JSON-RPC response")
        if response.get("error"):
            raise RuntimeError(str(response["error"]))
        if "result" not in response:
            raise RuntimeError("Missing JSON-RPC result")
        result = response["result"]
        if isinstance(result, dict) and result.get("isError") is True:
            content = result.get("content")
            if isinstance(content, list) and content:
                first = content[0]
                if isinstance(first, dict) and isinstance(first.get("text"), str):
                    raise RuntimeError(first["text"])
            raise RuntimeError("Tool call failed")
        if isinstance(result, dict):
            structured = result.get("structuredContent")
            if structured is not None:
                if isinstance(structured, dict) and "result" in structured:
                    return structured["result"]
                return structured
            if "messages" in result:
                return result["messages"]
            if "result" in result:
                return result["result"]
            content = result.get("content")
            if isinstance(content, list) and content:
                first = content[0]
                if isinstance(first, dict) and isinstance(first.get("text"), str):
                    text = first["text"]
                    try:
                        return json.loads(text)
                    except Exception:
                        return text
        return result

    def _call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        resp = self._request(
            {
                "jsonrpc": "2.0",
                "id": f"client-{name}",
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        )
        return self._extract_tool_result(resp)

    def fetch_inbox(
        self,
        *,
        agent_name: str,
        project_key: str,
        limit: int = 20,
        include_bodies: bool = False,
        urgent_only: bool = False,
        since_ts: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = self._call_tool(
            "fetch_inbox",
            {
                "project_key": project_key,
                "agent_name": agent_name,
                "limit": int(limit),
                "include_bodies": bool(include_bodies),
                "urgent_only": bool(urgent_only),
                "since_ts": since_ts or "",
            },
        )
        msgs = rows if isinstance(rows, list) else []
        normalized: list[dict[str, Any]] = []
        for msg in msgs:
            if not isinstance(msg, dict):
                continue
            normalized.append({**msg, "from_agent": msg.get("from", msg.get("from_agent", "unknown"))})
        return normalized

    def send_message(
        self,
        *,
        thread_id: Optional[str] = None,
        subject: str,
        body: str,
        from_agent: str,
        project_key: str,
        to: Optional[list[str]] = None,
        cc: Optional[list[str]] = None,
        bcc: Optional[list[str]] = None,
        importance: str = "normal",
        ack_required: bool = False,
    ) -> Any:
        to_agents = list(to or [])
        if not to_agents:
            to_agents = self._infer_to_agents(thread_id)
        if not to_agents and not (cc or bcc):
            raise ValueError("send_message requires at least one recipient (to/cc/bcc)")

        sender_name = from_agent
        if not self._is_valid_agent_name(sender_name):
            sender_name = to_agents[0] if to_agents else sender_name

        return self._call_tool(
            "send_message",
            {
                "project_key": project_key,
                "sender_name": sender_name,
                "to": to_agents,
                "cc": cc or [],
                "bcc": bcc or [],
                "subject": subject,
                "body_md": body,
                "importance": importance,
                "ack_required": bool(ack_required),
                "thread_id": thread_id or "",
            },
        )

