# MafDataCollector Implementation Summary

## Overview

Implemented the MafDataCollector class following the synthesis blueprint for a three-layer data collection pipeline.

## Architecture

```
Layer 1: Raw JSON (TmuxMonitorRawOutput)
    ↓ collect()
Layer 2: Collected Data (CollectedData)
    ↓ buildSupervisionContext()
Layer 3: Supervision Context (SupervisionContext)
```

## Files Modified

1. **lib/maf/supervision/types.ts** (159 lines)
   - Added three-layer type definitions
   - Layer 1: `TmuxMonitorRawOutput`, `AgentJsonData`, `SystemJsonData`
   - Layer 2: `CollectedData`, `CollectedAgentData`, `SystemMetrics`
   - Layer 3: `SupervisionContext`, `AgentState`, `AgentSession` (enhanced)

2. **lib/maf/supervision/data-collector.ts** (454 lines)
   - Implemented `MafDataCollector` class
   - Public methods:
     - `collect(): Promise<CollectedData>` - Layer 1 → Layer 2
     - `buildSupervisionContext(): Promise<SupervisionContext>` - Layer 2 → Layer 3
     - `collectAndBuild(): Promise<SupervisionContext>` - Legacy convenience method
   - Private methods for data transformation and error handling
   - Factory function: `createMafDataCollector()`

## Key Features

### 1. Three-Layer Pipeline

**Layer 1: Raw JSON from tmux-agent-monitor.sh**
- Represents bash script output structure
- Includes agent data, system metrics, session info
- Type: `TmuxMonitorRawOutput`

**Layer 2: Collected Data (Internal)**
- Merges tmux data with runtime heartbeats
- Adds collection metadata and warnings
- Type: `CollectedData`

**Layer 3: Supervision Context (View Model)**
- Optimized for supervisor consumption
- Simplified agent states and session tracking
- Type: `SupervisionContext`

### 2. Error Handling Strategy

Graceful degradation at every layer:
- Bash script timeout → Returns empty `CollectedData` with warning
- JSON parse error → Returns empty `CollectedData` with warning
- Missing tmux session → Returns empty `CollectedData` with warning
- **Never throws** - Always returns valid structure

### 3. Integration Points

**Constructor:**
```typescript
constructor(runtimeState: MafRuntimeState, eventLogger?: MafEventLogger)
```

**Usage:**
```typescript
const collector = new MafDataCollector(runtimeState, eventLogger);
const collected = await collector.collect();
const context = await collector.buildSupervisionContext(collected);
```

**Or with factory:**
```typescript
const collector = createMafDataCollector(runtimeState, eventLogger);
```

### 4. Performance

- Default timeout: 10 seconds for bash script execution
- Warning if collection takes >100ms
- Efficient data transformation (no unnecessary copies)

## Type Definitions

### Layer 1: Raw JSON

```typescript
interface TmuxMonitorRawOutput {
  timestamp: string;
  session: string;
  window: string;
  agents: AgentJsonData[];
  system: SystemJsonData;
}
```

### Layer 2: Collected Data

```typescript
interface CollectedData {
  agents: CollectedAgentData[];
  system: SystemMetrics;
  collectedAt: number;
  source: 'tmux' | 'fallback';
  warnings: string[];
}
```

### Layer 3: Supervision Context

```typescript
interface SupervisionContext {
  agents: AgentState[];
  sessions: AgentSession[];
  systemHealth: {
    tmuxRunning: boolean;
    sessionCount: number;
    paneCount: number;
    memoryMb: number;
  };
  timestamp: number;
}
```

## Status Mapping

MafHeartbeat.status → AgentState.status:
- `'blocked'` → `'blocked'` (direct)
- `'working'` → `'active'` (working means active)
- `'idle'` → `'idle'` (direct)

## Testing

Compilation verified:
```bash
npx tsc --noEmit lib/maf/supervision/*.ts
```

No TypeScript errors.

## Next Steps

1. **Extend tmux-agent-monitor.sh** to support `json-detailed` output format
2. **Add unit tests** for data transformation logic
3. **Integration testing** with actual tmux sessions
4. **Performance benchmarking** with realistic agent loads

## Tags Used

- #PATH_DECISION: Using child_process.exec for bash calls
- #COMPLETION_DRIVE: Assuming runtime state structure matches core/types
- #SUGGEST_ERROR_HANDLING: Graceful degradation - never throws, always returns valid data

## LCL Context from Synthesis

- LCL: type_architecture::three_layer_pipeline (raw → collected → view)
- LCL: data_source::live_tmux_only (no registry dependency)
- LCL: performance_target::subprocess_overhead_acceptable (20-30ms)
