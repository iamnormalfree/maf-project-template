// ABOUTME: Test fixtures and data for MAF dashboard system tests
// ABOUTME: Provides deterministic, reproducible test data for comprehensive testing

import type { AgentData, TaskData, EventData, EvidenceData, SystemData } from '../../collectors/sqlite-collector';
import type { FileSystemArtifact, LogEntry, ConfigFile, StateSnapshot } from '../../collectors/filesystem-collector';
import type { SecurityMetrics } from '../../collectors/security-collector';

// Fixed timestamp for deterministic testing
export const FIXED_TIMESTAMP = 1699728000000; // 2023-11-11 12:00:00 UTC

// Agent test data
export const MOCK_AGENTS: AgentData[] = [
  {
    id: 'agent-001',
    status: 'active',
    lastSeen: FIXED_TIMESTAMP - 60000, // 1 minute ago
    leaseCount: 3,
    contextUsage: 45,
    totalTasks: 15,
    completedTasks: 12,
    failedTasks: 1
  },
  {
    id: 'agent-002',
    status: 'idle',
    lastSeen: FIXED_TIMESTAMP - 300000, // 5 minutes ago
    leaseCount: 0,
    contextUsage: 23,
    totalTasks: 8,
    completedTasks: 8,
    failedTasks: 0
  },
  {
    id: 'agent-003',
    status: 'error',
    lastSeen: FIXED_TIMESTAMP - 600000, // 10 minutes ago
    leaseCount: 1,
    totalTasks: 5,
    completedTasks: 2,
    failedTasks: 3
  }
];

// Task test data
export const MOCK_TASKS: TaskData[] = [
  {
    id: 'task-001',
    state: 'RUNNING',
    priority: 100,
    createdAt: FIXED_TIMESTAMP - 3600000, // 1 hour ago
    updatedAt: FIXED_TIMESTAMP - 1800000, // 30 minutes ago
    attempts: 2,
    agentId: 'agent-001',
    policyLabel: 'private',
    duration: 1800000, // 30 minutes
    payload: { type: 'synthetic_file_lease', filePath: '/tmp/test.txt' }
  },
  {
    id: 'task-002',
    state: 'DONE',
    priority: 75,
    createdAt: FIXED_TIMESTAMP - 7200000, // 2 hours ago
    updatedAt: FIXED_TIMESTAMP - 3600000, // 1 hour ago
    attempts: 1,
    policyLabel: 'public'
  },
  {
    id: 'task-003',
    state: 'READY',
    priority: 50,
    createdAt: FIXED_TIMESTAMP - 1800000, // 30 minutes ago
    updatedAt: FIXED_TIMESTAMP - 1800000,
    attempts: 0,
    policyLabel: 'private'
  },
  {
    id: 'task-004',
    state: 'DEAD',
    priority: 25,
    createdAt: FIXED_TIMESTAMP - 10800000, // 3 hours ago
    updatedAt: FIXED_TIMESTAMP - 3600000, // 1 hour ago
    attempts: 5,
    agentId: 'agent-003',
    policyLabel: 'private'
  }
];

// Event test data
export const MOCK_EVENTS: EventData[] = [
  {
    id: 1,
    taskId: 'task-001',
    timestamp: FIXED_TIMESTAMP - 1800000,
    kind: 'task_started',
    data: { agentId: 'agent-001' }
  },
  {
    id: 2,
    taskId: 'task-001',
    timestamp: FIXED_TIMESTAMP - 900000,
    kind: 'heartbeat',
    data: { agentId: 'agent-001', status: 'active' }
  },
  {
    id: 3,
    taskId: 'task-002',
    timestamp: FIXED_TIMESTAMP - 3600000,
    kind: 'task_completed',
    data: { agentId: 'agent-002' }
  },
  {
    id: 4,
    taskId: 'task-004',
    timestamp: FIXED_TIMESTAMP - 3600000,
    kind: 'task_failed',
    data: { agentId: 'agent-003', error: 'Timeout exceeded' }
  },
  {
    id: 5,
    taskId: 'task-001',
    timestamp: FIXED_TIMESTAMP - 60000,
    kind: 'message_enqueued',
    data: { messageType: 'status_update', agentId: 'agent-001' }
  }
];

// Evidence test data
export const MOCK_EVIDENCE: EvidenceData[] = [
  {
    taskId: 'task-002',
    attempt: 1,
    verifier: 'preflight-validation',
    result: 'PASS',
    details: { checks: 5, passed: 5, warnings: 0 }
  },
  {
    taskId: 'task-004',
    attempt: 3,
    verifier: 'resource-check',
    result: 'FAIL',
    details: { checks: 3, passed: 1, errors: ['Memory limit exceeded', 'Disk space insufficient'] }
  },
  {
    taskId: 'task-003',
    attempt: 1,
    verifier: 'security-scan',
    result: 'PASS',
    details: { checks: 8, passed: 8, warnings: 1 }
  }
];

