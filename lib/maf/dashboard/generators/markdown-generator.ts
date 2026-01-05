// ABOUTME: Markdown generation utilities for MAF dashboard
// ABOUTME: Provides utilities for generating consistent markdown with relative evidence linking

export interface MarkdownSection {
  title: string;
  content: string;
  order: number;
}

export interface DashboardMetadata {
  generatedAt: number;
  version: string;
  source: string;
  mafPath: string;
}

/**
 * Generate complete dashboard markdown from sections
 */
export function generateDashboardMarkdown(
  sections: MarkdownSection[],
  metadata: DashboardMetadata
): string {
  const lines: string[] = [];

  // Header
  lines.push('# MAF Dashboard Overview');
  lines.push('');
  lines.push('*Generated on ' + new Date(metadata.generatedAt).toISOString() + '*');
  lines.push('*Source: ' + metadata.source + ' v' + metadata.version + '*');
  lines.push('*MAF Path: ' + metadata.mafPath + '*');
  lines.push('');

  // Table of contents
  lines.push('## Table of Contents');
  lines.push('');
  
  for (const section of sections.sort((a, b) => a.order - b.order)) {
    const anchor = generateAnchor(section.title);
    lines.push('- [' + section.title + '](#' + anchor + ')');
  }
  
  lines.push('');

  // Sections
  for (const section of sections.sort((a, b) => a.order - b.order)) {
    lines.push(section.content);
    lines.push('---');
    lines.push('');
  }

  // Footer
  lines.push('## Footer');
  lines.push('');
  lines.push('*This dashboard is generated automatically by the MAF dashboard system.*');
  lines.push('*For detailed evidence and logs, see the links in each section.*');
  lines.push('');
  lines.push('*Dashboard generated at: ' + new Date(metadata.generatedAt).toISOString() + '*');

  return lines.join('\n');
}

/**
 * Generate GitHub-style anchor from title
 */
export function generateAnchor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate relative path to evidence file
 */
export function generateEvidenceLink(targetPath: string, basePath: string = '.maf'): string {
  // Normalize paths
  const normalizedTarget = targetPath.replace(/^\.?\/?maf\/?/, '');
  const normalizedBase = basePath.replace(/^\.?\/?maf\/?/, '');
  
  // Generate relative path from .maf/reports/overview.md to target
  const reportsDepth = 2; // .maf/reports/ is 2 levels deep from .maf/
  const upPath = '../'.repeat(reportsDepth);
  
  return upPath + normalizedTarget;
}

/**
 * Generate file size badge
 */
export function generateFileSizeBadge(sizeBytes: number): string {
  const size = formatBytes(sizeBytes);
  let color = 'blue';
  
  if (sizeBytes > 1024 * 1024 * 10) { // > 10MB
    color = 'red';
  } else if (sizeBytes > 1024 * 1024) { // > 1MB
    color = 'orange';
  } else if (sizeBytes > 1024 * 100) { // > 100KB
    color = 'yellow';
  }
  
  return '![' + size + '](https://img.shields.io/badge/size-' + encodeURIComponent(size) + '-' + color + ')';
}

/**
 * Generate status badge
 */
export function generateStatusBadge(status: string, text?: string): string {
  const statusText = text || status;
  let color = 'blue';
  
  switch (status.toLowerCase()) {
    case 'pass':
    case 'success':
    case 'completed':
    case 'healthy':
      color = 'green';
      break;
    case 'fail':
    case 'error':
    case 'critical':
      color = 'red';
      break;
    case 'warning':
    case 'degraded':
      color = 'yellow';
      break;
    case 'pending':
    case 'running':
      color = 'blue';
      break;
    case 'idle':
      color = 'lightgrey';
      break;
  }
  
  return '![' + statusText + '](https://img.shields.io/badge/status-' + encodeURIComponent(statusText) + '-' + color + ')';
}

/**
 * Generate timestamp badge
 */
export function generateTimestampBadge(timestamp: number): string {
  const date = new Date(timestamp);
  const iso = date.toISOString();
  const relative = formatRelativeTime(timestamp);
  
  return '![' + relative + '](https://img.shields.io/badge/updated-' + encodeURIComponent(relative) + '-blue)';
}

/**
 * Generate progress bar
 */
export function generateProgressBar(current: number, total: number, width: number = 20): string {
  if (total === 0) return '`[          ]`';
  
  const percentage = (current / total) * 100;
  const filled = Math.round((width * current) / total);
  const empty = width - filled;
  
  const bar = '`[' + '█'.repeat(filled) + ' '.repeat(empty) + ']`';
  const percentageText = ' ' + percentage.toFixed(1) + '%';
  
  return bar + percentageText;
}

/**
 * Generate collapsible section
 */
export function generateCollapsible(summary: string, content: string): string {
  return [
    '<details><summary>' + summary + '</summary>',
    '',
    content,
    '',
    '</details>'
  ].join('\n');
}

/**
 * Generate code block with language detection
 */
export function generateCodeBlock(content: string, language?: string): string {
  const lang = language || detectLanguage(content);
  return '```' + lang + '\n' + content + '\n```';
}

/**
 * Detect language from content
 */
function detectLanguage(content: string): string {
  const trimmed = content.trim();
  
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  
  if (trimmed.includes('SELECT ') || trimmed.includes('INSERT ') || trimmed.includes('UPDATE ')) {
    return 'sql';
  }
  
  if (trimmed.includes('function ') || trimmed.includes('const ') || trimmed.includes('let ')) {
    return 'javascript';
  }
  
  if (trimmed.includes('def ') || trimmed.includes('import ')) {
    return 'python';
  }
  
  return 'text';
}

/**
 * Generate table from data
 */
export function generateTable(headers: string[], rows: string[][]): string {
  const lines: string[] = [];
  
  // Header
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('|' + headers.map(() => '--------').join('|') + '|');
  
  // Rows
  for (const row of rows) {
    lines.push('| ' + row.join(' | ') + ' |');
  }
  
  return lines.join('\n');
}

/**
 * Escape markdown special characters
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

/**
 * Format bytes for human readability
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format relative time for human readability
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) { // Less than 1 minute
    return 'just now';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return minutes + 'm ago';
  } else if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return hours + 'h ago';
  } else {
    const days = Math.floor(diff / 86400000);
    return days + 'd ago';
  }
}

/**
 * Generate dashboard summary metrics
 */
export function generateSummaryMetrics(data: {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalEvents: number;
  systemHealth: string;
}): string {
  const lines: string[] = [];
  
  lines.push('### Quick Summary');
  lines.push('');
  lines.push('| Metric | Value | Status |');
  lines.push('|--------|-------|--------|');
  
  lines.push('| **Tasks** | ' + data.totalTasks + ' | ' + generateStatusBadge('total') + ' |');
  lines.push('| **Active** | ' + data.activeTasks + ' | ' + generateStatusBadge(data.activeTasks > 0 ? 'running' : 'idle') + ' |');
  lines.push('| **Completed** | ' + data.completedTasks + ' | ' + generateStatusBadge('success') + ' |');
  lines.push('| **Failed** | ' + data.failedTasks + ' | ' + generateStatusBadge(data.failedTasks > 0 ? 'warning' : 'success') + ' |');
  lines.push('| **Events** | ' + data.totalEvents + ' | ' + generateStatusBadge('info') + ' |');
  lines.push('| **Health** | ' + data.systemHealth + ' | ' + generateStatusBadge(data.systemHealth) + ' |');
  
  return lines.join('\n');
}
