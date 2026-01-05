// ABOUTME: Network security monitoring and alerting system for MAF
// ABOUTME: Provides real-time security event monitoring and reporting

import type { MafEventLogger } from '../events/event-logger';

export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: 'connection_blocked' | 'rate_limit_exceeded' | 'dns_blocked' | 'sql_injection_attempt' | 'unauthorized_access';
  severity: 'info' | 'warning' | 'critical';
  sourceIp: string;
  targetPort?: number;
  domain?: string;
  agentId?: string;
  action: 'allowed' | 'blocked';
  reason: string;
  metadata?: Record<string, any>;
}

export interface NetworkSecurityReport {
  totalEvents: number;
  blockedConnections: number;
  criticalEvents: number;
  topBlockedIPs: Array<{ ip: string; count: number }>;
  topTargetedPorts: Array<{ port: number; count: number }>;
  securityScore: number; // 0-100
  timeRange: {
    start: number;
    end: number;
  };
  alerts: Array<{
    type: string;
    count: number;
    severity: string;
    lastOccurrence: number;
  }>;
}

export interface SecurityAlert {
  id: string;
  timestamp: number;
  type: 'security_breach' | 'anomaly_detected' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  affectedSystems: string[];
  recommendedActions: string[];
  autoResolve: boolean;
}

export class NetworkSecurityMonitor {
  private eventLogger: MafEventLogger;
  private securityEvents: SecurityEvent[] = [];
  private activeAlerts = new Map<string, SecurityAlert>();
  private alertThresholds = {
    criticalEventsPerHour: 5,
    blockedConnectionsPerMinute: 10,
    suspiciousPatternsPerHour: 20
  };

  constructor(eventLogger: MafEventLogger) {
    this.eventLogger = eventLogger;
    
    // Start periodic analysis
    setInterval(() => this.analyzeSecurityPatterns(), 60000); // Every minute
    setInterval(() => this.checkAlertThresholds(), 300000); // Every 5 minutes
  }

  async logNetworkSecurityEvent(event: Omit<SecurityEvent, 'id'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      ...event
    };

    this.securityEvents.push(securityEvent);

    // Log to MAF event system using security violation method
    // Map severity levels: warning -> medium, info -> low, critical -> critical
    const mappedSeverity = securityEvent.severity === 'warning' ? 'medium' :
                          securityEvent.severity === 'info' ? 'low' : 'critical';

    await this.eventLogger.logSecurityViolation({
      violation_type: 'network_access' as any, // Type mismatch with interface but conceptually correct
      severity: mappedSeverity,
      action_taken: securityEvent.action === 'blocked' ? 'blocked' as const :
                   securityEvent.action === 'allowed' ? 'allowed' as const : 'logged' as const,
      security_profile: {
        name: 'network_security_monitor',
        enforcement_mode: 'strict' as const
      },
      timestamp: securityEvent.timestamp,
      task_id: 'network_security_monitor',
      threat_context: {
        ip_address: securityEvent.sourceIp,
        domain: undefined,
        file_path: undefined,
        process_name: undefined
      }
    });

    // Real-time alerting for critical events
    if (securityEvent.severity === 'critical') {
      await this.triggerSecurityAlert(securityEvent);
    }

