// ABOUTME: Network security manager for MAF system operations
// ABOUTME: Provides application-level network filtering and security controls

export interface NetworkSecurityPolicy {
  blockedPorts: number[];
  allowedDomains: string[];
  rateLimits: Record<string, number>;
  dnsValidation: boolean;
  monitoringEnabled: boolean;
  maxConnectionsPerMinute: number;
}

export interface NetworkOperation {
  id: string;
  type: 'quota_check' | 'heartbeat' | 'api_call' | 'build_process' | 'database_query';
  domain: string;
  port: number;
  data?: any;
  timestamp: number;
  priority: 'high' | 'medium' | 'low';
}

export interface NetworkResponse {
  success: boolean;
  data?: any;
  error?: string;
  blocked: boolean;
  reason?: string;
  responseTime: number;
}

export interface RateLimitTracker {
  windowStart: number;
  requestCount: number;
  lastRequestTime: number;
}

export class MAFNetworkSecurityManager {
  private readonly config: NetworkSecurityPolicy;
  private readonly rateLimitTrackers = new Map<string, RateLimitTracker>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly securityEvents: Array<{
    timestamp: number;
    type: 'blocked' | 'allowed' | 'rate_limit_exceeded';
    operation: NetworkOperation;
    reason: string;
  }> = [];

  constructor(config?: Partial<NetworkSecurityPolicy>) {
    this.config = {
      blockedPorts: [22, 5432, 3306, 6379, 11211, 25, 53], // SSH, DB, Redis, Memcached, SMTP, DNS
      allowedDomains: [
        'localhost',
        '127.0.0.1',
        'api.quota-management.internal',
        'registry.npmjs.org',
        'github.com',
        'api.github.com',
        'cdn.jsdelivr.net',
        'unpkg.com'
      ],
      rateLimits: {
        default: 10,
        quota_check: 5,
        heartbeat: 60, // High frequency for heartbeats
        api_call: 20,
        build_process: 30,
        database_query: 100
      },
      dnsValidation: true,
      monitoringEnabled: true,
      maxConnectionsPerMinute: 100,
      ...config
    };

    // Clean up old rate limit entries every minute
    this.cleanupTimer = setInterval(() => this.cleanupRateLimitEntries(), 60000);
    if (this.cleanupTimer && typeof (this.cleanupTimer as any).unref === 'function') {
      (this.cleanupTimer as any).unref();
    }
  }

