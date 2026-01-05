# Telegram MAF Bot Setup Guide

This guide sets up a persistent Telegram bot that can execute MAF scripts and monitor agent activity in tmux sessions.

## 🚀 Quick Setup

### 0. Configure the Bot Token

```bash
cp .agent-mail/telegram.env.example .agent-mail/telegram.env
# Edit .agent-mail/telegram.env and set TELEGRAM_BOT_TOKEN
chmod 600 .agent-mail/telegram.env
```

### 1. Install the Service

```bash
# Run the setup script (requires sudo)
sudo ./scripts/setup-telegram-bot.sh
```

### 2. Start the Bot

```bash
# Use the management script
./scripts/manage-telegram-bot.sh start
```

### 3. Test the Bot

1. Open Telegram and search for `@Roundtable_botbot`
2. Start a chat with `/start`
3. Try commands:
   - `/broadcast` - Execute broadcast-role-prompts.sh
   - `/broadcast-pack` - Show/set the active prompt pack for `/broadcast-targeted`
   - `/broadcast-targeted` - Prompt only the roles that need action
   - `/broadcast-targeted auto idle` - Like auto, but avoids interrupting busy panes
   - `/review <bead-id>` - Ask reviewer to sign off (Agent Mail + nudge reviewer pane)
   - `/reviewer <message>` - Short note to reviewer (Agent Mail + nudge)
   - `/activity` - Check agent activity
   - `/snapshot` - Beads snapshot + tmux activity
   - `/stale` - Stale in-progress beads (default: 3 days)
   - `/close <bead-id>` - Close a bead in Beads
   - `/unblock [confirm|trust|submit|clear|apply]` - Diagnose/resolve pending input in agent panes
   - `/status` - System status

## 📋 Features

### Core Functionality
- **Persistent Service**: Runs as systemd service, survives SSH disconnects
- **Script Execution**: Execute MAF scripts via Telegram commands
- **Real-time Monitoring**: Monitor tmux agent activity and status
- **Feedback Loop**: Detailed feedback on script execution and agent responses

### Available Commands
- `/start` - Initialize bot and show commands
- `/help` - Display help information
- `/broadcast` - Execute broadcast-role-prompts.sh
- `/broadcast-pack` - Show/set the active prompt pack for `/broadcast-targeted`
- `/broadcast-targeted` - Prompt only the roles that need action
- `/review <bead-id>` - Ask reviewer to sign off (Agent Mail + nudge reviewer pane)
- `/reviewer <message>` - Short note to reviewer (Agent Mail + nudge)
- `/activity` - Monitor agent activity in tmux
- `/snapshot` - Beads status (ready/in-progress/closed) + tmux activity
- `/snapshot all` or `/snapshot N` - Show full list or a larger slice
- `/stale [days|all]` - Show stale in-progress beads
- `/close <bead-id>` - Close a bead and record it in Beads
- `/unblock [confirm|trust|submit|clear|apply]` - Diagnose/resolve pending input in agent panes
- `/unblock` ignores Codex default prompt placeholders (e.g., “Explain this codebase”)
- `/status` - Check system and tmux status

### Monitoring Features
- **Tmux Session Detection**: Checks if maf-cli session is active
- **Pane Activity Monitoring**: Tracks activity in each agent pane
- **Prompt Detection**: Identifies when agents receive prompts
- **System Status**: Memory usage, session information
- **Activity Logging**: Detailed logs stored in `.agent-mail/`

### Bead Closure Policy

- Implementor ships code + tests, runs the target tests, then pings reviewer + supervisor “ready to close”.
- Reviewer verifies the result (reopen if needed) and sends an “approved” update that includes the bead id.
- Supervisor closes the bead (or enables auto-close) and keeps the queue unblocked.

**Optional automation:** if you want the bot to close beads automatically when the reviewer sends an “approved” update, set `MAF_REVIEW_AUTO_CLOSE_ENABLED=true` in `.agent-mail/telegram.env` and restart the bot.

**Optional autopilot (no Telegram commands needed):** if you want the bot to periodically run the equivalent of `/broadcast-targeted auto idle` on its own, set these in `.agent-mail/telegram.env` and restart the bot:
- `MAF_AUTOPILOT_ENABLED=true`
- `MAF_AUTOPILOT_INTERVAL_MS=120000` (example: every 2 minutes)
- `MAF_AUTOPILOT_IDLE_ONLY=true` (recommended)
- `MAF_AUTOPILOT_COOLDOWN_SEC=900` (don’t re-send identical prompts too frequently)

