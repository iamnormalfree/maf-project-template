# My MAF Project

This project uses MAF (Multi-Agent Framework) for autonomous agent development.

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure MAF
mkdir -p .maf/config
cp maf/.maf/config/agent-topology.json.example .maf/config/agent-topology.json
# Edit .maf/config/agent-topology.json for your needs

# Add credentials
mkdir -p .maf/credentials
cp maf/.maf/credentials/*.example .maf/credentials/
# Add your API keys

# Initialize MCP Agent Mail
bash maf/scripts/maf/bootstrap-agent-mail.sh

# Spawn agents
pnpm maf:spawn-minimal
```

## MAF Commands

- `pnpm maf:spawn` - Spawn full agent team
- `pnpm maf:spawn-minimal` - Spawn minimal team (2 agents)
- `pnpm maf:update` - Update MAF to latest version
- `pnpm maf:health` - Check agent system health

See [maf/SETUP.md](maf/SETUP.md) for complete guide.

## Project Structure

```
.
├── maf/              # MAF framework (git subtree)
├── src/              # Your source code
├── tests/            # Your tests
├── .maf/             # Your MAF configuration (local)
├── .beads/           # Your task tracking (if using)
└── package.json
```

## Development

Add your project-specific development scripts to package.json.

## Support

- MAF Documentation: [maf/SETUP.md](maf/SETUP.md)
- MAF Issues: https://github.com/iamnormalfree/maf/issues