// System test data
export const MOCK_SYSTEM_DATA: SystemData = {
  totalTasks: 25,
  activeTasks: 3,
  completedTasks: 20,
  failedTasks: 2,
  totalEvents: 150,
  totalEvidence: 18,
  activeLeases: 3,
  oldestActiveTask: FIXED_TIMESTAMP - 3600000,
  newestTask: FIXED_TIMESTAMP - 60000,
  systemHealth: 'healthy'
};

// File system artifacts test data
export const MOCK_ARTIFACTS: FileSystemArtifact[] = [
  {
    path: '.maf/logs/agent-001.log',
    type: 'log',
    size: 1024,
    lastModified: FIXED_TIMESTAMP - 60000,
    relativePath: 'logs/agent-001.log',
    exists: true
  },
  {
    path: '.maf/config/runtime.json',
    type: 'config',
    size: 512,
    lastModified: FIXED_TIMESTAMP - 3600000,
    relativePath: 'config/runtime.json',
    exists: true
  },
  {
    path: '.maf/state/agent-002-snapshot.json',
    type: 'state',
    size: 2048,
    lastModified: FIXED_TIMESTAMP - 300000,
    relativePath: 'state/agent-002-snapshot.json',
    exists: true
  },
  {
    path: '.maf/evidence/task-004-evidence.json',
    type: 'evidence',
    size: 768,
    lastModified: FIXED_TIMESTAMP - 3600000,
    relativePath: 'evidence/task-004-evidence.json',
    exists: true
  },
  {
    path: '.maf/logs/missing.log',
    type: 'log',
    size: 0,
    lastModified: 0,
    relativePath: 'logs/missing.log',
    exists: false
  }
];

// Log entries test data
export const MOCK_LOG_ENTRIES: LogEntry[] = [
  {
    timestamp: FIXED_TIMESTAMP - 60000,
    level: 'error',
    message: 'Task task-004 failed: Timeout exceeded',
    source: 'task-manager'
  },
  {
    timestamp: FIXED_TIMESTAMP - 120000,
    level: 'warn',
    message: 'High memory usage detected: 85%',
    source: 'system-monitor'
  },
  {
    timestamp: FIXED_TIMESTAMP - 180000,
    level: 'info',
    message: 'Agent agent-001 started task task-001',
    source: 'agent-coordinator'
  },
  {
    timestamp: FIXED_TIMESTAMP - 240000,
    level: 'error',
    message: 'Database connection failed',
    source: 'sqlite-runtime'
  }
];

// Config files test data
export const MOCK_CONFIG_FILES: ConfigFile[] = [
  {
    path: '.maf/config/runtime.json',
    name: 'runtime.json',
    exists: true,
    content: { mode: 'sqlite', path: '.maf/runtime.db' },
    lastModified: FIXED_TIMESTAMP - 3600000
  },
  {
    path: '.maf/config/agents.json',
    name: 'agents.json',
    exists: true,
    content: { agents: ['agent-001', 'agent-002'] },
    lastModified: FIXED_TIMESTAMP - 7200000
  },
  {
    path: '.maf/config/missing.json',
    name: 'missing.json',
    exists: false,
    lastModified: 0
  }
];

// State snapshots test data
export const MOCK_STATE_SNAPSHOTS: StateSnapshot[] = [
  {
    agentId: 'agent-001',
    timestamp: FIXED_TIMESTAMP - 300000,
    status: 'active',
    filePath: 'agent-001-snapshot.json',
    size: 2048
  },
  {
    agentId: 'agent-002',
    timestamp: FIXED_TIMESTAMP - 600000,
    status: 'idle',
    filePath: 'agent-002-snapshot.json',
    size: 1536
  }
];

// File system stats test data
export const MOCK_FILESYSTEM_STATS = {
  totalFiles: 15,
  totalSize: 1024 * 1024, // 1MB
  filesByType: {
    log: 8,
    config: 3,
    state: 2,
    evidence: 2
  },
  largestFiles: [
    { path: 'logs/agent-001.log', size: 1024 * 512, type: 'log' },
    { path: 'state/agent-001-snapshot.json', size: 1024 * 256, type: 'state' },
    { path: 'evidence/task-004-evidence.json', size: 1024 * 128, type: 'evidence' }
  ]
};