    // Keep event history manageable
    if (this.securityEvents.length > 10000) {
      this.securityEvents.splice(0, 5000);
    }
  }

  private async triggerSecurityAlert(event: SecurityEvent): Promise<void> {
    const alert: SecurityAlert = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type: 'security_breach',
      severity: event.severity === 'critical' ? 'critical' : 'high',
      message: 'Critical security event: ' + event.type + ' from ' + event.sourceIp,
      affectedSystems: ['network', 'database', 'backpressure'],
      recommendedActions: this.getRecommendedActions(event),
      autoResolve: false
    };

    this.activeAlerts.set(alert.id, alert);

    // Log alert to event system using security violation method
    await this.eventLogger.logSecurityViolation({
      violation_type: 'security_alert' as any,
      severity: alert.severity, // Alert severity should already match the expected type
      action_taken: 'logged' as const,
      security_profile: {
        name: 'network_security_monitor',
        enforcement_mode: 'strict' as const
      },
      timestamp: alert.timestamp,
      task_id: 'security_alert_' + alert.id
    });

    console.error('🚨 SECURITY ALERT: ' + alert.message, {
      alertId: alert.id,
      sourceIp: event.sourceIp,
      reason: event.reason
    });
  }

  private getRecommendedActions(event: SecurityEvent): string[] {
    const actions: string[] = [];

    switch (event.type) {
      case 'connection_blocked':
        actions.push('Review blocked connection logs');
        actions.push('Consider permanent IP block if repeated');
        break;
      case 'rate_limit_exceeded':
        actions.push('Monitor for DDoS patterns');
        actions.push('Consider adjusting rate limits');
        break;
      case 'sql_injection_attempt':
        actions.push('Immediate IP blocking recommended');
        actions.push('Review application input validation');
        actions.push('Check for compromised credentials');
        break;
      case 'unauthorized_access':
        actions.push('Review access controls');
        actions.push('Check authentication system');
        actions.push('Audit user permissions');
        break;
    }

    return actions;
  }

  private async analyzeSecurityPatterns(): Promise<void> {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentEvents = this.securityEvents.filter(e => e.timestamp > oneHourAgo);

    // Detect suspicious patterns
    await this.detectBruteForcePatterns(recentEvents);
    await this.detectPortScanningPatterns(recentEvents);
    await this.detectAnomalousAccessPatterns(recentEvents);
  }

  private async detectBruteForcePatterns(events: SecurityEvent[]): Promise<void> {
    // Group events by source IP
    const ipEvents = new Map<string, SecurityEvent[]>();
    
    for (const event of events) {
      const existingEvents = ipEvents.get(event.sourceIp) || [];
      existingEvents.push(event);
      ipEvents.set(event.sourceIp, existingEvents);
    }

    // Look for IPs with many blocked connections
    for (const [ip, ipSecurityEvents] of ipEvents.entries()) {
      const blockedEvents = ipSecurityEvents.filter(e => 
        e.type === 'connection_blocked' || e.type === 'unauthorized_access'
      );

      if (blockedEvents.length >= 10) {
        await this.logNetworkSecurityEvent({
          timestamp: Date.now(),
          type: 'connection_blocked',
          severity: 'warning',
          sourceIp: ip,
          action: 'blocked',
          reason: 'Potential brute force attack detected',
          metadata: {
            blockedAttempts: blockedEvents.length,
            timeWindow: '1 hour'
          }
        });
      }
    }
  }

  private async detectPortScanningPatterns(events: SecurityEvent[]): Promise<void> {
    // Group by source IP and look for multiple target ports
    const ipPorts = new Map<string, Set<number>>();
    
    for (const event of events) {
      if (event.targetPort) {
        const ports = ipPorts.get(event.sourceIp) || new Set();
        ports.add(event.targetPort);
        ipPorts.set(event.sourceIp, ports);
      }
    }

    // Look for IPs accessing many different ports
    for (const [ip, ports] of ipPorts.entries()) {
      if (ports.size >= 5) {
        await this.logNetworkSecurityEvent({
          timestamp: Date.now(),
          type: 'connection_blocked',
          severity: 'warning',
          sourceIp: ip,
          action: 'blocked',
          reason: 'Potential port scanning detected',
          metadata: {
            portsScanned: Array.from(ports),
            timeWindow: '1 hour'
          }
        });
      }
    }
  }

  private async detectAnomalousAccessPatterns(events: SecurityEvent[]): Promise<void> {
    // Look for unusual access times or patterns
    const hourlyDistribution = new Map<number, number>(); // hour -> count
    
    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      hourlyDistribution.set(hour, (hourlyDistribution.get(hour) || 0) + 1);
    }

    // Check for unusual activity during off-hours (e.g., 2 AM - 5 AM)
    const offHoursActivity = events.filter(e => {
      const hour = new Date(e.timestamp).getHours();
      return hour >= 2 && hour <= 5;
    });

    if (offHoursActivity.length > 20) {
      await this.logNetworkSecurityEvent({
        timestamp: Date.now(),
        type: 'unauthorized_access',
        severity: 'warning',
        sourceIp: 'multiple',
        action: 'allowed',
        reason: 'Unusual off-hours activity detected',
        metadata: {
          offHoursEvents: offHoursActivity.length,
          timeWindow: '1 hour'
        }
      });
    }
  }

  private async checkAlertThresholds(): Promise<void> {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentEvents = this.securityEvents.filter(e => e.timestamp > oneHourAgo);

    // Check critical events threshold
    const criticalEvents = recentEvents.filter(e => e.severity === 'critical');
    if (criticalEvents.length >= this.alertThresholds.criticalEventsPerHour) {
      await this.triggerSystemAlert('critical_events', 'High number of critical security events detected');
    }

    // Check blocked connections threshold
    const blockedConnections = recentEvents.filter(e => e.type === 'connection_blocked');
    if (blockedConnections.length >= this.alertThresholds.blockedConnectionsPerMinute) {
      await this.triggerSystemAlert('blocked_connections', 'High number of blocked connections detected');
    }

    // Check suspicious patterns threshold
    const suspiciousEvents = recentEvents.filter(e => 
      e.type === 'sql_injection_attempt' || 
      e.type === 'unauthorized_access' ||
      e.type === 'dns_blocked'
    );
    if (suspiciousEvents.length >= this.alertThresholds.suspiciousPatternsPerHour) {
      await this.triggerSystemAlert('suspicious_patterns', 'Suspicious security patterns detected');
    }
  }

  private async triggerSystemAlert(type: string, message: string): Promise<void> {
    const alert: SecurityAlert = {
      id: 'system_' + type + '_' + Date.now(),
      timestamp: Date.now(),
      type: 'anomaly_detected',
      severity: 'high',
      message,
      affectedSystems: ['network', 'security'],
      recommendedActions: [
        'Review security event logs',
        'Check system integrity',
        'Consider increased monitoring'
      ],
      autoResolve: false
    };

    this.activeAlerts.set(alert.id, alert);
  }

  async generateSecurityReport(timeRangeMs: number = 86400000): Promise<NetworkSecurityReport> {
    const now = Date.now();
    const startTime = now - timeRangeMs;
    const relevantEvents = this.securityEvents.filter(e => e.timestamp >= startTime);

    const totalEvents = relevantEvents.length;
    const blockedConnections = relevantEvents.filter(e => 
      e.type === 'connection_blocked' && e.action === 'blocked'
    ).length;
    const criticalEvents = relevantEvents.filter(e => e.severity === 'critical').length;

    // Calculate top blocked IPs
    const ipCounts = new Map<string, number>();
    for (const event of relevantEvents.filter(e => e.action === 'blocked')) {
      ipCounts.set(event.sourceIp, (ipCounts.get(event.sourceIp) || 0) + 1);
    }

    const topBlockedIPs = Array.from(ipCounts.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate top targeted ports
    const portCounts = new Map<number, number>();
    for (const event of relevantEvents) {
      if (event.targetPort) {
        portCounts.set(event.targetPort, (portCounts.get(event.targetPort) || 0) + 1);
      }
    }

    const topTargetedPorts = Array.from(portCounts.entries())
      .map(([port, count]) => ({ port, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate security score
    const securityScore = this.calculateSecurityScore(relevantEvents);

    // Generate alert summary
    const alertCounts = new Map<string, { count: number; severity: string; lastOccurrence: number }>();
    for (const event of relevantEvents.filter(e => e.severity === 'critical')) {
      const key = event.type;
      const existing = alertCounts.get(key) || { count: 0, severity: event.severity, lastOccurrence: 0 };
      existing.count++;
      existing.lastOccurrence = Math.max(existing.lastOccurrence, event.timestamp);
      alertCounts.set(key, existing);
    }

    const alerts = Array.from(alertCounts.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      severity: data.severity,
      lastOccurrence: data.lastOccurrence
    }));

    return {
      totalEvents,
      blockedConnections,
      criticalEvents,
      topBlockedIPs,
      topTargetedPorts,
      securityScore,
      timeRange: {
        start: startTime,
        end: now
      },
      alerts
    };
  }

  private calculateSecurityScore(events: SecurityEvent[]): number {
    if (events.length === 0) return 100;

    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    const blockedConnections = events.filter(e => e.action === 'blocked').length;
    const totalEvents = events.length;

    // Base score starts at 100
    let score = 100;

    // Deduct points for critical events
    score -= criticalEvents * 20;

    // Deduct points for blocked connections
    score -= Math.min(blockedConnections * 2, 30);

    // Bonus for having monitoring in place
    score += 5;

    return Math.max(0, Math.min(100, score));
  }

  getActiveAlerts(): SecurityAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  async resolveAlert(alertId: string): Promise<void> {
    this.activeAlerts.delete(alertId);
    
    // Log resolution to event system using security violation method
    await this.eventLogger.logSecurityViolation({
      violation_type: 'alert_resolved' as any,
      severity: 'low', // info maps to low for security violations
      action_taken: 'logged' as const,
      security_profile: {
        name: 'network_security_monitor',
        enforcement_mode: 'strict' as const
      },
      timestamp: Date.now(),
      task_id: 'alert_resolved_' + alertId
    });
  }

  async updateAlertThresholds(newThresholds: Partial<typeof this.alertThresholds>): Promise<void> {
    Object.assign(this.alertThresholds, newThresholds);
  }

  getEventHistory(limit: number = 1000): SecurityEvent[] {
    return this.securityEvents.slice(-limit);
  }

  getEventsByType(type: SecurityEvent['type'], limit: number = 100): SecurityEvent[] {
    return this.securityEvents
      .filter(e => e.type === type)
      .slice(-limit);
  }

  async emergencyClear(): Promise<void> {
    this.securityEvents.length = 0;
    this.activeAlerts.clear();
  }
}
