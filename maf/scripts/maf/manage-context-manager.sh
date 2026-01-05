#!/usr/bin/env bash
# Management script for the Roundtable MAF context manager service
set -euo pipefail

SERVICE_NAME="roundtable-maf-context-manager"
ROUNDTABLE_DIR="${ROUNDTABLE_DIR:-/root/projects/roundtable}"
ENV_FILE="${ROUNDTABLE_DIR}/.maf/config/context-manager.env"

print_status() {
  local color="$1"
  local message="$2"
  echo -e "${color}${message}\033[0m"
}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

require_sudo() {
  if [[ "$(id -u)" -ne 0 ]]; then
    print_status "$RED" "❌ This command requires sudo privileges."
    exit 1
  fi
}

show_status() {
  print_status "$BLUE" "📊 Context Manager Service Status:"
  systemctl status "$SERVICE_NAME" --no-pager
  echo ""
  print_status "$BLUE" "🔧 Config:"
  if [[ -f "$ENV_FILE" ]]; then
    cat "$ENV_FILE"
  else
    echo "No config file found at $ENV_FILE"
  fi
}

case "${1:-}" in
  "install")
    require_sudo
    print_status "$BLUE" "Installing context manager service..."
    exec "$(dirname "$0")/setup-context-manager-service.sh"
    ;;
  "uninstall")
    require_sudo
    print_status "$YELLOW" "Uninstalling context manager service..."
    systemctl stop "$SERVICE_NAME" || true
    systemctl disable "$SERVICE_NAME" || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
    print_status "$GREEN" "✅ Service removed."
    ;;
  "start")
    require_sudo
    systemctl start "$SERVICE_NAME"
    print_status "$GREEN" "✅ Service started."
    show_status
    ;;
  "stop")
    require_sudo
    systemctl stop "$SERVICE_NAME"
    print_status "$GREEN" "✅ Service stopped."
    show_status
    ;;
  "restart")
    require_sudo
    systemctl restart "$SERVICE_NAME"
    print_status "$GREEN" "✅ Service restarted."
    show_status
    ;;
  "status")
    show_status
    ;;
  "logs")
    require_sudo
    journalctl -u "$SERVICE_NAME" -n 200 --no-pager
    ;;
  *)
    echo "🤖 Roundtable MAF Context Manager Service Manager"
    echo ""
    echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs}"
    ;;
esac
