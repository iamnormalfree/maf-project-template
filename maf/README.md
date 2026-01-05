# MAF (Multi-Agent Framework)

A sophisticated autonomous agent orchestration system for software development.

## Quick Overview

MAF enables AI agents to work collaboratively on your codebase through:

- **Autonomous Coordination**: Agents communicate via MCP Agent Mail
- **Metacognitive Workflows**: Response Awareness for complex tasks
- **Task Tracking**: Integration with Beads for work management
- **Production Operations**: Monitoring, health checks, automation

## Installation

Add MAF to any repository in one command:

```bash
git subtree add --prefix=maf https://github.com/iamnormalfree/maf main --squash
```

Then run the automated setup script:

```bash
bash maf/scripts/setup-maf.sh
```

The script will configure everything automatically, with support for environment variables like `OPENAI_API_KEY`.

See [SETUP.md](SETUP.md) for complete configuration guide.

## What's Included

- **lib/maf/**: Core TypeScript library (orchestration, scheduling, decisions)
- **.claude/**: Response Awareness framework (20+ skills, 23 specialized agents)
- **scripts/maf/**: 170+ operational scripts (spawn, monitor, coordinate)
- **scripts/setup-maf.sh**: Automated setup script with environment variable support
- **mcp_agent_mail/**: Complete communication layer
- **Telegram Bot**: Remote agent coordination and monitoring
- **.maf/config/**: Configuration templates
- **docs/**: Comprehensive documentation

## Documentation

- [SETUP.md](SETUP.md) - Complete setup guide (includes Telegram bot setup)
- [docs/telegram-maf-setup.md](docs/telegram-maf-setup.md) - Telegram bot configuration
- [docs/agents.md](docs/agents.md) - Agent operations (1,180 lines)
- [docs/operations/](docs/operations/) - Operational guides

## Versioning

- **v0.1.3**: Added automated setup script with environment variable support
- **v0.1.2**: Fixed subtree layout detection for git subtree compatibility
- **v0.1.1**: Added Telegram bot integration
- **v0.1.0**: Initial distribution from roundtable
- See [Releases](https://github.com/iamnormalfree/maf/releases) for changelog

## License

MIT

## Support

- Issues: https://github.com/iamnormalfree/maf/issues
- Discussions: https://github.com/iamnormalfree/maf/discussions