// Test scenarios
export const TEST_SCENARIOS = {
  empty: {
    agents: [],
    tasks: [],
    events: [],
    evidence: [],
    artifacts: [],
    logEntries: [],
    configFiles: [],
    stateSnapshots: []
  },
  minimal: {
    agents: [MOCK_AGENTS[0]],
    tasks: [MOCK_TASKS[0]],
    events: [MOCK_EVENTS[0]],
    evidence: [MOCK_EVIDENCE[0]],
    artifacts: [MOCK_ARTIFACTS[0]],
    logEntries: [MOCK_LOG_ENTRIES[0]],
    configFiles: [MOCK_CONFIG_FILES[0]],
    stateSnapshots: [MOCK_STATE_SNAPSHOTS[0]]
  },
  full: {
    agents: MOCK_AGENTS,
    tasks: MOCK_TASKS,
    events: MOCK_EVENTS,
    evidence: MOCK_EVIDENCE,
    artifacts: MOCK_ARTIFACTS,
    logEntries: MOCK_LOG_ENTRIES,
    configFiles: MOCK_CONFIG_FILES,
    stateSnapshots: MOCK_STATE_SNAPSHOTS
  }
};

// Snapshot test results
export const EXPECTED_AGENTS_SECTION_SNAPSHOT = `## 🤖 Agents Overview

*Last updated: 2023-11-11T12:00:00.000Z*

### Summary

| Status | Count |
|--------|-------|
| 🟢 Active | 1 |
| 🟡 Idle | 1 |
| 🔴 Error | 1 |
| **Total** | **3** |

### Agent Details

#### 🟢 agent-001

- **Status:** active
- **Last Seen:** 1 minute ago
- **Active Leases:** 3
- **Context Usage:** 🟢 45%
- **Task Statistics:**
  - Total: 15
  - Completed: 12
  - Failed: 1
  - Success Rate: 80.0%

**Evidence:** [State snapshots](../state/)

#### 🟡 agent-002

- **Status:** idle
- **Last Seen:** 5 minutes ago
- **Active Leases:** 0
- **Context Usage:** 🟢 23%
- **Task Statistics:**
  - Total: 8
  - Completed: 8
  - Failed: 0
  - Success Rate: 100.0%

**Evidence:** [State snapshots](../state/)

#### 🔴 agent-003

- **Status:** error
- **Last Seen:** 10 minutes ago
- **Active Leases:** 1
- **Task Statistics:**
  - Total: 5
  - Completed: 2
  - Failed: 3
  - Success Rate: 40.0%

### Health Indicators

🚨 **Attention Needed:** 1 agent(s) in error state

🟡 **Note:** More agents idle than active - check workload distribution
`;

export const EXPECTED_TASKS_SECTION_SNAPSHOT = `## 📋 Tasks Overview

*Last updated: 2023-11-11T12:00:00.000Z*

### Task Status Summary

| Status | Count | Percentage |
|--------|-------|------------|
| ⚪ READY | 1 | 25.0% |
| 🔵 RUNNING | 1 | 25.0% |
| ✅ DONE | 1 | 25.0% |
| 💀 DEAD | 1 | 25.0% |
| **Total** | **4** | **100%** |

### Recent Activity

- 💓 **1 minute ago**: \`task-001\`: Message enqueued: status_update
- ✅ **1 hour ago**: \`task-002\`: Task completed successfully
- 💓 **30 minutes ago**: \`task-001\`: Heartbeat from agent-001 (status: active)
- ▶️ **30 minutes ago**: \`task-001\`: Task started by agent-001
- 🔴 **1 hour ago**: \`task-004\`: Task failed: Timeout exceeded

### Active Tasks

#### 🔵 task-001

- **State:** RUNNING
- **Priority:** 100
- **Created:** 1 hour ago (60 minutes ago)
- **Attempts:** 2
- **Agent:** agent-001
- **Duration:** 30m 0s
- **Policy:** private
- **Evidence:** Available in system logs

#### ⚪ task-003

- **State:** READY
- **Priority:** 50
- **Created:** 30 minutes ago (30 minutes ago)
- **Attempts:** 0
- **Policy:** private

### 🚨 Tasks Needing Attention

- 💀 **task-004**: DEAD (5 attempts)

### Performance Metrics

- **Average attempts per completed task:** 1.0
- **Failure rate:** 25.0%
- **High priority tasks (90+):** 1
`;

