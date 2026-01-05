#!/usr/bin/env bash
# Management script for the MAF Telegram bot

set -euo pipefail

# Auto-detect project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${PROJECT_NAME:-$(basename "$PROJECT_DIR")}"
SERVICE_NAME="${PROJECT_NAME}-telegram-bot"
BOT_DIR="${PROJECT_DIR}/maf/mcp_agent_mail"
ENV_FILE="${PROJECT_DIR}/.agent-mail/telegram.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

show_help() {
    echo "🤖 MAF Telegram Bot Manager"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Environment Variables:"
    echo "  PROJECT_NAME    - Override project name (default: auto-detected)"
    echo ""
    echo "Commands:"
    echo "  start     Start the bot service"
    echo "  stop      Stop the bot service"
    echo "  restart   Restart the bot service"
    echo "  status    Show service status"
    echo "  logs      Show recent logs"
    echo "  install   Install and setup the service (requires sudo)"
    echo "  uninstall Remove the service (requires sudo)"
    echo "  test      Test the bot locally (not as service)"
    echo "  help      Show this help"
    echo ""
}

install_service() {
    if [[ $EUID -ne 0 ]]; then
        print_status $RED "This command requires sudo privileges"
        exit 1
    fi

    print_status $BLUE "Installing MAF Telegram bot service..."
    exec "$(dirname "$0")/setup-telegram-bot.sh"
}

uninstall_service() {
    if [[ $EUID -ne 0 ]]; then
        print_status $RED "This command requires sudo privileges"
        exit 1
    fi

    print_status $YELLOW "Uninstalling MAF Telegram bot service..."

    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload

    print_status $GREEN "✅ Service uninstalled successfully"
}

start_service() {
    print_status $BLUE "Starting MAF Telegram bot..."
    systemctl start "$SERVICE_NAME"

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_status $GREEN "✅ Bot started successfully!"
        show_status
    else
        print_status $RED "❌ Failed to start bot"
        show_status
        exit 1
    fi
}

stop_service() {
    print_status $YELLOW "Stopping MAF Telegram bot..."
    systemctl stop "$SERVICE_NAME"

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_status $RED "❌ Bot is still running"
    else
        print_status $GREEN "✅ Bot stopped successfully!"
    fi
}

restart_service() {
    print_status $BLUE "Restarting MAF Telegram bot..."
    systemctl restart "$SERVICE_NAME"

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_status $GREEN "✅ Bot restarted successfully!"
        show_status
    else
        print_status $RED "❌ Failed to restart bot"
        show_status
        exit 1
    fi
}

show_status() {
    echo ""
    print_status $BLUE "📊 Service Status:"
    systemctl status "$SERVICE_NAME" --no-pager

    echo ""
    print_status $BLUE "🔍 Detailed Info:"
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        local pid=$(systemctl show -p MainPID --value "$SERVICE_NAME")
        if [[ "$pid" != "0" ]]; then
            echo "  PID: $pid"
            echo "  Memory: $(ps -p "$pid" -o rss= 2>/dev/null | awk '{print int($1/1024)"MB"}' || echo "Unknown")"
            echo "  Uptime: $(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ' || echo "Unknown")"
        fi
    fi
}

show_logs() {
    print_status $BLUE "📋 Showing recent logs (Ctrl+C to exit):"
    journalctl -u "$SERVICE_NAME" -f
}

test_bot() {
    print_status $BLUE "🧪 Testing bot locally (not as service)..."

    cd "$BOT_DIR"

    # Check if dependencies are installed
    if [[ ! -d "node_modules" ]]; then
        print_status $YELLOW "Installing dependencies..."
        npm install
    fi

    print_status $BLUE "Starting bot in test mode (Ctrl+C to stop)..."
    print_status $GREEN "Bot is running! Test with your bot in Telegram"

    # Load environment for testing
    if [[ -f "$ENV_FILE" ]]; then
        set +u
        # shellcheck disable=SC1090
        source "$ENV_FILE"
        set -u
    fi

    if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
        print_status $RED "❌ TELEGRAM_BOT_TOKEN is not set."
        print_status $YELLOW "   Create $ENV_FILE with TELEGRAM_BOT_TOKEN=... or export it before running."
        exit 1
    fi

    export TELEGRAM_BOT_TOKEN
    export PROJECT_DIR="$PROJECT_DIR"
    export NODE_ENV=development

    node telegram-bot.js
}

# Main script logic
case "${1:-help}" in
    "install")
        install_service
        ;;
    "uninstall")
        uninstall_service
        ;;
    "start")
        start_service
        ;;
    "stop")
        stop_service
        ;;
    "restart")
        restart_service
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "test")
        test_bot
        ;;
    "help"|*)
        show_help
        ;;
esac
