# MAF Setup Guide

Complete guide to adding MAF (Multi-Agent Framework) to your repository.

## What is MAF?

MAF is a sophisticated autonomous agent orchestration system that enables AI agents to work collaboratively on your codebase. It includes:

- **Core Library**: Orchestration engine, scheduling, decision-making
- **Response Awareness**: Metacognitive workflow system for complex tasks
- **Operational Scripts**: 170+ scripts for agent coordination
- **MCP Agent Mail**: Inter-agent communication layer
- **Beads Integration**: Task tracking and management
- **Monitoring**: Context management and health checks

## Quick Start (5 minutes)

### 1. Add MAF to Your Repository

```bash
# From your repository root
git subtree add --prefix=maf https://github.com/yourorg/maf main --squash
```

This creates a `maf/` directory with everything needed.

### 2. Configure Your Agent Team

```bash
# Copy and customize agent topology
mkdir -p .maf/config
cp maf/.maf/config/agent-topology.json.example .maf/config/agent-topology.json

# Edit for your needs (number of agents, their roles)
nano .maf/config/agent-topology.json
```

### 3. Add Credentials

```bash
# Create credentials directory
mkdir -p .maf/credentials

# Copy example files
cp maf/.maf/credentials/*.example .maf/credentials/

# Add your actual API keys
nano .maf/credentials/openai.env
nano .maf/credentials/github.env
```

### 4. Initialize MCP Agent Mail

```bash
bash maf/scripts/maf/bootstrap-agent-mail.sh
```

### 5. Install Dependencies

```bash
pnpm install
```

### 6. Spawn Your First Agents

```bash
bash maf/scripts/maf/spawn-agents.sh --layout minimal_2_pane --agents 2
```

That's it! You now have autonomous agents ready to work on your codebase.

## What Gets Installed

```
your-repo/
├── maf/                          # MAF subtree (shared code)
│   ├── lib/maf/                  # Core library
│   ├── .claude/                  # Response Awareness
│   │   ├── skills/               # All metacognitive skills
│   │   ├── agents/               # Specialized agents
│   │   └── commands/             # Entry point commands
│   ├── scripts/maf/              # Operational scripts
│   │   ├── lib/                  # Helper libraries
│   │   ├── prompt-agent.sh       # Agent communication
│   │   ├── spawn-agents.sh       # Start agents
│   │   ├── context-manager-v2.sh # Monitoring
│   │   ├── governance/           # Proposal workflow
│   │   └── maintenance/          # Automation
│   ├── mcp_agent_mail/           # Communication layer
│   ├── .maf/config/              # Configuration examples
│   └── SETUP.md                  # This file
│
├── .maf/                         # Your local configuration (gitignored)
│   ├── config/
│   │   └── agent-topology.json   # Your team structure
│   └── credentials/              # Your API keys (gitignored)
│
├── .beads/                       # Your task tracking (if using Beads)
│
└── your existing code/           # Your project code
```

## Customization Rules

### MUST Customize (Required for each repo):

**Agent Team Structure** (`.maf/config/agent-topology.json`):
```json
{
  "panes": [
    {"index": 0, "role": "supervisor", "agent_name": "GreenMountain"},
    {"index": 1, "role": "reviewer", "agent_name": "BlackDog"},
    {"index": 2, "role": "implementor-1", "agent_name": "OrangePond"},
    {"index": 3, "role": "implementor-2", "agent_name": "FuchsiaCreek"}
  ]
}
```

Adjust based on your needs:
- 2-pane minimal: supervisor + 1 implementor
- 4-pane full: supervisor + reviewer + 2 implementors

**API Credentials** (`.maf/credentials/openai.env`):
```
OPENAI_API_KEY=sk-your-key-here
```

### MAY Customize (Optional, with care):

**Repo-Specific Skills** (`.claude/skills/`):
```bash
# Add your domain-specific skills
mkdir -p .claude/skills/my-domain
# Custom skills for your specific needs
```

**Agent Behavior** (`.maf/config/custom-agent-config.json`):
```bash
cp maf/.maf/config/default-agent-config.json .maf/config/custom-agent-config.json
# Adjust agent parameters
```

### SHOULD NOT Customize (Use as-is):

**Core Library** (`maf/lib/maf/`): Always use from subtree
**Helper Scripts** (`maf/scripts/maf/lib/`): tmux-utils.sh, agent-utils.sh, error-handling.sh
**Agent Prompting** (`maf/scripts/maf/prompt-agent.sh`): Critical for coordination
**Response Awareness** (`maf/.claude/skills/response-awareness*`): Core workflow

## Updating MAF

When a new version is released:

```bash
# Pull latest from GitHub
git subtree pull --prefix=maf https://github.com/yourorg/maf main --squash

# Review what changed
git log --oneline -10

# Test your agents still work
bash maf/scripts/maf/spawn-agents.sh --layout minimal_2_pane --agents 2
```

