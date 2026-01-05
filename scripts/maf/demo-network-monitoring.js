#!/usr/bin/env node

// ABOUTME: Enhanced demonstration script for advanced network security monitoring
// Shows live traffic pattern visualization, anomaly detection, and behavioral analysis
// Integrates with NetworkMonitoringExtension interface for comprehensive monitoring

const { SecurityWrapper } = require('../lib/maf/security/wrapper');
const { extractNetworkTargets, isNetworkCommand, validateNetworkTarget } = require('../lib/maf/security/utils/network-domain-extractor');

// Try to import enhanced monitoring components
let EnhancedNetworkMonitoring;
try {
  const monitoringModule = require('../lib/maf/security/utils/network-monitoring-enhanced');
  EnhancedNetworkMonitoring = monitoringModule.EnhancedNetworkMonitoring;
} catch (error) {
  // Enhanced monitoring not available, will use fallback mode
  console.warn('Enhanced network monitoring not available, using fallback mode');
}

// Demo configuration
const monitoringProfile = {
  network: {
    outbound_allowed: true,
    allowed_hosts: ['github.com', 'registry.npmjs.org', 'api.github.com'],
    allowed_ports: [80, 443],
    dns_resolution: true,
    proxychains_mode: 'monitoring_only',
    log_all_connections: true,
    block_suspicious_patterns: true
  },
  filesystem: {
    read_allowed: ['/tmp', '/usr/bin'],
    write_allowed: ['/tmp'],
    exec_allowed: ['/usr/bin/curl', '/usr/bin/git', '/usr/bin/npm'],
    temp_dir: '/tmp/maf-${task_id}'
  },
  resources: {
    max_memory_mb: 512,
    max_cpu_percent: 50,
    max_execution_time_sec: 30,
    max_processes: 10
  },
  tools: {
    allowed_commands: ['curl', 'git', 'npm', 'echo', 'ping'],
    blocked_patterns: ['rm -rf /', 'sudo', 'chmod 777'],
    shell_access: false,
    environment_variables: {
      allowed: ['PATH', 'HOME', 'NODE_ENV'],
      blocked: ['PASSWORD', 'SECRET', 'API_KEY']
    }
  }
};

const strictProfile = {
  ...monitoringProfile,
  network: {
    ...monitoringProfile.network,
    proxychains_mode: 'strict'
  }
};

function createSecurityContext(profile, profileName, taskId) {
  return {
    profile,
    profile_name: profileName,
    task_id: taskId,
    agent_id: 'demo-agent',
    workdir: '/tmp/maf-demo',
    start_time: Date.now()
  };
}

async function demonstrateNetworkExtraction() {
  console.log('\n🔍 NETWORK DOMAIN EXTRACTION DEMO');
  console.log('=====================================');
  
  const testCommands = [
    { cmd: 'curl', args: ['-s', 'https://api.github.com/users/octocat'] },
    { cmd: 'git', args: ['clone', 'https://github.com/user/repo.git'] },
    { cmd: 'npm', args: ['install', 'lodash@4.17.21'] },
    { cmd: 'ssh', args: ['user@github.com'] },
    { cmd: 'ping', args: ['google.com'] },
    { cmd: 'wget', args: ['-O', 'file.txt', 'https://example.com/data'] },
    { cmd: 'echo', args: ['hello world'] }
  ];

  testCommands.forEach(({ cmd, args }) => {
    console.log(`\n📡 Command: ${cmd} ${args.join(' ')}`);
    
    const isNetwork = isNetworkCommand(cmd, args);
    console.log(`   Network Command: ${isNetwork ? '✅ Yes' : '❌ No'}`);
    
    if (isNetwork) {
      const targets = extractNetworkTargets(cmd, args);
      console.log(`   Extracted Targets: ${targets.length}`);
      targets.forEach((target, i) => {
        console.log(`     ${i + 1}. ${target.host}:${target.port || 'default'} (${target.protocol || 'unknown'}) - Confidence: ${target.confidence}`);
      });
    }
  });
}

