// ABOUTME: File system data collector for MAF dashboard system
// ABOUTME: Scans .maf directory structure for evidence and artifacts

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface FileSystemArtifact {
  path: string;
  type: 'log' | 'config' | 'state' | 'evidence' | 'screenshot';
  size: number;
  lastModified: number;
  relativePath: string;
  exists: boolean;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}

export interface ConfigFile {
  path: string;
  name: string;
  exists: boolean;
  content?: any;
  lastModified: number;
}

export interface StateSnapshot {
  agentId: string;
  timestamp: number;
  status: string;
  filePath: string;
  size: number;
}

/**
 * File system data collector for dashboard generation
 */
export class FileSystemCollector {
  private readonly mafPath: string;

  constructor(mafPath: string = '.maf') {
    this.mafPath = mafPath;
  }

  /**
   * Scan .maf directory for artifacts and evidence
   */
  async scanArtifacts(): Promise<FileSystemArtifact[]> {
    const artifacts: FileSystemArtifact[] = [];

    try {
      const directories = [
        'logs',
        'config',
        'state',
        'test-results',
        'monitoring',
        'cache'
      ];

      for (const dir of directories) {
        const dirPath = join(this.mafPath, dir);
        try {
          const items = await this.scanDirectory(dirPath, dir);
          artifacts.push(...items);
        } catch (error) {
          // Directory doesn't exist or is not accessible
          artifacts.push({
            path: dirPath,
            type: 'log',
            size: 0,
            lastModified: 0,
            relativePath: dir,
            exists: false
          });
        }
      }
    } catch (error) {
      console.error('Failed to scan .maf directory:', error);
    }

    return artifacts;
  }

  /**
   * Recursively scan a directory for files
   */
  private async scanDirectory(dirPath: string, baseType: string): Promise<FileSystemArtifact[]> {
    const artifacts: FileSystemArtifact[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativePath = fullPath.replace(this.mafPath + '/', '');

        if (entry.isFile()) {
          try {
            const stats = await stat(fullPath);
            const type = this.determineFileType(fullPath, baseType);

            artifacts.push({
              path: fullPath,
              type,
              size: stats.size,
              lastModified: stats.mtime.getTime(),
              relativePath,
              exists: true
            });
          } catch (error) {
            artifacts.push({
              path: fullPath,
              type: baseType as any,
              size: 0,
              lastModified: 0,
              relativePath,
              exists: false
            });
          }
        } else if (entry.isDirectory()) {
          try {
            const subItems = await this.scanDirectory(fullPath, baseType);
            artifacts.push(...subItems);
          } catch (error) {
            // Skip directories that can't be read
            continue;
          }
        }
      }
    } catch (error) {
      // Can't read directory
      return [];
    }

