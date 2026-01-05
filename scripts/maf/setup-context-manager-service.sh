#!/usr/bin/env bash
# Setup script for the MAF context manager as a systemd service
set -euo pipefail

SERVICE_NAME="roundtable-maf-context-manager"
ROUNDTABLE_DIR="${ROUNDTABLE_DIR:-/root/projects/roundtable}"
SCRIPT_PATH="${ROUNDTABLE_DIR}/scripts/maf/context-manager-v2.sh"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="${ROUNDTABLE_DIR}/.maf/config/context-manager.env"
RUN_USER="${SUDO_USER:-$(whoami)}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "❌ This command requires sudo privileges."
  exit 1
fi

if [[ ! -x "$SCRIPT_PATH" ]]; then
  echo "❌ Context manager script not found or not executable: $SCRIPT_PATH"
  exit 1
fi

mkdir -p "$(dirname "$ENV_FILE")"

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
# Context manager service configuration
MAF_TMUX_SESSION=maf-cli
EOF
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Roundtable MAF Context Manager
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${ROUNDTABLE_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/bin/bash ${SCRIPT_PATH} monitor
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "✅ Installed and started ${SERVICE_NAME}"
systemctl status "$SERVICE_NAME" --no-pager