## Agent Workflows

### Basic Workflow

```bash
# 1. Spawn agents
bash maf/scripts/maf/spawn-agents.sh

# 2. Assign work (via Agent Mail or Beads)
bd ready  # If using Beads

# 3. Monitor progress
tmux attach -t maf-cli:agents

# 4. Agents use Response Awareness for complex tasks
# (Automatically invoked by implementors)

# 5. Review and complete
bash maf/scripts/maf/receipt.sh
```

### Using Response Awareness

Implementors automatically use Response Awareness for bead implementation:

```bash
# In agent conversation:
"I'm implementing bead ABC-123"

# Agent automatically:
# 1. Invokes /response-awareness
# 2. Goes through 6-phase workflow
# 3. Uses specialized subagents
# 4. Generates metacognitive tags
# 5. Completes with verification
```

## Common Tasks

### Check Agent Health

```bash
bash maf/scripts/maf/context-manager-v2.sh status
```

### Send Message to Agent

```bash
bash maf/scripts/maf/prompt-agent.sh supervisor "Check Agent Mail for new tasks"
```

### Generate Completion Receipt

```bash
bash maf/scripts/maf/receipt.sh <bead-id>
```

### View Agent Dashboard

```bash
pnpm maf:dashboard
```

## Troubleshooting

### Agents Won't Spawn

```bash
# Check tmux
tmux ls

# Check for existing sessions
bash maf/scripts/maf/session-cleanup.sh

# Try again
bash maf/scripts/maf/spawn-agents.sh
```

### MCP Agent Mail Not Working

```bash
# Check server is running
bash maf/scripts/maf/bootstrap-agent-mail.sh

# Check logs
cat .agent-mail/server.log | tail -50
```

### Scripts Not Found

```bash
# Verify MAF subtree is present
ls -la maf/

# If missing, add it
git subtree add --prefix=maf https://github.com/yourorg/maf main --squash
```

## Telegram Bot Integration (Optional)

MAF includes a Telegram bot for remote agent coordination and monitoring.

### Creating Your Bot

**Step 1: Create a Telegram Bot**

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to:
   - Choose a name for your bot (e.g., "MyProject MAF Bot")
   - Choose a username (e.g., `myproject_maf_bot`)
4. **Copy the bot token** (format: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`)

**Step 2: (Optional) Customize Your Bot**

- Set description: `/setdescription`
- Set about text: `/setabouttext`
- Set profile picture: `/setuserpic`
- Enable commands: `/setcommands`

### Setup

```bash
# 1. Configure the bot token
cp maf/.agent-mail/telegram.env.example .agent-mail/telegram.env
# Edit .agent-mail/telegram.env and set your bot token:
# TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
chmod 600 .agent-mail/telegram.env

# 2. Install the service (requires sudo)
sudo maf/scripts/setup-telegram-bot.sh

# 3. Start the bot
maf/scripts/manage-telegram-bot.sh start
```

**Important Security Notes:**
- Never commit `telegram.env` to git (it's in `.gitignore`)
- Keep your bot token secret
- The bot token allows full control of your bot
- If leaked, use `/revoke` in BotFather to generate a new token

### Available Commands

Once your bot is running, send these commands to it in Telegram:

- `/start` - Initialize the bot
- `/broadcast` - Execute broadcast-role-prompts.sh
- `/broadcast-pack` - Show/set the active prompt pack
- `/broadcast-targeted` - Prompt only the roles that need action
- `/activity` - Check agent activity
- `/snapshot` - Beads snapshot + tmux activity
- `/stale` - Stale in-progress beads (default: 3 days)
- `/status` - System status

### Management Commands

```bash
# Start the bot
maf/scripts/manage-telegram-bot.sh start

# Stop the bot
maf/scripts/manage-telegram-bot.sh stop

# Restart the bot
maf/scripts/manage-telegram-bot.sh restart

# Check status
maf/scripts/manage-telegram-bot.sh status

# View logs
maf/scripts/manage-telegram-bot.sh logs

# Test locally (not as service)
maf/scripts/manage-telegram-bot.sh test

# Uninstall service
sudo maf/scripts/manage-telegram-bot.sh uninstall
```

See [docs/telegram-maf-setup.md](docs/telegram-maf-setup.md) for complete guide.

## Next Steps

1. **Read the full documentation**: `maf/docs/agents.md`
2. **Explore Response Awareness**: `maf/.claude/skills/`
3. **Customize your agent team**: Edit `.maf/config/agent-topology.json`
4. **Set up Telegram bot** (optional): See above
5. **Join the community**: github.com/yourorg/maf/discussions

## Support

- **Issues**: github.com/yourorg/maf/issues
- **Discussions**: github.com/yourorg/maf/discussions
- **Documentation**: See `maf/docs/` directory
