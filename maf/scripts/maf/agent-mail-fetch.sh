#!/usr/bin/env bash
set -euo pipefail

AGENT_NAME="${1:-}"
LIMIT="${2:-10}"
PROJECT_KEY="${AGENT_MAIL_PROJECT:-/root/projects/roundtable}"
MCP_URL="${AGENT_MAIL_MCP_URL:-http://127.0.0.1:8765/mcp/}"

if [[ -z "$AGENT_NAME" ]]; then
  echo "Agent Mail: missing agent name"
  exit 0
fi

payload=$(cat <<EOF
{"jsonrpc":"2.0","id":"fetch_inbox","method":"tools/call","params":{"name":"fetch_inbox","arguments":{"project_key":"$PROJECT_KEY","agent_name":"$AGENT_NAME","limit":$LIMIT,"include_bodies":false}}}
EOF
)

response=$(curl -s -H "Content-Type: application/json" -d "$payload" "$MCP_URL" || true)

if [[ -z "$response" ]]; then
  echo "Agent Mail: fetch failed"
  exit 0
fi

if ! echo "$response" | jq -e . >/dev/null 2>&1; then
  echo "Agent Mail: response parse error"
  exit 0
fi

messages=$(echo "$response" | jq -c '.result.structuredContent.result // .result.messages // .result // empty' 2>/dev/null || echo "")
if [[ -z "$messages" || "$messages" == "null" ]]; then
  echo "Agent Mail: no messages payload"
  exit 0
fi

count=$(echo "$messages" | jq -r 'length' 2>/dev/null || echo "0")
if [[ "$count" == "0" ]]; then
  echo "Agent Mail: inbox empty for $AGENT_NAME"
  exit 0
fi

echo "Agent Mail: $count message(s) for $AGENT_NAME"
echo "$messages" | jq -r '.[] | "- [" + (.subject // "no subject") + "] from " + (.from // "unknown") + " (id " + (.id|tostring) + ")"' | head -n 5