  async secureBackpressureOperation(operation: NetworkOperation): Promise<NetworkResponse> {
    const startTime = Date.now();
    
    try {
      // Validate operation against security policy
      const validationResult = this.validateOperation(operation);
      
      if (!validationResult.valid) {
        await this.logSecurityEvent('blocked', operation, validationResult.reason!);
        
        return {
          success: false,
          blocked: true,
          reason: validationResult.reason,
          responseTime: Date.now() - startTime
        };
      }

      // Execute operation through secure channel
      const response = await this.executeSecureOperation(operation);
      
      await this.logSecurityEvent('allowed', operation, 'Operation completed successfully');
      
      return {
        success: true,
        data: response,
        blocked: false,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      await this.logSecurityEvent('blocked', operation, error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        blocked: true,
        reason: error instanceof Error ? error.message : 'Operation failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  private validateOperation(operation: NetworkOperation): { valid: boolean; reason?: string } {
    // Port validation
    if (this.config.blockedPorts.includes(operation.port)) {
      return { valid: false, reason: `Blocked port: ${operation.port}` };
    }

    // Domain validation
    if (!this.isValidDomain(operation.domain)) {
      return { valid: false, reason: `Blocked domain: ${operation.domain}` };
    }

    // Rate limiting validation
    if (!this.checkRateLimit(operation)) {
      return { valid: false, reason: 'Rate limit exceeded' };
    }

    // Connection frequency validation
    if (!this.checkConnectionFrequency(operation.domain)) {
      return { valid: false, reason: 'Connection frequency exceeded' };
    }

    // Operation-specific validation
    if (!this.validateOperationType(operation)) {
      return { valid: false, reason: 'Invalid operation type or parameters' };
    }

    return { valid: true };
  }

  private isValidDomain(domain: string): boolean {
    // Check against allowlist
    if (this.config.allowedDomains.includes(domain)) {
      return true;
    }

    // Check for wildcard patterns
    const wildcardPatterns = this.config.allowedDomains.filter(d => d.includes('*'));
    for (const pattern of wildcardPatterns) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(domain)) {
        return true;
      }
    }

    // Local network validation
    if (domain.startsWith('192.168.') || 
        domain.startsWith('10.') || 
        domain.startsWith('172.') ||
        domain === 'localhost' ||
        domain === '127.0.0.1') {
      return true;
    }

    return false;
  }

  private checkRateLimit(operation: NetworkOperation): boolean {
    const key = `${operation.type}:${operation.domain}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxRequests = this.config.rateLimits[operation.type] || this.config.rateLimits.default;

    let tracker = this.rateLimitTrackers.get(key);
    
    if (!tracker || (now - tracker.windowStart) > windowMs) {
      // Start new window
      tracker = {
        windowStart: now,
        requestCount: 1,
        lastRequestTime: now
      };
      this.rateLimitTrackers.set(key, tracker);
      return true;
    }

    // Check if within rate limit
    if (tracker.requestCount >= maxRequests) {
      return false;
    }

    // Update tracker
    tracker.requestCount++;
    tracker.lastRequestTime = now;
    return true;
  }

  private checkConnectionFrequency(domain: string): boolean {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const key = `frequency:${domain}`;

    const tracker = this.rateLimitTrackers.get(key);
    if (!tracker) {
      this.rateLimitTrackers.set(key, {
        windowStart: now,
        requestCount: 1,
        lastRequestTime: now
      });
      return true;
    }

    if ((now - tracker.windowStart) > windowMs) {
      // Reset window
      tracker.windowStart = now;
      tracker.requestCount = 1;
      return true;
    }

    if (tracker.requestCount >= this.config.maxConnectionsPerMinute) {
      return false;
    }

    tracker.requestCount++;
    tracker.lastRequestTime = now;
    return true;
  }

  private validateOperationType(operation: NetworkOperation): boolean {
    switch (operation.type) {
      case 'quota_check':
        return this.validateQuotaCheckOperation(operation);
      case 'heartbeat':
        return this.validateHeartbeatOperation(operation);
      case 'api_call':
        return this.validateApiCallOperation(operation);
      case 'build_process':
        return this.validateBuildProcessOperation(operation);
      case 'database_query':
        return this.validateDatabaseQueryOperation(operation);
      default:
        return false;
    }
  }

  private validateQuotaCheckOperation(operation: NetworkOperation): boolean {
    // Quota checks should be to internal domains only
    return operation.domain.includes('quota-management.internal') || 
           operation.domain === 'localhost';
  }

  private validateHeartbeatOperation(operation: NetworkOperation): boolean {
    // Heartbeats should be internal only
    return operation.domain === 'localhost' || 
           operation.domain === '127.0.0.1' ||
           operation.domain.includes('internal');
  }

  private validateApiCallOperation(operation: NetworkOperation): boolean {
    // API calls to external services require HTTPS
    return operation.port === 443 || operation.port === 8443;
  }

  private validateBuildProcessOperation(operation: NetworkOperation): boolean {
    // Build process can access npm registry and GitHub
    return operation.domain.includes('npmjs.org') || 
           operation.domain.includes('github.com') ||
           operation.domain.includes('jsdelivr.net') ||
           operation.domain.includes('unpkg.com');
  }

  private validateDatabaseQueryOperation(operation: NetworkOperation): boolean {
    // Database queries should be local only
    return operation.domain === 'localhost' || 
           operation.domain === '127.0.0.1';
  }

  private async executeSecureOperation(operation: NetworkOperation): Promise<any> {
    // This is where the actual network operation would be executed
    // For now, we'll simulate the operation based on type
    
    switch (operation.type) {
      case 'quota_check':
        return this.simulateQuotaCheck(operation);
      case 'heartbeat':
        return this.simulateHeartbeat(operation);
      case 'api_call':
        return this.simulateApiCall(operation);
      case 'build_process':
        return this.simulateBuildProcess(operation);
      case 'database_query':
        return this.simulateDatabaseQuery(operation);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  private async simulateQuotaCheck(operation: NetworkOperation): Promise<any> {
    // Simulate quota check response
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      status: 'ok',
      quotaUsed: 45,
      quotaLimit: 100,
      resetTime: Date.now() + 86400000
    };
  }

  private async simulateHeartbeat(operation: NetworkOperation): Promise<any> {
    // Simulate heartbeat response
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      status: 'alive',
      timestamp: Date.now(),
      agentId: operation.data?.agentId || 'unknown'
    };
  }

  private async simulateApiCall(operation: NetworkOperation): Promise<any> {
    // Simulate API call response
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      data: { message: 'API call successful' },
      status: 200
    };
  }

  private async simulateBuildProcess(operation: NetworkOperation): Promise<any> {
    // Simulate build process response
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      buildId: `build_${Date.now()}`,
      status: 'completed'
    };
  }

  private async simulateDatabaseQuery(operation: NetworkOperation): Promise<any> {
    // Simulate database query response
    await new Promise(resolve => setTimeout(resolve, 30));
    return {
      rows: [],
      rowCount: 0
    };
  }

  private async logSecurityEvent(
    type: 'blocked' | 'allowed' | 'rate_limit_exceeded',
    operation: NetworkOperation,
    reason: string
  ): Promise<void> {
    if (!this.config.monitoringEnabled) return;

    this.securityEvents.push({
      timestamp: Date.now(),
      type,
      operation,
      reason
    });

    // Keep event log manageable
    if (this.securityEvents.length > 1000) {
      this.securityEvents.splice(0, 500);
    }
  }

  private cleanupRateLimitEntries(): void {
    const now = Date.now();
    const windowMs = 60000;
    
    for (const [key, tracker] of this.rateLimitTrackers.entries()) {
      if ((now - tracker.windowStart) > windowMs) {
        this.rateLimitTrackers.delete(key);
      }
    }
  }

  getSecurityReport(): {
    totalEvents: number;
    blockedEvents: number;
    allowedEvents: number;
    rateLimitEvents: number;
    topBlockedDomains: Array<{ domain: string; count: number }>;
    averageResponseTime: number;
  } {
    const totalEvents = this.securityEvents.length;
    const blockedEvents = this.securityEvents.filter(e => e.type === 'blocked').length;
    const allowedEvents = this.securityEvents.filter(e => e.type === 'allowed').length;
    const rateLimitEvents = this.securityEvents.filter(e => e.type === 'rate_limit_exceeded').length;

    const blockedDomains = new Map<string, number>();
    for (const event of this.securityEvents.filter(e => e.type === 'blocked')) {
      const domain = event.operation.domain;
      blockedDomains.set(domain, (blockedDomains.get(domain) || 0) + 1);
    }

    const topBlockedDomains = Array.from(blockedDomains.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate average response time from recent operations
    const recentOps = this.securityEvents.slice(-100);
    const avgResponseTime = recentOps.length > 0 ? 50 : 0; // Simulated response time

    return {
      totalEvents,
      blockedEvents,
      allowedEvents,
      rateLimitEvents,
      topBlockedDomains,
      averageResponseTime: avgResponseTime
    };
  }

  async updateSecurityPolicy(newPolicy: Partial<NetworkSecurityPolicy>): Promise<void> {
    Object.assign(this.config, newPolicy);
  }

  getActiveConnections(): Array<{
    domain: string;
    requestCount: number;
    windowStart: number;
    lastRequest: number;
  }> {
    return Array.from(this.rateLimitTrackers.entries()).map(([key, tracker]) => {
      const [type, domain] = key.split(':');
      return {
        domain: domain || type,
        requestCount: tracker.requestCount,
        windowStart: tracker.windowStart,
        lastRequest: tracker.lastRequestTime
      };
    });
  }

  async emergencyShutdown(): Promise<void> {
    this.rateLimitTrackers.clear();
    this.securityEvents.length = 0;
  }
}