export const EXPECTED_EVENTS_SECTION_SNAPSHOT = `## 📅 System Events

*Last updated: 2023-11-11T12:00:00.000Z*

### Event Types (Last 50)

| Type | Count |
|------|-------|
| 📧 message_enqueued | 1 |
| 💓 heartbeat | 1 |
| ✅ task_completed | 1 |
| 🔴 task_failed | 1 |
| ▶️ task_started | 1 |

### Recent Events Timeline

#### Sat Nov 11 2023

- **12:00:00 PM** 📧 \`task-001\`: Message enqueued: status_update
  _1 minute ago_

- **11:45:00 AM** 💓 \`task-001\`: Heartbeat from agent-001 (status: active)
  _15 minutes ago_

- **11:30:00 AM** ▶️ \`task-001\`: Task started by agent-001
  _30 minutes ago_

- **11:00:00 AM** ✅ \`task-002\`: Task completed successfully
  _1 hour ago_

- **11:00:00 AM** 🔴 \`task-004\`: Task failed: Timeout exceeded
  _1 hour ago_

### Event Patterns

🔴 **Errors:** 2 error events detected
  - task_failed: 1
  - Database connection failed: 1

### Activity Frequency

- **Last hour:** 0 events
- **Last 24 hours:** 5 events
- **Average per hour:** 0.2

### Evidence Links

- **Full event logs:** [\`../logs/\`](../logs/)
- **Task-specific evidence:** See individual task sections
- **System state:** [\`../state/\`](../state/)
`;

// Security test data
export const MOCK_SECURITY_METRICS: SecurityMetrics = {
  policyValid: true,
  policyFile: '/project/lib/maf/policy/policy.json',
  allowlistDomains: 3,
  allowlistFile: '/project/lib/maf/security/domain-allowlist.json',
  currentProfile: 'standard',
  recentSecurityEvents: 2,
  auditLog: '/project/runtime/logs/security-admin.log',
  lastBoundaryTest: '2023-11-11T11:30:00.000Z',
  boundaryTestStatus: 'passed',
  overallSecurityHealth: 'healthy',
  isolationEffectiveness: 90,
  performanceImpact: 3,
  securityViolations: [
    {
      event_type: 'domain_blocked',
      timestamp: FIXED_TIMESTAMP - 3600000,
      details: { domain: 'suspicious-site.com', reason: 'Domain not in allowlist' },
      user: 'system',
      session_id: 'sess-001'
    },
    {
      event_type: 'policy_validation_failed',
      timestamp: FIXED_TIMESTAMP - 7200000,
      details: { section: 'security.profiles', error: 'Invalid profile definition' },
      user: 'admin',
      session_id: 'sess-002'
    }
  ],
  trendData: [
    {
      timestamp: FIXED_TIMESTAMP - 86400000, // 24 hours ago
      violations: 0,
      effectiveness: 95
    },
    {
      timestamp: FIXED_TIMESTAMP - 43200000, // 12 hours ago
      violations: 1,
      effectiveness: 93
    },
    {
      timestamp: FIXED_TIMESTAMP,
      violations: 2,
      effectiveness: 90
    }
  ]
};

export const EXPECTED_SECURITY_SECTION_SNAPSHOT = `## 🔒 Security Overview

*Last updated: 2023-11-11T12:00:00.000Z*

### Security Health: 🟢 HEALTHY

✅ **Security posture is healthy**

### Security Metrics

| Metric | Value | Status |
|--------|-------|--------|
| **Policy Valid** | ✅ Valid | 🟢 |
| **Current Profile** | standard | 🟡 |
| **Allowed Domains** | 3 | 🟢 |
| **Recent Violations** | 2 (24h) | 🟡 |
| **Isolation Effectiveness** | 90% | 🟢 |
| **Performance Impact** | 3% | 🟢 |
| **Boundary Test Status** | passed | 🟢 |

### Security Controls Status

- **Security Policy:** ✅ Valid (\`policy.json\`)
- **Domain Allowlist:** ✅ Active (3 domains)
- **Boundary Testing:** ✅ Passed (Last: 1 hour ago)

### Recent Security Violations

- **domain_blocked** - 1 hour ago | Domain not in allowlist
- **policy_validation_failed** - 2 hours ago | Invalid profile definition

### Security Trends

- **Nov 11, 2023:** 2 violations, 90% effectiveness 🟡
- **Nov 11, 2023:** 1 violations, 93% effectiveness 🟡
- **Nov 10, 2023:** 0 violations, 95% effectiveness 🟢

### Security Recommendations

⚠️ **Elevated violations:** 2 violations - review security logs

### Security Information

- **Security Policy:** [\`../policy/policy.json\`](../lib/maf/policy/policy.json)
- **Domain Allowlist:** [\`../security/domain-allowlist.json\`](../lib/maf/security/domain-allowlist.json)
- **Audit Log:** [\`../logs/security-admin.log\`](../runtime/logs/security-admin.log)
- **Security Admin:** \`./scripts/maf/security-admin.sh\`
`;