**Autopilot unblock (optional):** if you want the bot to keep Claude panes moving when they pause on confirmations, set:
- `MAF_AUTOPILOT_UNBLOCK_ENABLED=true`
- `MAF_AUTOPILOT_UNBLOCK_INTERVAL_MS=15000`
- `MAF_AUTOPILOT_UNBLOCK_SUBMIT=true` (press Enter only when pending input starts with `/response-awareness`)
- `MAF_AUTOPILOT_UNBLOCK_CONFIRM_MCP_AGENT_MAIL=true` (press “1” once for mcp-agent-mail confirms)
- `MAF_AUTOPILOT_UNBLOCK_TRUST_MCP_AGENT_MAIL=false` (set true only if you explicitly want “2=trust”)

**Default Response Awareness (Claude implementors):** if you want Implementor-1/2 (when running `claude`) to start assigned beads by running the router `/response-awareness` automatically, set:
- `MAF_IMPLEMENTOR_DEFAULT_RESPONSE_AWARENESS=true`

**Mail-aware idle (optional):** if you want `idle` mode to also consider Agent Mail (so panes that *just got new mail* won't be re-pinged in tmux), set:
- `MAF_IDLE_MAIL_POLICY=skip` (suppress tmux pings when new mail arrived)
- `MAF_IDLE_MAIL_POLICY=wake` (prompt supervisor/reviewer when their inbox is non-empty, even if there's no Beads work to assign)

**Mail → Telegram forwarding (NEW):** if you want Agent Mail messages from GreenMountain to be automatically forwarded to your Telegram (for supervisor bead notifications), these are the defaults:
- `MAF_MAIL_FORWARD_ENABLED=true` (enables forwarding)
- `MAF_MAIL_FORWARD_INTERVAL_MS=300000` (polls every 5 minutes)
- `MAF_MAIL_FORWARD_FILTER_BEADS_ONLY=true` (only forwards messages with bead IDs)

**To customize mail forwarding:**
```bash
# In .agent-mail/telegram.env or as environment variables:
MAF_MAIL_FORWARD_ENABLED=true              # Enable/disable
MAF_MAIL_FORWARD_INTERVAL_MS=300000        # Polling interval (5 minutes)
MAF_MAIL_FORWARD_FILTER_BEADS_ONLY=true    # Filter to bead messages only
```

**What gets forwarded:** Messages from GreenMountain (Supervisor) to HumanOverseer that contain bead IDs (e.g., `roundtable-xxx`), bead-related keywords (`bead`, `opened`, `closed`), or have `ack_required=true`.

**Use case:** Get notified in Telegram when GreenMountain approves implementor-created beads. See `docs/operations/supervisor-bead-notification-guide.md` for the complete workflow.

## 🔧 Management

### Service Management

```bash
# Start/Stop/Restart
./scripts/manage-telegram-bot.sh start
./scripts/manage-telegram-bot.sh stop
./scripts/manage-telegram-bot.sh restart

# Check status
./scripts/manage-telegram-bot.sh status

# View logs
./scripts/manage-telegram-bot.sh logs

# Test locally (not as service)
./scripts/manage-telegram-bot.sh test

# Uninstall service
sudo ./scripts/manage-telegram-bot.sh uninstall
```

## 🎯 Recommended operator loop (with prompt packs)

1. Ensure the bot is running (or restart after updates):
   - `./scripts/manage-telegram-bot.sh restart`
2. In Telegram:
   - `/broadcast-pack set <pack>` (example: `/broadcast-pack set roundtable-jlh`)
   - `/broadcast-targeted` then `/broadcast-apply` (or `/broadcast-targeted auto`)
   - `/activity`
   - If an agent is “awaiting response” (typed input waiting): `/unblock submit` (or `/unblock clear`)
3. If anything stalls:
   - `/unblock`

### Manual Systemd Commands

```bash
# Start service
sudo systemctl start roundtable-maf-bot

# Stop service
sudo systemctl stop roundtable-maf-bot

# Enable on boot
sudo systemctl enable roundtable-maf-bot

# Check status
sudo systemctl status roundtable-maf-bot

# View logs
sudo journalctl -u roundtable-maf-bot -f
```

## 📊 Monitoring

### Agent Activity Monitoring

The bot provides comprehensive monitoring of your tmux agent sessions:

1. **Session Status**: Checks if maf-cli tmux session exists
2. **Pane Information**: Details about each agent pane
3. **Activity Detection**: Monitors recent commands and prompts
4. **Broadcast Verification**: Confirms if broadcast prompts were delivered
5. **System Resources**: Memory and resource usage

### Manual Monitoring

You can also run the monitor manually:

```bash
# Terminal output
./scripts/maf/tmux-agent-monitor.sh

# Telegram formatted output
./scripts/maf/tmux-agent-monitor.sh telegram

# JSON output for scripts
./scripts/maf/tmux-agent-monitor.sh json
```

## 🗂️ File Structure

```
roundtable/
├── mcp_agent_mail/
│   ├── telegram-bot.js          # Main bot application
│   └── package.json             # Node.js dependencies
├── scripts/
│   ├── setup-telegram-bot.sh    # Service installation script
│   ├── manage-telegram-bot.sh   # Bot management script
│   └── maf/
│       ├── broadcast-role-prompts.sh  # Script executed by bot
│       └── tmux-agent-monitor.sh      # Enhanced monitoring script
├── .agent-mail/                 # Bot logs and monitoring data
│   ├── telegram-bot.log         # Bot operation logs
│   ├── tmux-monitor-*.log       # Monitoring session logs
│   └── pane-*-activity.log      # Individual pane activity logs
└── docs/
    └── telegram-maf-setup.md    # This documentation
```

## 🔍 Troubleshooting

### Bot Not Responding

1. Check service status:
   ```bash
   ./scripts/manage-telegram-bot.sh status
   ```

2. Check logs:
   ```bash
   ./scripts/manage-telegram-bot.sh logs
   ```

3. Verify bot token:
   - Ensure token is present in `.agent-mail/telegram.env`
   - Check bot hasn't been revoked by Telegram

### Script Execution Fails

1. Check script permissions:
   ```bash
   ls -la scripts/maf/broadcast-role-prompts.sh
   ```

2. Verify tmux session:
   ```bash
   tmux list-sessions | grep maf-cli
   ```

3. Check agent pane layout:
   ```bash
   tmux list-panes -t maf-cli
   ```

### Monitoring Issues

1. Check tmux session existence:
   ```bash
   tmux has-session -t maf-cli 2>/dev/null && echo "Session exists" || echo "Session not found"
   ```

2. Verify pane commands:
   ```bash
   tmux list-panes -t maf-cli -F "#{pane_index}: #{pane_current_command}"
   ```

3. Check log directory permissions:
   ```bash
   ls -la .agent-mail/
   ```

4. If the bot cannot see tmux sessions:
   - Ensure the service user matches the user who started tmux.
   - Set `MAF_TMUX_SESSION` if your session name is not `maf-cli`.
   - Ensure the systemd service does not isolate `/tmp` (tmux sockets live there).

## 🛠️ Advanced Configuration

### Environment Variables

The bot uses these environment variables (loaded via `EnvironmentFile` in systemd):

- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `ROUNDTABLE_DIR`: Path to Roundtable project
- `NODE_ENV`: Node.js environment (production)
- `MAF_TMUX_SESSION`: Optional override if your tmux session is not `maf-cli` (e.g., `maf-5pane`)

### Custom Scripts

To add new scripts for bot execution:

1. Place script in `scripts/maf/`
2. Make it executable: `chmod +x script.sh`
3. Add command handler in `telegram-bot.js`

### Monitoring Customization

The `tmux-agent-monitor.sh` script can be customized:

- Modify pane names and layout
- Adjust activity detection logic
- Add additional monitoring metrics

## 🔐 Security Considerations

- Bot token is stored in `.agent-mail/telegram.env`
- Script execution runs with user permissions
- Logs contain tmux pane content - secure accordingly
- Consider restricting bot to authorized users

## 📞 Support

If you encounter issues:

1. Check logs: `./scripts/manage-telegram-bot.sh logs`
2. Verify tmux session: `tmux list-sessions`
3. Test scripts manually: `bash scripts/maf/broadcast-role-prompts.sh`
4. Check node modules: `cd mcp_agent_mail && npm install`

## 🎯 Usage Examples

### Typical Workflow

1. **Start Agents**: Ensure tmux session with agents is running
2. **Broadcast Prompts**: Send `/broadcast` command to prompt all agents
3. **Monitor Activity**: Use `/activity` to check if agents are responding
4. **Check Status**: Use `/status` for system overview

### Automation Integration

The bot can be integrated into automation workflows:

```bash
# Broadcast prompts via script
curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=/broadcast"

# Check agent activity
./scripts/maf/tmux-agent-monitor.sh json | jq '.status'
```

The bot provides a robust, persistent interface for managing your MAF agents through Telegram, with comprehensive monitoring and feedback capabilities.
