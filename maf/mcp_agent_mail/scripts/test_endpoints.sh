#!/usr/bin/env bash
set -euo pipefail

# Scripted integration tests for HTTP endpoints using curl.
# Assumes server is running locally with defaults.

BASE_URL=${BASE_URL:-http://127.0.0.1:8765/mcp/}

call_tools() {
  local name=$1; shift
  local args_json=$1; shift || true
  curl -sS -X POST "$BASE_URL" \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args_json}}"
}

read_resource() {
  local uri=$1; shift
  curl -sS -X POST "$BASE_URL" \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"2\",\"method\":\"resources/read\",\"params\":{\"uri\":\"$uri\"}}"
}

echo "[1/5] Health check"
health_result=$(call_tools health_check '{}')
echo "$health_result"
if echo "$health_result" | grep -q "error\|ECONNREFUSED\|connection refused"; then
  echo "ERROR: MCP Agent Mail server is not running on http://127.0.0.1:8765/mcp/"
  echo "Please start the server first with:"
  echo "  cd /root/projects/roundtable/mcp_agent_mail"
  echo "  python -m mcp_agent_mail.cli serve-http"
  exit 1
fi
echo

echo "[2/5] Ensure project"
call_tools ensure_project '{"human_key":"/root/projects/roundtable"}'
echo

echo "[3/5] Register agent"
call_tools register_agent '{"project_key":"/root/projects/roundtable","agent_name":"OrangePond","program":"site-builder","model":"gpt-4"}'
echo

echo "[4/5] File reservation"
call_tools file_reservation_paths '{"project_key":"/root/projects/roundtable","agent_name":"OrangePond","paths":["apps/site/**"],"ttl_seconds":3600,"exclusive":true,"reason":"File reservation for agent OrangePond"}'
echo

echo "[5/5] Environment resource"
read_resource 'resource://config/environment'
echo