async function demonstrateTargetValidation() {
  console.log('\n🛡️  NETWORK TARGET VALIDATION DEMO');
  console.log('====================================');
  
  const testTargets = [
    { host: 'github.com', port: 443 },
    { host: 'malicious-site.com', port: 80 },
    { host: 'api.github.com', port: 443 },
    { host: 'suspicious.onion', port: 80 },
    { host: 'registry.npmjs.org', port: 443 },
    { host: 'github.com', port: 8080 } // Wrong port
  ];

  const allowedHosts = ['github.com', 'registry.npmjs.org'];
  const allowedPorts = [80, 443];

  testTargets.forEach(target => {
    const validation = validateNetworkTarget(target, allowedHosts, allowedPorts);
    console.log(`\n🎯 Target: ${target.host}:${target.port}`);
    console.log(`   Allowed: ${validation.allowed ? '✅ Yes' : '❌ No'}`);
    if (!validation.allowed) {
      console.log(`   Reason: ${validation.reason}`);
    }
  });
}

async function demonstrateSecurityModes() {
  console.log('\n🔐 SECURITY MODES COMPARISON');
  console.log('=============================');
  
  const securityWrapper = new SecurityWrapper({
    strict_mode: false,
    enable_logging: true,
    config_dir: '/tmp/maf-demo'
  });

  const monitoringContext = createSecurityContext(monitoringProfile, 'monitoring-demo', 'demo-001');
  const strictContext = createSecurityContext(strictProfile, 'strict-demo', 'demo-002');

  console.log('\n📋 Monitoring Mode Configuration:');
  try {
    const monitoringResult = await securityWrapper.applySecurityWrapper(monitoringContext);
    console.log(`   ✅ Security wrapper applied successfully`);
    console.log(`   📄 Proxychains config: ${monitoringResult.sandboxConfig.proxychains_config}`);
    
    // Read and display monitoring config
    const fs = require('fs');
    if (fs.existsSync(monitoringResult.sandboxConfig.proxychains_config)) {
      const config = fs.readFileSync(monitoringResult.sandboxConfig.proxychains_config, 'utf8');
      console.log('   📝 Config contains monitoring settings:', config.includes('MONITORING ONLY MODE'));
    }
    
    await monitoringResult.cleanup();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n📋 Strict Mode Configuration:');
  try {
    const strictResult = await securityWrapper.applySecurityWrapper(strictContext);
    console.log(`   ✅ Security wrapper applied successfully`);
    console.log(`   📄 Proxychains config: ${strictResult.sandboxConfig.proxychains_config}`);
    
    // Read and display strict config
    const fs = require('fs');
    if (fs.existsSync(strictResult.sandboxConfig.proxychains_config)) {
      const config = fs.readFileSync(strictResult.sandboxConfig.proxychains_config, 'utf8');
      console.log('   📝 Config contains monitoring settings:', config.includes('MONITORING ONLY MODE'));
    }
    
    await strictResult.cleanup();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function demonstrateCommandExecution() {
  console.log('\n⚡ COMMAND EXECUTION DEMO');
  console.log('============================');
  
  const securityWrapper = new SecurityWrapper({
    strict_mode: false,
    enable_logging: true,
    config_dir: '/tmp/maf-demo-execution'
  });

  const monitoringContext = createSecurityContext(monitoringProfile, 'execution-demo', 'demo-003');
  const strictContext = createSecurityContext(strictProfile, 'execution-demo', 'demo-004');

  const testCommands = [
    { cmd: 'echo', args: ['Hello, World!'], description: 'Simple local command' },
    { cmd: 'curl', args: ['--version'], description: 'Network command (allowed target)' },
    { cmd: 'curl', args: ['-s', 'https://github.com'], description: 'Network command (allowed host)' }
  ];

  console.log('\n🔍 Monitoring Mode Execution:');
  try {
    const { executeCommand, cleanup } = await securityWrapper.applySecurityWrapper(monitoringContext);
    
    for (const { cmd, args, description } of testCommands) {
      console.log(`\n   🎯 ${description}`);
      console.log(`   Command: ${cmd} ${args.join(' ')}`);
      
      try {
        const startTime = Date.now();
        const result = await executeCommand(cmd, args);
        const duration = Date.now() - startTime;
        
        console.log(`   ✅ Success (exit: ${result.code}, ${duration}ms)`);
        if (result.stdout.trim()) {
          console.log(`   Output: ${result.stdout.trim().substring(0, 100)}${result.stdout.length > 100 ? '...' : ''}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    await cleanup();
  } catch (error) {
    console.log(`   ❌ Setup error: ${error.message}`);
  }

  console.log('\n🔒 Strict Mode Execution:');
  try {
    const { executeCommand, cleanup } = await securityWrapper.applySecurityWrapper(strictContext);
    
    for (const { cmd, args, description } of testCommands) {
      console.log(`\n   🎯 ${description}`);
      console.log(`   Command: ${cmd} ${args.join(' ')}`);
      
      try {
        const startTime = Date.now();
        const result = await executeCommand(cmd, args);
        const duration = Date.now() - startTime;
        
        console.log(`   ✅ Success (exit: ${result.code}, ${duration}ms)`);
        if (result.stdout.trim()) {
          console.log(`   Output: ${result.stdout.trim().substring(0, 100)}${result.stdout.length > 100 ? '...' : ''}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    await cleanup();
  } catch (error) {
    console.log(`   ❌ Setup error: ${error.message}`);
  }
}

async function demonstratePerformanceMetrics() {
  console.log('\n📊 PERFORMANCE METRICS DEMO');
  console.log('============================');

  const securityWrapper = new SecurityWrapper({
    strict_mode: false,
    enable_logging: true,
    config_dir: '/tmp/maf-demo-performance'
  });

  const monitoringContext = createSecurityContext(monitoringProfile, 'performance-demo', 'demo-005');

  console.log('\n⏱️  Measuring security overhead...');

  try {
    const { executeCommand, cleanup } = await securityWrapper.applySecurityWrapper(monitoringContext);

    const iterations = 10;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await executeCommand('echo', [`test-${i}`]);
      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    console.log(`   📈 Results over ${iterations} iterations:`);
    console.log(`      Average: ${avgTime.toFixed(2)}ms`);
    console.log(`      Min: ${minTime.toFixed(2)}ms`);
    console.log(`      Max: ${maxTime.toFixed(2)}ms`);
    console.log(`      Within 50ms budget: ${avgTime < 50 ? '✅ Yes' : '❌ No'}`);

    await cleanup();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Enhanced Network Monitoring Demo Functions

async function demonstrateLiveTrafficPatterns() {
  console.log('\n🌊 LIVE TRAFFIC PATTERN ANALYSIS DEMO');
  console.log('=====================================');

  if (!EnhancedNetworkMonitoring) {
    console.log('   ❌ Enhanced network monitoring not available');
    return;
  }

  try {
    // Initialize enhanced monitoring
    const monitoring = new EnhancedNetworkMonitoring({
      enable_connection_tracking: true,
      enable_bandwidth_monitoring: true,
      enable_traffic_analysis: true,
      enable_protocol_analysis: true,
      performance_budget: {
        connection_tracking_overhead: 5,
        bandwidth_monitoring_overhead: 3,
        traffic_analysis_overhead: 4,
        protocol_analysis_overhead: 3,
        total_max_overhead: 15
      }
    });

    console.log('   🚀 Starting enhanced network monitoring...');
    await monitoring.start();

    // Simulate some network traffic
    console.log('   📡 Simulating network traffic patterns...');

    // Mock traffic data for demonstration
    const mockTrafficFlows = [
      {
        id: 'flow-001',
        source_ip: '192.168.1.100',
        dest_ip: '52.94.236.248',
        dest_port: 443,
        protocol: 'tcp',
        bytes: 2048,
        risk: { score: 15, factors: ['trusted_destination'] }
      },
      {
        id: 'flow-002',
        source_ip: '192.168.1.100',
        dest_ip: '203.0.113.45',
        dest_port: 80,
        protocol: 'tcp',
        bytes: 512,
        risk: { score: 65, factors: ['suspicious_geolocation', 'unusual_port'] }
      },
      {
        id: 'flow-003',
        source_ip: '192.168.1.100',
        dest_ip: '8.8.8.8',
        dest_port: 53,
        protocol: 'udp',
        bytes: 128,
        risk: { score: 5, factors: ['dns_query'] }
      }
    ];

    console.log('\n   📈 Traffic Flow Analysis:');
    mockTrafficFlows.forEach((flow, index) => {
      const riskColor = flow.risk.score < 30 ? '🟢' : flow.risk.score < 70 ? '🟡' : '🔴';
      console.log(`      ${index + 1}. ${riskColor} ${flow.source_ip} → ${flow.dest_ip}:${flow.dest_port} (${flow.protocol})`);
      console.log(`         Bytes: ${flow.bytes} | Risk Score: ${flow.risk.score}/100 | Factors: ${flow.risk.factors.join(', ')}`);
    });

    // Show behavioral patterns
    console.log('\n   🧠 Behavioral Pattern Detection:');
    const mockPatterns = [
      {
        name: 'Periodic Data Exfiltration',
        severity: 'high',
        confidence: 85,
        description: 'Regular outbound connections to unusual destinations with consistent timing'
      },
      {
        name: 'DNS Tunneling Detection',
        severity: 'medium',
        confidence: 72,
        description: 'High volume of DNS queries with unusually long domain names'
      }
    ];

    mockPatterns.forEach((pattern, index) => {
      const severityColor = pattern.severity === 'high' ? '🔴' : pattern.severity === 'medium' ? '🟡' : '🟢';
      console.log(`      ${index + 1}. ${severityColor} ${pattern.name} (Confidence: ${pattern.confidence}%)`);
      console.log(`         ${pattern.description}`);
    });

    // Get monitoring status
    const status = monitoring.getMonitoringStatus();
    console.log('\n   📊 Monitoring Status:');
    console.log(`      Active Components: ${status.active_components.join(', ')}`);
    console.log(`      Total Connections: ${status.total_connections}`);
    console.log(`      Total Flows: ${status.total_flows}`);
    console.log(`      Uptime: ${status.uptime_seconds}s`);

    // Get security insights
    const insights = monitoring.getSecurityInsights();
    console.log('\n   🔍 Security Insights:');
    console.log(`      High Risk Connections: ${insights.high_risk_connections}`);
    console.log(`      Suspicious Flows: ${insights.suspicious_flows}`);
    console.log(`      Threats Detected: ${insights.threats_detected}`);
    console.log(`      Bandwidth Anomalies: ${insights.bandwidth_anomalies}`);

    if (insights.recommendations.length > 0) {
      console.log('   💡 Recommendations:');
      insights.recommendations.forEach((rec, index) => {
        console.log(`      ${index + 1}. ${rec}`);
      });
    }

    await monitoring.stop();
    console.log('   ✅ Enhanced monitoring demo completed');

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function demonstrateAnomalyDetection() {
  console.log('\n🚨 ANOMALY DETECTION DEMO');
  console.log('===========================');

  if (!EnhancedNetworkMonitoring) {
    console.log('   ❌ Enhanced network monitoring not available');
    return;
  }

  try {
    const monitoring = new EnhancedNetworkMonitoring({
      enable_connection_tracking: true,
      enable_traffic_analysis: true,
      alerts: {
        enable_connection_anomaly_alerts: true,
        enable_threat_detection_alerts: true
      }
    });

    await monitoring.start();

    // Mock anomaly detection scenarios
    console.log('   🔍 Analyzing network behavior for anomalies...');

    const mockAnomalies = [
      {
        type: 'connection_spike',
        severity: 'medium',
        description: 'Unusual spike in outbound connections (50+ connections in 60s)',
        source: '192.168.1.100',
        timestamp: new Date().toISOString(),
        risk_score: 75
      },
      {
        type: 'data_volume_anomaly',
        severity: 'high',
        description: 'Large data transfer to unknown destination (500MB+)',
        source: '192.168.1.100',
        destination: '203.0.113.45',
        timestamp: new Date().toISOString(),
        risk_score: 92
      },
      {
        type: 'protocol_anomaly',
        severity: 'medium',
        description: 'Unusual protocol usage detected (ICMP tunneling suspected)',
        source: '192.168.1.100',
        timestamp: new Date().toISOString(),
        risk_score: 68
      }
    ];

    console.log('\n   🚨 Detected Anomalies:');
    mockAnomalies.forEach((anomaly, index) => {
      const severityIcon = anomaly.severity === 'high' ? '🔴' : '🟡';
      console.log(`      ${index + 1}. ${severityIcon} ${anomaly.type.toUpperCase()}`);
      console.log(`         Risk Score: ${anomaly.risk_score}/100`);
      console.log(`         Description: ${anomaly.description}`);
      console.log(`         Source: ${anomaly.source}${anomaly.destination ? ' → ' + anomaly.destination : ''}`);
      console.log(`         Time: ${new Date(anomaly.timestamp).toLocaleString()}`);
      console.log();
    });

    // Simulate real-time alert system
    console.log('   📢 Real-time Alert System:');

    monitoring.on('network_event', (event) => {
      if (event.event_type === 'security_threat' || event.event_type === 'traffic_pattern_detected') {
        const alertIcon = event.severity === 'critical' ? '🚨' : event.severity === 'high' ? '⚠️' : 'ℹ️';
        console.log(`      ${alertIcon} [${event.source.toUpperCase()}] ${event.message}`);
      }
    });

    // Simulate some network events
    setTimeout(() => {
      monitoring.emit('network_event', {
        event_type: 'traffic_pattern_detected',
        source: 'traffic_analyzer',
        severity: 'warning',
        message: 'Suspicious traffic pattern detected: Multiple connections to high-risk destinations',
        timestamp: Date.now(),
        data: { pattern_type: 'destination_clustering', risk_score: 78 }
      });
    }, 100);

    setTimeout(() => {
      monitoring.emit('network_event', {
        event_type: 'security_threat',
        source: 'protocol_analyzer',
        severity: 'high',
        message: 'Attack signature matched: Potential SQL injection attempt',
        timestamp: Date.now(),
        data: { signature: 'sql_injection', confidence: 89 }
      });
    }, 200);

    // Wait for events to be processed
    await new Promise(resolve => setTimeout(resolve, 300));

    await monitoring.stop();
    console.log('   ✅ Anomaly detection demo completed');

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function demonstrateProtocolAnalysis() {
  console.log('\n🔬 PROTOCOL ANALYSIS DEMO');
  console.log('==========================');

  if (!EnhancedNetworkMonitoring) {
    console.log('   ❌ Enhanced network monitoring not available');
    return;
  }

  try {
    const monitoring = new EnhancedNetworkMonitoring({
      enable_protocol_analysis: true,
      enable_deep_inspection: true
    });

    await monitoring.start();

    // Mock protocol analysis scenarios
    console.log('   🔍 Analyzing network protocols for threats...');

    const mockProtocols = [
      {
        protocol: 'HTTP',
        payload: 'GET /admin/config.php HTTP/1.1\r\nHost: target.com\r\nUser-Agent: sqlmap/1.0',
        analysis: {
          detected: true,
          threats: ['sql_injection_attempt', 'admin_access_bypass'],
          confidence: 92,
          severity: 'high'
        }
      },
      {
        protocol: 'DNS',
        payload: 'c2a31b8d9e7f.example.com',
        analysis: {
          detected: true,
          threats: ['dns_tunneling'],
          confidence: 78,
          severity: 'medium'
        }
      },
      {
        protocol: 'HTTPS',
        payload: 'Encrypted TLS handshake with suspicious certificate',
        analysis: {
          detected: true,
          threats: ['suspicious_certificate'],
          confidence: 65,
          severity: 'medium'
        }
      }
    ];

    console.log('\n   🔬 Protocol Analysis Results:');
    mockProtocols.forEach((proto, index) => {
      const severityIcon = proto.analysis.severity === 'high' ? '🔴' : proto.analysis.severity === 'medium' ? '🟡' : '🟢';
      console.log(`      ${index + 1}. ${severityIcon} ${proto.protocol} Protocol`);
      console.log(`         Threats Detected: ${proto.analysis.threats.join(', ')}`);
      console.log(`         Confidence: ${proto.analysis.confidence}%`);
      console.log(`         Sample Payload: ${proto.payload.substring(0, 50)}...`);
      console.log();
    });

    // Demonstrate signature matching
    console.log('   🎯 Threat Intelligence Signature Matching:');

    const mockSignatures = [
      {
        name: 'SQL Injection Pattern',
        pattern: /(union|select|insert|update|delete|drop|create|alter)/i,
        severity: 'high',
        matches: 3
      },
      {
        name: 'Command Injection',
        pattern: /(;|\||&)(rm|wget|curl|nc|netcat)/i,
        severity: 'critical',
        matches: 1
      },
      {
        name: 'Directory Traversal',
        pattern: /(\.\.[\/\\])/i,
        severity: 'medium',
        matches: 2
      }
    ];

    mockSignatures.forEach((sig, index) => {
      const severityIcon = sig.severity === 'critical' ? '🚨' : sig.severity === 'high' ? '🔴' : '🟡';
      console.log(`      ${index + 1}. ${severityIcon} ${sig.name}`);
      console.log(`         Pattern: ${sig.pattern}`);
      console.log(`         Matches: ${sig.matches} occurrences`);
    });

    await monitoring.stop();
    console.log('   ✅ Protocol analysis demo completed');

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function demonstrateLiveVisualization() {
  console.log('\n📈 LIVE TRAFFIC VISUALIZATION DEMO');
  console.log('===================================');

  // Simulate real-time traffic visualization
  console.log('   📊 Starting live traffic visualization...');

  const trafficData = [];
  const maxDataPoints = 20;

  // Generate simulated real-time data
  for (let i = 0; i < maxDataPoints; i++) {
    const timestamp = new Date(Date.now() - (maxDataPoints - i) * 1000);
    const inbound = Math.floor(Math.random() * 1000) + 500;
    const outbound = Math.floor(Math.random() * 800) + 200;
    const connections = Math.floor(Math.random() * 50) + 10;

    trafficData.push({
      timestamp: timestamp.toLocaleTimeString(),
      inbound: inbound,
      outbound: outbound,
      total: inbound + outbound,
      connections: connections
    });
  }

  // Display ASCII chart
  console.log('\n   📈 Network Traffic (last 20 seconds):');
  console.log('      Time       │ In  │ Out │ Total │ Connections');
  console.log('      ───────────┼─────┼─────┼───────┼────────────');

  trafficData.forEach((data, index) => {
    const inboundBar = '█'.repeat(Math.min(Math.floor(data.inbound / 100), 10));
    const outboundBar = '▓'.repeat(Math.min(Math.floor(data.outbound / 100), 10));

    console.log(`      ${data.timestamp} │ ${inboundBar.padEnd(10)} │ ${outboundBar.padEnd(10)} │ ${data.total.toString().padStart(5)}KB │ ${data.connections}`);
  });

  // Show traffic summary
  const totalInbound = trafficData.reduce((sum, data) => sum + data.inbound, 0);
  const totalOutbound = trafficData.reduce((sum, data) => sum + data.outbound, 0);
  const avgConnections = trafficData.reduce((sum, data) => sum + data.connections, 0) / trafficData.length;

  console.log('\n   📊 Traffic Summary:');
  console.log(`      Total Inbound: ${(totalInbound / 1024).toFixed(2)} MB`);
  console.log(`      Total Outbound: ${(totalOutbound / 1024).toFixed(2)} MB`);
  console.log(`      Average Connections: ${avgConnections.toFixed(1)}`);
  console.log(`      Peak Traffic: ${Math.max(...trafficData.map(d => d.total))} KB`);

  console.log('   ✅ Live visualization demo completed');
}

async function main() {
  console.log('🚀 MAF Advanced Network Security Monitoring Demo');
  console.log('===============================================\n');

  console.log('This demo shows comprehensive network security monitoring capabilities');
  console.log('including traffic analysis, anomaly detection, and protocol inspection.\n');

  try {
    // Core network monitoring features
    await demonstrateNetworkExtraction();
    await demonstrateTargetValidation();
    await demonstrateSecurityModes();
    await demonstrateCommandExecution();
    await demonstratePerformanceMetrics();

    // Enhanced monitoring features
    console.log('\n🎯 Enhanced Network Monitoring Features');
    console.log('=======================================');

    await demonstrateLiveTrafficPatterns();
    await demonstrateAnomalyDetection();
    await demonstrateProtocolAnalysis();
    await demonstrateLiveVisualization();

    console.log('\n✅ Demo completed successfully!');
    console.log('\n🔧 Key features demonstrated:');
    console.log('  • Network domain extraction and validation');
    console.log('  • Security modes (monitoring vs strict)');
    console.log('  • Command execution with monitoring');
    console.log('  • Performance overhead measurement');
    console.log('  • 🆕 Live traffic pattern analysis');
    console.log('  • 🆕 Real-time anomaly detection');
    console.log('  • 🆕 Protocol analysis and threat detection');
    console.log('  • 🆕 Interactive traffic visualization');
    console.log('  • 🆕 Behavioral pattern recognition');
    console.log('  • 🆕 Security insights and recommendations');

    console.log('\n💡 Integration Benefits:');
    console.log('  • Unified NetworkMonitoringExtension interface');
    console.log('  • CPX41 performance budget compliance');
    console.log('  • Real-time alerting and correlation');
    console.log('  • Comprehensive threat intelligence');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    const fs = require('fs');
    try {
      fs.rmSync('/tmp/maf-demo', { recursive: true, force: true });
      fs.rmSync('/tmp/maf-demo-execution', { recursive: true, force: true });
      fs.rmSync('/tmp/maf-demo-performance', { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  demonstrateNetworkExtraction,
  demonstrateTargetValidation,
  demonstrateSecurityModes,
  demonstrateCommandExecution,
  demonstratePerformanceMetrics,
  demonstrateLiveTrafficPatterns,
  demonstrateAnomalyDetection,
  demonstrateProtocolAnalysis,
  demonstrateLiveVisualization
};
