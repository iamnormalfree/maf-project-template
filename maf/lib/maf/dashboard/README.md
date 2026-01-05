# MAF Dashboard System

A modular dashboard generation system for the MAF (Multi-Agent Framework) that creates comprehensive markdown overviews with relative evidence linking.

## Features

- **Modular Architecture**: Separate collectors, section generators, and markdown utilities
- **Multiple Data Sources**: SQLite database and file system scanning
- **Comprehensive Sections**: Agents, tasks, events, evidence, and system overview
- **Evidence Linking**: Relative paths to `.maf/` directory structure
- **Idempotent Generation**: Pure functions with deterministic output
- **Emoji Indicators**: Quick visual scanning with status emojis (🟢🟡🔴🚨)
- **Comprehensive Testing**: Full test suite with deterministic fixtures

## Architecture

```
lib/maf/dashboard/
├── collectors/           # Data collection modules
│   ├── sqlite-collector.ts      # SQLite database queries
│   └── filesystem-collector.ts  # File system scanning
├── sections/            # Section generators
│   ├── agents-section.ts        # Agent status and activity
│   ├── tasks-section.ts         # Task status and progress
│   ├── events-section.ts        # System events timeline
│   ├── evidence-section.ts      # Evidence and compliance
│   └── system-section.ts        # System health and resources
├── generators/          # Markdown generation utilities
│   └── markdown-generator.ts     # Formatting and linking utilities
├── __tests__/           # Comprehensive test suite
│   ├── dashboard.test.ts         # Main test file
│   └── fixtures/test-data.ts     # Deterministic test fixtures
├── dashboard.ts         # Main orchestrator
├── cli.ts              # Command-line interface
└── index.ts            # Main entry point
```

## Quick Start

### Basic Usage

```typescript
import { generateDashboard } from './lib/maf/dashboard';

// Generate dashboard with default settings
const result = await generateDashboard('.maf');

if (result.success) {
  console.log('Dashboard generated at:', result.outputPath);
} else {
  console.error('Generation failed:', result.error);
}
```

### Advanced Configuration

```typescript
import { generateDashboardWithConfig } from './lib/maf/dashboard';

const result = await generateDashboardWithConfig({
  mafPath: '.maf',
  outputPath: './custom-dashboard.md',
  includeSections: ['agents', 'tasks', 'system'],
  limits: {
    tasks: 200,
    events: 100,
    evidence: 100,
    logEntries: 200
  }
});
```

### CLI Usage

```bash
# Default dashboard
node lib/maf/dashboard/cli.js

# Custom configuration
node lib/maf/dashboard/cli.js --maf-path /path/to/maf --output dashboard.md

# Specific sections only
node lib/maf/dashboard/cli.js --sections agents,tasks

# Custom limits
node lib/maf/dashboard/cli.js --tasks-limit 200 --events-limit 100 --verbose
```

## Dashboard Sections

### 🤖 Agents Overview
- Agent status summary (active, idle, error)
- Individual agent details with performance metrics
- Context usage monitoring
- Task completion statistics
- Health indicators and recommendations

### 📋 Tasks Overview
- Task status distribution
- Recent activity timeline
- Active tasks with progress tracking
- Tasks needing attention (failed/retrying)
- Performance metrics and success rates

### 📅 System Events
- Event type categorization
- Recent events timeline with timestamps
- Error pattern analysis
- Activity frequency metrics
- Evidence links to detailed logs

### 🔍 Evidence & Compliance
- Verification results summary
- File system artifacts inventory
- Significant log entries
- Compliance indicators
- Detailed evidence links

### 🖥️ System Overview
- System health status
- Core metrics dashboard
- Performance indicators
- File system utilization
- Configuration status
- Resource recommendations

## Configuration Options

### DashboardConfig

```typescript
interface DashboardConfig {
  mafPath: string;                              // Path to .maf directory
  outputPath?: string;                          // Output file path
  includeSections?: Array<'agents' | 'tasks' | 'events' | 'evidence' | 'system'>;
  limits?: {
    tasks?: number;                             // Max tasks to include
    events?: number;                            // Max events to include  
    evidence?: number;                          // Max evidence records
    logEntries?: number;                        // Max log entries
  };
}
```

## Data Sources

### SQLite Collector
- Tasks table with status and metadata
- Events table with system activity
- Evidence table with verification results
- Lease information for active tasks
- System performance metrics

### File System Collector
- Log file scanning and parsing
- Configuration file validation
- State snapshot collection
- Artifact inventory and sizing
- Evidence file organization

## Output Format

The dashboard generates static markdown with:

- **Table of Contents**: Linked navigation to all sections
- **Emoji Indicators**: Status and health visualization
- **Relative Links**: Evidence linking to `.maf/` directory
- **Responsive Tables**: Formatted metrics and data
- **Collapsible Details**: Expandable evidence sections
- **Timestamp Formatting**: Human-readable relative times

## Testing

The system includes comprehensive testing with:

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end dashboard generation
- **Snapshot Tests**: Deterministic output verification
- **Error Handling**: Graceful failure scenarios
- **Performance Tests**: Large dataset handling

```bash
# Run tests
npm test -- lib/maf/dashboard/__tests__/dashboard.test.ts

# Coverage reporting
npm test -- --coverage lib/maf/dashboard
```

## Examples

### Generated Dashboard Structure

```markdown
# MAF Dashboard Overview

*Generated on 2025-11-14T16:17:30.198Z*
*Source: MAF Dashboard System v1.0.0*
*MAF Path: .maf*

## Table of Contents

- [🤖 Agents Overview](#-agents-overview)
- [📋 Tasks Overview](#-tasks-overview)
- [📅 System Events](#-system-events)
- [🔍 Evidence & Compliance](#-evidence--compliance)
- [🖥️ System Overview](#-system-overview)

---

## 🤖 Agents Overview

### Summary

| Status | Count |
|--------|-------|
| 🟢 Active | 1 |
| 🟡 Idle | 1 |
| 🔴 Error | 0 |
| **Total** | **2** |
```

## Development

### Adding New Sections

1. Create section generator in `sections/`
2. Define data interfaces in `collectors/`
3. Add section type to configuration
4. Update main orchestrator
5. Add tests and fixtures

### Extending Data Sources

1. Create collector in `collectors/`
2. Implement data interfaces
3. Add to main orchestrator
4. Update section generators
5. Add test coverage

## Performance

- **Generation Time**: < 1 second for typical datasets
- **Memory Usage**: Minimal streaming approach
- **File Size**: ~10-50KB depending on data
- **Scalability**: Handles 1000+ items efficiently

## Compliance

- **PII-Free**: No personal information processing
- **Audit Ready**: Complete evidence trail
- **Secure**: File system access only within .maf directory
- **Idempotent**: Deterministic output generation

## License

Part of the MAF (Multi-Agent Framework) system.

## Contributing

Follow the established patterns:

1. Pure functions with deterministic output
2. Comprehensive error handling
3. Type safety with TypeScript
4. Full test coverage
5. Documentation updates

## Support

For issues and questions related to the dashboard system:

1. Check generated dashboard for errors
2. Review logs in `.maf/logs/`
3. Validate configuration
4. Check data source availability
5. Review test coverage for examples
