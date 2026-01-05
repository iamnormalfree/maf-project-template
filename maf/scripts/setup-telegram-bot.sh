#!/usr/bin/env bash
# Setup script for the Telegram bot as a systemd service

set -euo pipefail

# Auto-detect project directory (where this script is run from)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${PROJECT_NAME:-maf}-telegram-bot"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
BOT_DIR="${PROJECT_DIR}/maf/mcp_agent_mail"
BOT_SCRIPT="${BOT_DIR}/telegram-bot.js"
ENV_FILE="${PROJECT_DIR}/.agent-mail/telegram.env"
USER_NAME="${USER:-$(whoami)}"
GROUP_NAME="${GROUP:-$(id -gn)}"

echo "🔧 Setting up MAF Telegram bot service..."
echo "📁 Project directory: ${PROJECT_DIR}"
echo "🤖 Service name: ${SERVICE_NAME}"

# Check if running as root for systemd service creation
if [[ $EUID -ne 0 ]]; then
   echo "⚠️  This script needs to be run with sudo to create systemd service"
   echo "   Run: sudo $0"
   exit 1
fi

# Ensure TELEGRAM_BOT_TOKEN is available via env or env file
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
    if [[ ! -f "$ENV_FILE" ]]; then
        echo "❌ TELEGRAM_BOT_TOKEN is not set and $ENV_FILE does not exist."
        echo ""
        echo "📝 To configure your Telegram bot:"
        echo "   1. Create a bot with @BotFather on Telegram"
        echo "   2. Copy the bot token (format: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ)"
        echo "   3. Create $ENV_FILE with:"
        echo "      TELEGRAM_BOT_TOKEN=your_token_here"
        echo "   4. Set permissions: chmod 600 $ENV_FILE"
        echo "   5. Re-run: sudo $0"
        exit 1
    fi
else
    mkdir -p "$(dirname "$ENV_FILE")"
    if [[ ! -f "$ENV_FILE" ]]; then
        umask 077
        printf "TELEGRAM_BOT_TOKEN=%s\n" "$TELEGRAM_BOT_TOKEN" > "$ENV_FILE"
        chown "$USER_NAME:$GROUP_NAME" "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        echo "✅ Wrote token to $ENV_FILE"
    fi
fi

# Install node-telegram-bot-api if not already installed
echo "📦 Installing dependencies..."
cd "$BOT_DIR"
npm list node-telegram-bot-api >/dev/null 2>&1 || npm install node-telegram-bot-api

# Create systemd service file
echo "📝 Creating systemd service..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=MAF Telegram Bot for ${PROJECT_NAME}
After=network.target

[Service]
Type=simple
User=${USER_NAME}
Group=${GROUP_NAME}
WorkingDirectory=${BOT_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${BOT_SCRIPT}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

echo "✅ Enabling ${SERVICE_NAME} service..."
systemctl enable "${SERVICE_NAME}"

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 To start the bot:"
echo "   sudo systemctl start ${SERVICE_NAME}"
echo ""
echo "📊 To check status:"
echo "   sudo systemctl status ${SERVICE_NAME}"
echo ""
echo "📋 To view logs:"
echo "   sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "🛑 To stop the bot:"
echo "   sudo systemctl stop ${SERVICE_NAME}"