    return artifacts;
  }

  /**
   * Determine file type based on extension and path
   */
  private determineFileType(filePath: string, baseType: string): FileSystemArtifact['type'] {
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (ext === 'log') return 'log';
    if (ext === 'json' && filePath.includes('config')) return 'config';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'screenshot';
    if (filePath.includes('state')) return 'state';
    if (filePath.includes('evidence')) return 'evidence';

    return baseType as FileSystemArtifact['type'];
  }

  /**
   * Collect recent log entries from log files
   */
  async collectLogEntries(limit: number = 100): Promise<LogEntry[]> {
    const logEntries: LogEntry[] = [];

    try {
      const logDirs = ['logs', 'cache'];
      
      for (const logDir of logDirs) {
        const logDirPath = join(this.mafPath, logDir);
        
        try {
          const entries = await this.collectLogsFromDirectory(logDirPath, limit);
          logEntries.push(...entries);
        } catch (error) {
          // Log directory doesn't exist
          continue;
        }
      }
    } catch (error) {
      console.error('Failed to collect log entries:', error);
    }

    // Sort by timestamp (newest first) and limit
    return logEntries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Collect log entries from a specific directory
   */
  private async collectLogsFromDirectory(dirPath: string, limit: number): Promise<LogEntry[]> {
    const logEntries: LogEntry[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.log')) {
          const filePath = join(dirPath, entry.name);
          
          try {
            const content = await readFile(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              const logEntry = this.parseLogLine(line, entry.name);
              if (logEntry) {
                logEntries.push(logEntry);
              }
            }
          } catch (error) {
            // Can't read file
            continue;
          }
        }
      }
    } catch (error) {
      // Can't read directory
    }

    return logEntries;
  }

  /**
   * Parse a single log line into structured data
   */
  private parseLogLine(line: string, source: string): LogEntry | null {
    try {
      // Try to parse JSON log format
      if (line.startsWith('{') && line.endsWith('}')) {
        const jsonLog = JSON.parse(line);
        return {
          timestamp: jsonLog.timestamp || jsonLog.ts || Date.now(),
          level: jsonLog.level || jsonLog.severity || 'info',
          message: jsonLog.message || jsonLog.msg || line,
          source
        };
      }

      // Try to parse timestamp-based log format
      const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z?)/);
      if (timestampMatch) {
        const timestamp = new Date(timestampMatch[1]).getTime();
        const remaining = line.substring(timestampMatch[1].length).trim();
        
        let level: LogEntry['level'] = 'info';
        if (remaining.toLowerCase().includes('error')) level = 'error';
        else if (remaining.toLowerCase().includes('warn')) level = 'warn';
        else if (remaining.toLowerCase().includes('debug')) level = 'debug';

        return {
          timestamp,
          level,
          message: remaining,
          source
        };
      }

      // Fallback: treat as plain message
      return {
        timestamp: Date.now(),
        level: 'info',
        message: line,
        source
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Scan configuration files
   */
  async scanConfigFiles(): Promise<ConfigFile[]> {
    const configFiles: ConfigFile[] = [];

    try {
      const configDir = join(this.mafPath, 'config');
      const entries = await readdir(configDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const filePath = join(configDir, entry.name);
          
          try {
            const stats = await stat(filePath);
            const content = await readFile(filePath, 'utf8');
            
            configFiles.push({
              path: filePath,
              name: entry.name,
              exists: true,
              content: JSON.parse(content),
              lastModified: stats.mtime.getTime()
            });
          } catch (error) {
            configFiles.push({
              path: filePath,
              name: entry.name,
              exists: false,
              lastModified: 0
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to scan config files:', error);
    }

    return configFiles;
  }

  /**
   * Collect state snapshots
   */
  async collectStateSnapshots(): Promise<StateSnapshot[]> {
    const snapshots: StateSnapshot[] = [];

    try {
      const stateDir = join(this.mafPath, 'state');
      const entries = await readdir(stateDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = join(stateDir, entry.name);
          
          try {
            const stats = await stat(filePath);
            const content = await readFile(filePath, 'utf8');
            const data = JSON.parse(content);

            snapshots.push({
              agentId: data.agentId || 'unknown',
              timestamp: data.timestamp || stats.mtime.getTime(),
              status: data.status || 'unknown',
              filePath: entry.name,
              size: stats.size
            });
          } catch (error) {
            // Skip invalid state files
            continue;
          }
        }
      }
    } catch (error) {
      console.error('Failed to collect state snapshots:', error);
    }

    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get file system statistics
   */
  async getFileSystemStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
    largestFiles: Array<{ path: string; size: number; type: string }>;
  }> {
    const artifacts = await this.scanArtifacts();
    
    const filesByType: Record<string, number> = {};
    let totalSize = 0;
    const existingFiles = artifacts.filter(a => a.exists);

    for (const artifact of existingFiles) {
      filesByType[artifact.type] = (filesByType[artifact.type] || 0) + 1;
      totalSize += artifact.size;
    }

    const largestFiles = existingFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(f => ({
        path: f.relativePath,
        size: f.size,
        type: f.type
      }));

    return {
      totalFiles: existingFiles.length,
      totalSize,
      filesByType,
      largestFiles
    };
  }
}
