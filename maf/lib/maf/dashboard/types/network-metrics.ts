// ABOUTME: Network metrics type definitions for MAF dashboard advanced monitoring
// ABOUTME: Defines interfaces for connection state, bandwidth utilization, traffic patterns, and protocol analysis

export interface NetworkConnectionState {
  id: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: 'established' | 'listening' | 'time_wait' | 'close_wait' | 'closed';
  processId?: number;
  processName?: string;
  userId?: number;
  timestamp: number;
  duration: number;
  bytesTransmitted: number;
  bytesReceived: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface BandwidthUtilization {
  timestamp: number;
  interfaceName: string;
  bytesInPerSecond: number;
  bytesOutPerSecond: number;
  packetsInPerSecond: number;
  packetsOutPerSecond: number;
  totalBandwidth: number;
  utilizationPercentage: number;
  rateLimitStatus: 'within_limits' | 'approaching_limits' | 'exceeded';
  connectionCount: number;
  activeConnections: number;
  peakUtilization: number;
  averageUtilization: number;
}

export interface TrafficPattern {
  id: string;
  timestamp: number;
  sourceIp: string;
  destinationIp: string;
  sourcePort: number;
  destinationPort: number;
  protocol: string;
  packetSize: number;
  flags: string[];
  direction: 'inbound' | 'outbound';
  anomalyScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  behavioralPattern: 'normal' | 'suspicious' | 'malicious' | 'anomalous';
  confidence: number;
  metadata: {
    [key: string]: string | number | boolean;
  };
}

export interface ProtocolAnalysis {
  protocol: string;
  layer: 'application' | 'transport' | 'network' | 'link';
  timestamp: number;
  threatDetection: {
    signatureMatches: string[];
    attackPatterns: string[];
    suspiciousActivity: string[];
  };
  inspectionResults: {
    complianceStatus: 'compliant' | 'violating' | 'suspicious';
    policyViolations: string[];
    securityFlags: string[];
  };
  performanceMetrics: {
    processingTime: number;
    resourceUsage: number;
    analysisDepth: 'basic' | 'standard' | 'deep';
    contextAwareLevel: number;
  };
  attackCorrelation: {
    relatedAttacks: string[];
    timelineCorrelation: number;
    attackChainPosition?: number;
  };
}

export interface ExtendedSecurityMetrics {
  // Existing security metrics
  policyValid: boolean;
  policyFile: string;
  allowlistDomains: number;
  allowlistFile: string;
  currentProfile: string;
  recentSecurityEvents: number;
  auditLog: string;
  lastBoundaryTest: string;
  boundaryTestStatus: string;
  overallSecurityHealth: 'healthy' | 'warning' | 'critical';
  isolationEffectiveness: number;
  performanceImpact: number;
  securityViolations: any[];
  trendData: any[];

  // Extended network monitoring metrics
  networkMonitoring: {
    connectionStates: NetworkConnectionState[];
    bandwidthUtilization: BandwidthUtilization;
    trafficPatterns: TrafficPattern[];
    protocolAnalysis: ProtocolAnalysis[];
    monitoringIntensity: 'low' | 'medium' | 'high' | 'adaptive';
    performanceBudget: {
      allocated: number;
      used: number;
      available: number;
      efficiency: number;
    };
    lastUpdated: number;
  };
}

export interface NetworkMonitoringExtension {
  startMonitoring(config?: NetworkMonitoringConfig): Promise<void>;
  stopMonitoring(): Promise<void>;
  getConnectionStates(filter?: ConnectionFilter): Promise<NetworkConnectionState[]>;
  getBandwidthUtilization(timeRange?: TimeRange): Promise<BandwidthUtilization[]>;
  getTrafficPatterns(filter?: TrafficFilter): Promise<TrafficPattern[]>;
  getProtocolAnalysis(protocols?: string[]): Promise<ProtocolAnalysis[]>;
  getPerformanceMetrics(): Promise<NetworkPerformanceMetrics>;
}

export interface NetworkMonitoringConfig {
  monitoringIntensity: 'low' | 'medium' | 'high' | 'adaptive';
  updateInterval: number;
  maxConnections: number;
  enableProtocolAnalysis: boolean;
  enableAnomalyDetection: boolean;
  performanceBudget: number;
  adaptiveThresholds: {
    bandwidthThreshold: number;
    connectionThreshold: number;
    anomalyThreshold: number;
  };
}

export interface ConnectionFilter {
  protocol?: string[];
  state?: string[];
  riskLevel?: string[];
  processId?: number[];
  timeRange?: TimeRange;
}

export interface TrafficFilter {
  protocol?: string[];
  riskLevel?: string[];
  direction?: string[];
  timeRange?: TimeRange;
  anomalyScore?: { min?: number; max?: number };
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface NetworkPerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskIO: number;
  networkIO: number;
  processingLatency: number;
  queueDepth: number;
  errorRate: number;
  throughput: number;
  efficiency: number;
}

export interface PerformanceBudgetManager {
  allocateBudget(component: string, budget: number): void;
  checkBudget(component: string): { allocated: number; used: number; available: number };
  adjustBudget(component: string, newBudget: number): void;
  getOverallEfficiency(): number;
  getBudgetReport(): PerformanceBudgetReport;
}

export interface PerformanceBudgetReport {
  totalBudget: number;
  allocatedBudget: number;
  usedBudget: number;
  availableBudget: number;
  efficiency: number;
  components: Array<{
    name: string;
    allocated: number;
    used: number;
    efficiency: number;
    status: 'within_budget' | 'approaching_limit' | 'exceeded';
  }>;
  recommendations: string[];
}

// Utility types for network monitoring
export type NetworkEventType =
  | 'connection_established'
  | 'connection_closed'
  | 'bandwidth_exceeded'
  | 'anomaly_detected'
  | 'protocol_violation'
  | 'threat_detected'
  | 'performance_alert';

export type NetworkAlert = {
  id: string;
  type: NetworkEventType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  source: string;
  details: Record<string, any>;
  acknowledged: boolean;
  resolved: boolean;
};

// Dashboard display types
export type NetworkDashboardConfig = {
  refreshInterval: number;
  maxDisplayedConnections: number;
  maxDisplayedPatterns: number;
  enableRealTimeUpdates: boolean;
  chartTypes: {
    bandwidthChart: 'line' | 'area' | 'bar';
    connectionChart: 'pie' | 'donut' | 'bar';
    trafficChart: 'heatmap' | 'scatter' | 'timeline';
    protocolChart: 'tree' | 'sunburst' | 'network';
  };
  filters: {
    showLowRisk: boolean;
    timeRange: TimeRange;
    protocols: string[];
  };
};